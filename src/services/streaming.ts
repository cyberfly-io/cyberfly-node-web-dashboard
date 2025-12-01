/**
 * Streaming service using iroh-gossip WASM module for P2P video/audio streaming
 * 
 * This service uses gossip protocol for real-time P2P streaming,
 * based on the browser-chat example from iroh-examples.
 */

// Maximum chunk size for gossip messages (keep under 64KB to be safe)
const MAX_CHUNK_SIZE = 55 * 1024; // 55KB per sub-chunk (leaves room for signature overhead in 64KB limit)

// Types for the WASM module
interface WasmStreamingNode {
  endpoint_id(): string;
  create_stream(name: string): Promise<WasmStream>;
  join_stream(ticket: string, name: string): Promise<WasmStream>;
  shutdown(): Promise<void>;
  free(): void;
}

interface WasmStream {
  sender: WasmStreamSender;
  receiver: ReadableStream<StreamEvent>;
  ticket(opts: TicketOpts): string;
  id(): string;
  neighbors(): string[];
  free(): void;
}

interface WasmStreamSender {
  broadcast_chunk(data: Uint8Array, sequence: number): Promise<void>;
  send_presence(): Promise<void>;
  set_name(name: string): void;
  send_signal(data: Uint8Array): Promise<void>;
}

interface WasmModule {
  default: (input?: RequestInfo | URL) => Promise<void>;
  StreamingNode: {
    spawn(): Promise<WasmStreamingNode>;
    get_quality_constraints(quality: string): string;
  };
}

// Stream event types matching Rust enum
export interface StreamEvent {
  type: 'neighborUp' | 'neighborDown' | 'presence' | 'mediaChunk' | 'signal' | 'lagged';
  endpointId?: string;
  from?: string;
  name?: string;
  data?: number[];
  sequence?: number;
  timestamp?: number;
  sentTimestamp?: number;
}

// WebRTC signaling message types (sent as mediaChunk with special sequence numbers)
export interface WebRTCSignal {
  type: 'webrtc-offer' | 'webrtc-answer' | 'webrtc-ice-candidate' | 'webrtc-request-offer';
  from: string;
  to?: string; // Optional target peer, if empty = broadcast
  sdp?: string; // For offer/answer
  candidate?: RTCIceCandidateInit; // For ICE candidate
}

/**
 * Encode a WebRTC signal message to bytes
 */
export function encodeWebRTCSignal(signal: WebRTCSignal): Uint8Array {
  const json = JSON.stringify(signal);
  return new TextEncoder().encode(json);
}

/**
 * Decode a WebRTC signal message from bytes
 */
export function decodeWebRTCSignal(data: Uint8Array): WebRTCSignal | null {
  try {
    const json = new TextDecoder().decode(data);
    const parsed = JSON.parse(json);
    if (parsed.type && parsed.type.startsWith('webrtc-')) {
      return parsed as WebRTCSignal;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a sequence number indicates a WebRTC signal
 */
export function isWebRTCSignalSequence(sequence: number): boolean {
  return sequence < 0 && sequence >= -10;
}

export interface TicketOpts {
  includeMyself: boolean;
  includeBootstrap: boolean;
  includeNeighbors: boolean;
}

export interface QualityConstraints {
  width: number;
  height: number;
  framerate: number;
  audioBitrate: number;
}

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

let wasm: WasmModule | null = null;
let wasmInitialized = false;
let streamingNode: WasmStreamingNode | null = null;

/**
 * Load the WASM module dynamically
 */
async function loadWasmModule(): Promise<WasmModule> {
  if (wasm) return wasm;
  
  const dynamicImport = new Function('url', 'return import(url)');
  const module = await dynamicImport('/wasm/iroh_streaming.js');
  wasm = module as WasmModule;
  return wasm;
}

/**
 * Initialize the WASM module
 */
export async function initWasm(): Promise<void> {
  if (wasmInitialized) return;
  
  try {
    console.log('[Streaming] Initializing WASM module...');
    const module = await loadWasmModule();
    await module.default();
    wasmInitialized = true;
    console.log('[Streaming] WASM module initialized');
  } catch (error) {
    console.error('[Streaming] Failed to initialize WASM:', error);
    throw error;
  }
}

/**
 * Get or create the streaming node
 */
export async function getStreamingNode(): Promise<WasmStreamingNode> {
  if (!wasmInitialized) {
    await initWasm();
  }
  
  if (!streamingNode && wasm) {
    console.log('[Streaming] Spawning streaming node...');
    streamingNode = await wasm.StreamingNode.spawn();
    console.log('[Streaming] Node spawned with ID:', streamingNode.endpoint_id());
  }
  
  if (!streamingNode) {
    throw new Error('Failed to create streaming node');
  }
  
  return streamingNode;
}

/**
 * Get the current node's endpoint ID
 */
export async function getEndpointId(): Promise<string> {
  const node = await getStreamingNode();
  return node.endpoint_id();
}

/**
 * Stream channel wrapper
 */
export class StreamChannel {
  private channel: WasmStream;
  private eventListeners: Map<string, ((event: StreamEvent) => void)[]> = new Map();
  private isRunning = false;
  
  // For reassembling chunked media
  private pendingChunks: Map<number, { chunks: Map<number, Uint8Array>, totalParts: number, from: string, timestamp: number }> = new Map();

  constructor(channel: WasmStream) {
    this.channel = channel;
  }

  /**
   * Start listening for events
   */
  startListening(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const reader = this.channel.receiver.getReader();
    console.log('[Streaming] Reader obtained, starting event loop...');
    
    (async () => {
      try {
        console.log('[Streaming] Event loop started, waiting for events...');
        while (this.isRunning) {
          console.log('[Streaming] Calling reader.read()...');
          const { done, value } = await reader.read();
          console.log('[Streaming] reader.read() returned:', { done, hasValue: !!value });
          if (done) break;
          
          const event = value as StreamEvent;
          console.log('[Streaming] Event received:', event.type, 'seq:', event.sequence);
          
          // Handle dedicated signal events
          if (event.type === 'signal' && event.data) {
            const listeners = this.eventListeners.get('signal') || [];
            listeners.forEach(cb => cb(event));
            const allListeners = this.eventListeners.get('all') || [];
            allListeners.forEach(cb => cb(event));
            continue;
          }

          // Handle chunked media reassembly
          if (event.type === 'mediaChunk' && event.data && event.sequence !== undefined) {
            const reassembled = this.handleChunkedMedia(event);
            if (reassembled) {
              // Replace the event with the reassembled data
              event.data = Array.from(reassembled);
              // Emit reassembled event
              const listeners = this.eventListeners.get('mediaChunk') || [];
              listeners.forEach(cb => cb(event));
              const allListeners = this.eventListeners.get('all') || [];
              allListeners.forEach(cb => cb(event));
            }
            // If not reassembled yet, don't emit (waiting for more parts)
            continue;
          }
          
          // Emit to listeners
          const listeners = this.eventListeners.get(event.type) || [];
          listeners.forEach(cb => cb(event));
          
          // Also emit to 'all' listeners
          const allListeners = this.eventListeners.get('all') || [];
          allListeners.forEach(cb => cb(event));
        }
      } catch (err) {
        console.error('[Streaming] Reader error:', err);
      } finally {
        reader.releaseLock();
      }
    })();
  }
  
  /**
   * Handle chunked media reassembly
   * Sequence format: frameNumber * 10000 + partNumber (partNumber 0 = single chunk or last part marker)
   */
  private handleChunkedMedia(event: StreamEvent): Uint8Array | null {
    if (!event.data || event.sequence === undefined) return null;
    
    const sequence = event.sequence;
    const frameNumber = Math.floor(sequence / 10000);
    const partInfo = sequence % 10000;
    
    // Check if this is a header chunk (partInfo encodes totalParts in high bits)
    // Format: partNumber + (totalParts * 100) where partNumber is 0-99
    const partNumber = partInfo % 100;
    const totalParts = Math.floor(partInfo / 100);
    
    console.log(`[Streaming] Received chunk: frame=${frameNumber}, part=${partNumber}, totalParts=${totalParts || 'single'}`);
    
    // If totalParts is 0 or 1, this is a single-chunk frame
    if (totalParts <= 1 && partNumber === 0) {
      console.log(`[Streaming] Single-chunk frame ${frameNumber}, ${event.data.length} bytes`);
      return new Uint8Array(event.data);
    }
    
    // Multi-part frame - store and wait for all parts
    if (!this.pendingChunks.has(frameNumber)) {
      this.pendingChunks.set(frameNumber, {
        chunks: new Map(),
        totalParts: totalParts || 1,
        from: event.from || '',
        timestamp: event.timestamp || Date.now(),
      });
    }
    
    const pending = this.pendingChunks.get(frameNumber)!;
    pending.chunks.set(partNumber, new Uint8Array(event.data));
    
    // Update totalParts if we get a chunk with this info
    if (totalParts > 0) {
      pending.totalParts = totalParts;
    }
    
    console.log(`[Streaming] Frame ${frameNumber}: ${pending.chunks.size}/${pending.totalParts} parts received`);
    
    // Check if we have all parts
    if (pending.chunks.size >= pending.totalParts) {
      // Reassemble in order
      const parts: Uint8Array[] = [];
      for (let i = 0; i < pending.totalParts; i++) {
        const chunk = pending.chunks.get(i);
        if (chunk) {
          parts.push(chunk);
        } else {
          console.warn(`[Streaming] Missing part ${i} of frame ${frameNumber}`);
          this.pendingChunks.delete(frameNumber);
          return null;
        }
      }
      
      // Combine all parts
      const totalSize = parts.reduce((sum, p) => sum + p.length, 0);
      const combined = new Uint8Array(totalSize);
      let offset = 0;
      for (const part of parts) {
        combined.set(part, offset);
        offset += part.length;
      }
      
      console.log(`[Streaming] Reassembled frame ${frameNumber}: ${totalSize} bytes from ${pending.totalParts} parts`);
      this.pendingChunks.delete(frameNumber);
      
      // Clean up old pending chunks (older than 5 seconds)
      const now = Date.now();
      for (const [fn, p] of this.pendingChunks) {
        if (now - p.timestamp > 5000) {
          console.warn(`[Streaming] Dropping incomplete frame ${fn}`);
          this.pendingChunks.delete(fn);
        }
      }
      
      return combined;
    }
    
    return null; // Not all parts received yet
  }

  /**
   * Stop listening
   */
  stopListening(): void {
    this.isRunning = false;
  }

  /**
   * Add event listener
   */
  on(eventType: string, callback: (event: StreamEvent) => void): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(callback);
  }

  /**
   * Remove event listener
   */
  off(eventType: string, callback: (event: StreamEvent) => void): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const idx = listeners.indexOf(callback);
      if (idx >= 0) listeners.splice(idx, 1);
    }
  }

  /**
   * Broadcast a media chunk (automatically splits large chunks)
   */
  async broadcastChunk(data: Uint8Array, sequence: number): Promise<void> {
    if (data.length <= MAX_CHUNK_SIZE) {
      // Small enough to send as single chunk
      // Sequence format: frameNumber * 10000 + 0 (single chunk marker)
      const seq = sequence * 10000;
      console.log(`[Streaming] Broadcasting single chunk ${sequence} (${data.length} bytes)`);
      await this.channel.sender.broadcast_chunk(data, seq);
      console.log(`[Streaming] Chunk ${sequence} broadcast complete`);
    } else {
      // Split into multiple chunks
      const totalParts = Math.ceil(data.length / MAX_CHUNK_SIZE);
      console.log(`[Streaming] Splitting chunk ${sequence} (${data.length} bytes) into ${totalParts} parts`);
      
      for (let i = 0; i < totalParts; i++) {
        const start = i * MAX_CHUNK_SIZE;
        const end = Math.min(start + MAX_CHUNK_SIZE, data.length);
        const chunk = data.slice(start, end);
        
        // Sequence format: frameNumber * 10000 + partNumber + (totalParts * 100)
        const seq = sequence * 10000 + i + (totalParts * 100);
        console.log(`[Streaming] Broadcasting part ${i + 1}/${totalParts} of chunk ${sequence} (${chunk.length} bytes)`);
        await this.channel.sender.broadcast_chunk(chunk, seq);
      }
      console.log(`[Streaming] All ${totalParts} parts of chunk ${sequence} broadcast complete`);
    }
  }

  /**
   * Broadcast a WebRTC signaling message
   */
  async broadcastSignal(signal: WebRTCSignal): Promise<void> {
    const data = encodeWebRTCSignal(signal);
    console.log(`[Streaming] Broadcasting WebRTC signal: ${signal.type}`);
    await this.channel.sender.send_signal(data);
  }

  /**
   * Send a presence announcement
   */
  async sendPresence(): Promise<void> {
    await this.channel.sender.send_presence();
  }

  /**
   * Set broadcaster name
   */
  setName(name: string): void {
    this.channel.sender.set_name(name);
  }

  /**
   * Get stream ticket for sharing
   */
  getTicket(opts: Partial<TicketOpts> = {}): string {
    const fullOpts: TicketOpts = {
      includeMyself: opts.includeMyself ?? true,
      includeBootstrap: opts.includeBootstrap ?? true,
      includeNeighbors: opts.includeNeighbors ?? true,
    };
    return this.channel.ticket(fullOpts);
  }

  /**
   * Get topic ID
   */
  getTopicId(): string {
    return this.channel.id();
  }

  /**
   * Get current neighbors
   */
  getNeighbors(): string[] {
    return this.channel.neighbors();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopListening();
    this.channel.free();
  }
}

/**
 * Create a new stream (broadcaster)
 */
export async function createStream(name: string): Promise<StreamChannel> {
  console.log('[Streaming] Creating stream:', name);
  const node = await getStreamingNode();
  const channel = await node.create_stream(name);
  const wrapper = new StreamChannel(channel);
  wrapper.startListening();
  return wrapper;
}

/**
 * Join an existing stream (viewer)
 */
export async function joinStream(ticket: string, name: string): Promise<StreamChannel> {
  console.log('[Streaming] Joining stream...');
  const node = await getStreamingNode();
  console.log('[Streaming] Got node, joining with ticket...');
  
  // Add timeout to prevent indefinite hanging
  const joinPromise = node.join_stream(ticket, name);
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Join timeout - could not connect to broadcaster within 30 seconds')), 30000);
  });
  
  const channel = await Promise.race([joinPromise, timeoutPromise]);
  console.log('[Streaming] Channel created, starting listener...');
  const wrapper = new StreamChannel(channel);
  wrapper.startListening();
  console.log('[Streaming] Listener started, ready to receive events');
  return wrapper;
}

/**
 * Get video constraints for a quality preset
 */
export function getQualityConstraints(quality: QualityPreset): QualityConstraints {
  const constraints: Record<QualityPreset, QualityConstraints> = {
    low: { width: 640, height: 360, framerate: 15, audioBitrate: 32000 },
    medium: { width: 854, height: 480, framerate: 24, audioBitrate: 64000 },
    high: { width: 1280, height: 720, framerate: 30, audioBitrate: 128000 },
    ultra: { width: 1920, height: 1080, framerate: 30, audioBitrate: 192000 },
  };
  return constraints[quality];
}

/**
 * Media recorder helper for capturing video/audio
 */
export class MediaStreamRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private onDataCallback: ((data: Uint8Array) => void) | null = null;
  private stream: MediaStream;
  private mimeType: string;
  
  constructor(stream: MediaStream, mimeType: string = 'video/webm;codecs=vp9,opus') {
    this.stream = stream;
    this.mimeType = mimeType;
    
    const supportedTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    
    for (const type of supportedTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        this.mimeType = type;
        break;
      }
    }
    
    console.log('[Streaming] Using mime type:', this.mimeType);
  }
  
  start(onData: (data: Uint8Array) => void, intervalMs: number = 500): void {
    this.onDataCallback = onData;
    
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: 1000000, // 1 Mbps to keep chunks smaller
      audioBitsPerSecond: 64000,
    });
    
    this.mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        const arrayBuffer = await event.data.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        this.onDataCallback?.(data);
      }
    };
    
    this.mediaRecorder.onerror = (event) => {
      console.error('[Streaming] MediaRecorder error:', event);
    };
    
    this.mediaRecorder.start(intervalMs);
    console.log('[Streaming] Recording started');
  }
  
  stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      console.log('[Streaming] Recording stopped');
    }
  }
  
  get state(): RecordingState {
    return this.mediaRecorder?.state ?? 'inactive';
  }
}

/**
 * Get user media with quality constraints
 */
export async function getUserMedia(
  quality: QualityPreset,
  video: boolean = true,
  audio: boolean = true
): Promise<MediaStream> {
  const constraints = getQualityConstraints(quality);
  
  const mediaConstraints: MediaStreamConstraints = {
    video: video ? {
      width: { ideal: constraints.width },
      height: { ideal: constraints.height },
      frameRate: { ideal: constraints.framerate },
    } : false,
    audio: audio ? {
      sampleRate: 48000,
      channelCount: 2,
      echoCancellation: true,
      noiseSuppression: true,
    } : false,
  };
  
  return navigator.mediaDevices.getUserMedia(mediaConstraints);
}

/**
 * Get screen capture
 */
export async function getDisplayMedia(quality: QualityPreset): Promise<MediaStream> {
  const constraints = getQualityConstraints(quality);
  
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: constraints.width },
      height: { ideal: constraints.height },
      frameRate: { ideal: constraints.framerate },
    },
    audio: true,
  });
}

/**
 * WebRTC configuration with STUN/TURN servers
 */
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

/**
 * Create an RTCPeerConnection for broadcasting (adding local tracks)
 */
export function createBroadcasterPeerConnection(
  stream: MediaStream,
  onIceCandidate: (candidate: RTCIceCandidate) => void,
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void
): RTCPeerConnection {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  
  // Add all tracks from the media stream
  stream.getTracks().forEach(track => {
    console.log('[WebRTC] Adding track to peer connection:', track.kind);
    pc.addTrack(track, stream);
  });
  
  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('[WebRTC] ICE candidate:', event.candidate.candidate?.substring(0, 50));
      onIceCandidate(event.candidate);
    }
  };
  
  // Handle connection state changes
  pc.onconnectionstatechange = () => {
    console.log('[WebRTC] Connection state:', pc.connectionState);
    onConnectionStateChange?.(pc.connectionState);
  };
  
  pc.oniceconnectionstatechange = () => {
    console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
  };
  
  return pc;
}

/**
 * Create an RTCPeerConnection for watching (receiving remote tracks)
 */
export function createViewerPeerConnection(
  onTrack: (event: RTCTrackEvent) => void,
  onIceCandidate: (candidate: RTCIceCandidate) => void,
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void
): RTCPeerConnection {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  
  // Handle incoming tracks
  pc.ontrack = (event) => {
    console.log('[WebRTC] Received track:', event.track.kind);
    onTrack(event);
  };
  
  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('[WebRTC] ICE candidate:', event.candidate.candidate?.substring(0, 50));
      onIceCandidate(event.candidate);
    }
  };
  
  // Handle connection state changes
  pc.onconnectionstatechange = () => {
    console.log('[WebRTC] Connection state:', pc.connectionState);
    onConnectionStateChange?.(pc.connectionState);
  };
  
  pc.oniceconnectionstatechange = () => {
    console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
  };
  
  return pc;
}

/**
 * Clean up resources
 */
export async function cleanup(): Promise<void> {
  if (streamingNode) {
    await streamingNode.shutdown();
    streamingNode.free();
    streamingNode = null;
  }
}
