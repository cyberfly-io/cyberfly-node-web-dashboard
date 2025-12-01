/**
 * P2P Video File Streaming Service
 * 
 * Uses gossip protocol for distributing video file chunks.
 * Viewers share bandwidth by relaying chunks to other peers.
 * 
 * This is different from live streaming (WebRTC):
 * - Live: WebRTC for real-time, low-latency camera/screen
 * - File: Gossip chunks + MSE for pre-recorded videos with peer-assisted delivery
 */

import { StreamChannel, decodeWebRTCSignal } from './streaming';
import type { StreamEvent } from './streaming';
import type { WebRTCSignal } from './streaming';

// Chunk size for video file streaming (smaller for better distribution)
const VIDEO_CHUNK_SIZE = 64 * 1024; // 64KB chunks

// Message types for video file streaming
export interface VideoStreamMessage {
  type: 'video-metadata' | 'video-chunk' | 'video-request-chunk' | 'video-have-chunks' | 'video-request-metadata';
  from: string;
  // Metadata
  fileSize?: number;
  fileName?: string;
  mimeType?: string;
  totalChunks?: number;
  duration?: number;
  // Chunk data
  chunkIndex?: number;
  chunkData?: number[]; // Uint8Array as number[]
  // Chunk availability
  availableChunks?: number[]; // List of chunk indices this peer has
}

/**
 * Encode a video stream message to bytes
 */
export function encodeVideoMessage(message: VideoStreamMessage): Uint8Array {
  const json = JSON.stringify(message);
  return new TextEncoder().encode(json);
}

/**
 * Decode a video stream message from bytes
 */
export function decodeVideoMessage(data: Uint8Array): VideoStreamMessage | null {
  try {
    const json = new TextDecoder().decode(data);
    const parsed = JSON.parse(json);
    if (parsed.type && parsed.type.startsWith('video-')) {
      return parsed as VideoStreamMessage;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Video file metadata
 */
export interface VideoMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  duration?: number;
}

/**
 * Chunk status for tracking
 */
export interface ChunkStatus {
  index: number;
  received: boolean;
  data?: Uint8Array;
  sourcePeer?: string;
}

/**
 * P2P Video File Broadcaster
 * Reads a video file and broadcasts chunks to all peers
 */
export class VideoFileBroadcaster {
  private channel: StreamChannel;
  private file: File;
  private chunks: Uint8Array[] = [];
  private metadata: VideoMetadata;
  private myEndpointId: string;
  private isStreaming = false;
  private currentChunkIndex = 0;
  private onProgress?: (sent: number, total: number) => void;
  private onPeerRequest?: (peerId: string, chunkIndex: number) => void;

  constructor(
    channel: StreamChannel,
    file: File,
    myEndpointId: string
  ) {
    this.channel = channel;
    this.file = file;
    this.myEndpointId = myEndpointId;
    
    const totalChunks = Math.ceil(file.size / VIDEO_CHUNK_SIZE);
    this.metadata = {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'video/mp4',
      totalChunks,
    };
  }

  /**
   * Set progress callback
   */
  setOnProgress(callback: (sent: number, total: number) => void): void {
    this.onProgress = callback;
  }

  /**
   * Set peer request callback
   */
  setOnPeerRequest(callback: (peerId: string, chunkIndex: number) => void): void {
    this.onPeerRequest = callback;
  }

  /**
   * Prepare the video file by reading it into chunks
   */
  async prepare(): Promise<VideoMetadata> {
    console.log('[VideoFile] Preparing file:', this.file.name, 'size:', this.file.size);
    
    const arrayBuffer = await this.file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    // Split into chunks
    this.chunks = [];
    for (let i = 0; i < data.length; i += VIDEO_CHUNK_SIZE) {
      const chunk = data.slice(i, Math.min(i + VIDEO_CHUNK_SIZE, data.length));
      this.chunks.push(chunk);
    }
    
    this.metadata.totalChunks = this.chunks.length;
    console.log('[VideoFile] Prepared', this.chunks.length, 'chunks');
    
    return this.metadata;
  }

  /**
   * Start broadcasting the video file
   */
  async startBroadcast(chunkIntervalMs: number = 100): Promise<void> {
    if (this.isStreaming) return;
    if (this.chunks.length === 0) {
      await this.prepare();
    }
    
    this.isStreaming = true;
    console.log('[VideoFile] Starting broadcast...');
    
    // First, broadcast metadata
    await this.broadcastMetadata();
    
    // Then broadcast chunks with interval
    this.currentChunkIndex = 0;
    
    const broadcastNext = async () => {
      if (!this.isStreaming) return;
      
      if (this.currentChunkIndex < this.chunks.length) {
        await this.broadcastChunk(this.currentChunkIndex);
        this.currentChunkIndex++;
        this.onProgress?.(this.currentChunkIndex, this.chunks.length);
        
        // Schedule next chunk
        setTimeout(broadcastNext, chunkIntervalMs);
      } else {
        console.log('[VideoFile] Broadcast complete');
        // Keep responding to chunk requests from peers
      }
    };
    
    broadcastNext();
  }

  /**
   * Stop broadcasting
   */
  stopBroadcast(): void {
    this.isStreaming = false;
    console.log('[VideoFile] Broadcast stopped');
  }

  /**
   * Broadcast video metadata
   */
  private async broadcastMetadata(): Promise<void> {
    const message: VideoStreamMessage = {
      type: 'video-metadata',
      from: this.myEndpointId,
      fileName: this.metadata.fileName,
      fileSize: this.metadata.fileSize,
      mimeType: this.metadata.mimeType,
      totalChunks: this.metadata.totalChunks,
      duration: this.metadata.duration,
    };
    
    console.log('[VideoFile] Broadcasting metadata:', this.metadata);
    await this.channel.broadcastSignal(message as unknown as WebRTCSignal);
  }

  /**
   * Broadcast a specific chunk
   */
  private async broadcastChunk(index: number): Promise<void> {
    if (index < 0 || index >= this.chunks.length) return;
    
    const chunk = this.chunks[index];
    const message: VideoStreamMessage = {
      type: 'video-chunk',
      from: this.myEndpointId,
      chunkIndex: index,
      chunkData: Array.from(chunk),
    };
    
    // Use the channel's broadcastChunk for media data (handles chunking)
    await this.channel.broadcastChunk(encodeVideoMessage(message), index);
  }

  /**
   * Handle incoming messages (for responding to requests)
   */
  async handleMessage(event: StreamEvent): Promise<void> {
    if (!event.data) {
      console.log('[VideoFile Broadcaster] No data in event');
      return;
    }
    
    const data = new Uint8Array(event.data);
    console.log('[VideoFile Broadcaster] Received data, length:', data.length);
    
    // Try to decode as video message
    const videoMsg = decodeVideoMessage(data);
    if (videoMsg) {
      console.log('[VideoFile Broadcaster] Decoded as video message:', videoMsg.type);
      await this.handleVideoMessage(videoMsg);
      return;
    }
    
    // Also try WebRTC signal format
    const signal = decodeWebRTCSignal(data);
    if (signal) {
      console.log('[VideoFile Broadcaster] Decoded as signal, checking type...');
      const videoSignal = signal as unknown as VideoStreamMessage;
      if (videoSignal.type?.startsWith('video-')) {
        console.log('[VideoFile Broadcaster] Signal is video message:', videoSignal.type);
        await this.handleVideoMessage(videoSignal);
      }
    } else {
      console.log('[VideoFile Broadcaster] Could not decode message');
    }
  }

  /**
   * Handle video stream message
   */
  private async handleVideoMessage(message: VideoStreamMessage): Promise<void> {
    // Ignore our own messages
    if (message.from === this.myEndpointId) return;
    
    switch (message.type) {
      case 'video-request-metadata':
        console.log('[VideoFile] Received metadata request from', message.from.substring(0, 8));
        await this.broadcastMetadata();
        break;
        
      case 'video-request-chunk':
        if (message.chunkIndex !== undefined) {
          await this.handleChunkRequest(message.from, message.chunkIndex);
        }
        break;
    }
  }

  /**
   * Handle chunk request from a peer
   */
  async handleChunkRequest(peerId: string, chunkIndex: number): Promise<void> {
    this.onPeerRequest?.(peerId, chunkIndex);
    
    if (chunkIndex >= 0 && chunkIndex < this.chunks.length) {
      console.log('[VideoFile] Sending requested chunk', chunkIndex, 'to peer', peerId.substring(0, 8));
      await this.broadcastChunk(chunkIndex);
    }
  }

  /**
   * Get metadata
   */
  getMetadata(): VideoMetadata {
    return this.metadata;
  }

  /**
   * Check if has chunk
   */
  hasChunk(index: number): boolean {
    return index >= 0 && index < this.chunks.length;
  }
}

/**
 * P2P Video File Viewer
 * Receives video chunks from broadcaster and other peers
 * Can relay chunks to help other viewers (bandwidth sharing)
 */
export class VideoFileViewer {
  private channel: StreamChannel;
  private myEndpointId: string;
  private metadata: VideoMetadata | null = null;
  private chunks: Map<number, Uint8Array> = new Map();
  private receivedChunks: Set<number> = new Set();
  private pendingRequests: Set<number> = new Set();
  
  // MediaSource for playback
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private appendQueue: { index: number; data: Uint8Array }[] = [];
  private isAppending = false;
  private lastAppendedIndex = -1;
  
  // Callbacks
  private onMetadata?: (metadata: VideoMetadata) => void;
  private onProgress?: (received: number, total: number) => void;
  private onReady?: () => void;
  private onError?: (error: string) => void;
  
  // Peer chunk availability (for peer-assisted delivery)
  private peerChunks: Map<string, Set<number>> = new Map();

  constructor(channel: StreamChannel, myEndpointId: string) {
    this.channel = channel;
    this.myEndpointId = myEndpointId;
  }

  /**
   * Set video element for playback
   */
  setVideoElement(element: HTMLVideoElement): void {
    this.videoElement = element;
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: {
    onMetadata?: (metadata: VideoMetadata) => void;
    onProgress?: (received: number, total: number) => void;
    onReady?: () => void;
    onError?: (error: string) => void;
  }): void {
    this.onMetadata = callbacks.onMetadata;
    this.onProgress = callbacks.onProgress;
    this.onReady = callbacks.onReady;
    this.onError = callbacks.onError;
  }

  /**
   * Request metadata from broadcaster
   */
  async requestMetadata(): Promise<void> {
    console.log('[VideoFile] Requesting metadata from broadcaster...');
    const message: VideoStreamMessage = {
      type: 'video-request-metadata',
      from: this.myEndpointId,
    };
    await this.channel.broadcastSignal(message as unknown as WebRTCSignal);
  }

  /**
   * Handle incoming video stream message
   */
  async handleMessage(event: StreamEvent): Promise<void> {
    if (!event.data) return;
    
    const data = new Uint8Array(event.data);
    
    // Try to decode as video message
    const videoMsg = decodeVideoMessage(data);
    if (videoMsg) {
      await this.handleVideoMessage(videoMsg);
      return;
    }
    
    // Also try WebRTC signal format (for metadata sent via broadcastSignal)
    const signal = decodeWebRTCSignal(data);
    if (signal && (signal as unknown as VideoStreamMessage).type?.startsWith('video-')) {
      await this.handleVideoMessage(signal as unknown as VideoStreamMessage);
    }
  }

  /**
   * Handle video stream message
   */
  private async handleVideoMessage(message: VideoStreamMessage): Promise<void> {
    // Ignore our own messages
    if (message.from === this.myEndpointId) return;
    
    switch (message.type) {
      case 'video-metadata':
        await this.handleMetadata(message);
        break;
        
      case 'video-chunk':
        await this.handleChunk(message);
        break;
        
      case 'video-request-chunk':
        await this.handleChunkRequest(message);
        break;
        
      case 'video-have-chunks':
        this.handlePeerChunks(message);
        break;
    }
  }

  /**
   * Handle metadata message
   */
  private async handleMetadata(message: VideoStreamMessage): Promise<void> {
    if (this.metadata) return; // Already have metadata
    
    this.metadata = {
      fileName: message.fileName || 'video',
      fileSize: message.fileSize || 0,
      mimeType: message.mimeType || 'video/mp4',
      totalChunks: message.totalChunks || 0,
      duration: message.duration,
    };
    
    console.log('[VideoFile] Received metadata:', this.metadata);
    this.onMetadata?.(this.metadata);
    
    // Initialize MediaSource for playback
    await this.initMediaSource();
  }

  /**
   * Initialize for video playback
   * Using progressive Blob approach - plays when enough initial chunks are ready
   */
  private async initMediaSource(): Promise<void> {
    if (!this.videoElement || !this.metadata) return;
    
    console.log('[VideoFile] Initialized for playback, waiting for chunks...');
    this.onReady?.();
    
    // Start requesting chunks
    this.startRequestingChunks();
  }

  /**
   * Handle chunk message
   */
  private async handleChunk(message: VideoStreamMessage): Promise<void> {
    if (message.chunkIndex === undefined || !message.chunkData) return;
    
    const index = message.chunkIndex;
    
    // Skip if we already have this chunk
    if (this.receivedChunks.has(index)) return;
    
    const chunkData = new Uint8Array(message.chunkData);
    this.chunks.set(index, chunkData);
    this.receivedChunks.add(index);
    this.pendingRequests.delete(index);
    
    console.log('[VideoFile] Received chunk', index, 'from', message.from.substring(0, 8));
    
    // Update progress
    if (this.metadata) {
      this.onProgress?.(this.receivedChunks.size, this.metadata.totalChunks);
      
      // Try progressive playback - play when we have enough sequential chunks from start
      this.tryProgressivePlay();
    }
    
    // Announce that we have this chunk (for peer-assisted delivery)
    await this.announceChunks();
  }

  /**
   * Try to start playback when all chunks are received
   * Note: Regular MP4 files have metadata at the end, so we need all chunks
   * For true streaming, videos need to be encoded with "fast start" (moov atom at beginning)
   */
  private tryProgressivePlay(): void {
    if (!this.metadata || !this.videoElement) return;
    
    // Count sequential chunks from start
    let sequentialCount = 0;
    for (let i = 0; i < this.metadata.totalChunks; i++) {
      if (this.chunks.has(i)) {
        sequentialCount++;
      } else {
        break;
      }
    }
    
    // Update buffered display
    this.lastAppendedIndex = sequentialCount - 1;
    
    // For MP4: need all chunks because moov atom is usually at the end
    // For WebM: could potentially play progressively
    const isWebM = this.metadata.mimeType.includes('webm');
    const minPercentToPlay = isWebM ? 10 : 100; // WebM can stream, MP4 needs full file
    
    const hasAllChunks = this.receivedChunks.size >= this.metadata.totalChunks;
    const sequentialPercent = (sequentialCount / this.metadata.totalChunks) * 100;
    
    if (hasAllChunks && sequentialCount >= this.metadata.totalChunks) {
      console.log('[VideoFile] All chunks received, assembling video...');
      this.assembleAndPlay(sequentialCount);
    } else if (isWebM && sequentialPercent >= minPercentToPlay && !this.videoElement.src) {
      // Only WebM can potentially play progressively
      console.log('[VideoFile] WebM: trying progressive play at', sequentialPercent.toFixed(1), '%');
      this.assembleAndPlay(sequentialCount);
    }
  }

  /**
   * Assemble chunks into a Blob and play
   */
  private assembleAndPlay(chunkCount?: number): void {
    if (!this.metadata || !this.videoElement) return;
    
    const count = chunkCount || this.metadata.totalChunks;
    console.log('[VideoFile] Assembling', count, 'of', this.metadata.totalChunks, 'chunks...');
    
    // Assemble sequential chunks from start
    const orderedChunks: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
      const chunk = this.chunks.get(i);
      if (chunk) {
        orderedChunks.push(chunk);
      } else {
        console.log('[VideoFile] Stopping at chunk', i, '(missing)');
        break;
      }
    }
    
    if (orderedChunks.length === 0) return;
    
    // Create blob and play
    const blob = new Blob(orderedChunks, { type: this.metadata.mimeType });
    const url = URL.createObjectURL(blob);
    
    // Remember current playback position
    const currentTime = this.videoElement.currentTime || 0;
    const wasPlaying = !this.videoElement.paused;
    
    console.log('[VideoFile] Created blob URL, size:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
    
    // Revoke old URL if exists
    if (this.videoElement.src && this.videoElement.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.videoElement.src);
    }
    
    this.videoElement.src = url;
    this.videoElement.load();
    
    // Restore position and play
    this.videoElement.currentTime = currentTime;
    
    if (wasPlaying || currentTime === 0) {
      this.videoElement.play().then(() => {
        console.log('[VideoFile] Playback started!');
      }).catch(e => {
        console.log('[VideoFile] Auto-play blocked:', e.message);
      });
    }
  }

  /**
   * Queue chunk for playback - triggers progressive play check
   */
  private queueChunkForPlayback(_index: number, _data: Uint8Array): void {
    // Progressive play is handled in handleChunk
  }

  /**
   * Start requesting chunks continuously
   */
  private startRequestingChunks(): void {
    if (!this.metadata) return;
    
    console.log('[VideoFile] Starting to request chunks, total:', this.metadata.totalChunks);
    
    // Request chunks in batches with intervals
    const requestBatch = async () => {
      if (!this.metadata) return;
      
      // Find next chunks to request
      let requested = 0;
      for (let i = 0; i < this.metadata.totalChunks && requested < 5; i++) {
        if (!this.receivedChunks.has(i) && !this.pendingRequests.has(i)) {
          await this.requestChunkFromPeers(i);
          this.pendingRequests.add(i);
          requested++;
        }
      }
      
      // Check if we have all chunks
      if (this.receivedChunks.size >= this.metadata.totalChunks) {
        console.log('[VideoFile] All chunks received!');
        return;
      }
      
      // Clear old pending requests (they may have timed out)
      if (this.pendingRequests.size > 0 && requested === 0) {
        console.log('[VideoFile] Clearing stale pending requests');
        this.pendingRequests.clear();
      }
      
      // Continue requesting
      setTimeout(requestBatch, 500);
    };
    
    // Start requesting after a short delay
    setTimeout(requestBatch, 100);
  }

  /**
   * Request missing chunks from peers
   */
  private async requestMissingChunks(): Promise<void> {
    if (!this.metadata) return;
    
    // Find missing chunks
    for (let i = this.lastAppendedIndex + 1; i < this.metadata.totalChunks; i++) {
      if (!this.receivedChunks.has(i) && !this.pendingRequests.has(i)) {
        // Request from peers who have it
        await this.requestChunkFromPeers(i);
        this.pendingRequests.add(i);
        
        // Limit concurrent requests
        if (this.pendingRequests.size >= 5) break;
      }
    }
  }

  /**
   * Request a specific chunk from peers
   */
  private async requestChunkFromPeers(chunkIndex: number): Promise<void> {
    const message: VideoStreamMessage = {
      type: 'video-request-chunk',
      from: this.myEndpointId,
      chunkIndex,
    };
    
    console.log('[VideoFile] Requesting chunk', chunkIndex);
    await this.channel.broadcastSignal(message as unknown as WebRTCSignal);
  }

  /**
   * Handle chunk request from another peer
   */
  private async handleChunkRequest(message: VideoStreamMessage): Promise<void> {
    if (message.chunkIndex === undefined) return;
    
    const index = message.chunkIndex;
    const chunk = this.chunks.get(index);
    
    if (chunk) {
      console.log('[VideoFile] Relaying chunk', index, 'to peer', message.from.substring(0, 8));
      
      // Send the chunk (peer-assisted delivery)
      const response: VideoStreamMessage = {
        type: 'video-chunk',
        from: this.myEndpointId,
        chunkIndex: index,
        chunkData: Array.from(chunk),
      };
      
      await this.channel.broadcastChunk(encodeVideoMessage(response), index + 100000); // Offset to avoid collision
    }
  }

  /**
   * Handle peer chunk availability announcement
   */
  private handlePeerChunks(message: VideoStreamMessage): void {
    if (!message.availableChunks) return;
    
    const peerSet = this.peerChunks.get(message.from) || new Set();
    message.availableChunks.forEach(i => peerSet.add(i));
    this.peerChunks.set(message.from, peerSet);
  }

  /**
   * Announce our available chunks to peers
   */
  private async announceChunks(): Promise<void> {
    // Throttle announcements
    if (this.receivedChunks.size % 10 !== 0) return;
    
    const message: VideoStreamMessage = {
      type: 'video-have-chunks',
      from: this.myEndpointId,
      availableChunks: Array.from(this.receivedChunks),
    };
    
    await this.channel.broadcastSignal(message as unknown as WebRTCSignal);
  }

  /**
   * Get download progress
   */
  getProgress(): { received: number; total: number; percent: number } {
    const total = this.metadata?.totalChunks || 0;
    const received = this.receivedChunks.size;
    return {
      received,
      total,
      percent: total > 0 ? (received / total) * 100 : 0,
    };
  }

  /**
   * Check if ready to play
   */
  isReadyToPlay(): boolean {
    return this.lastAppendedIndex >= 0;
  }

  /**
   * Get buffered percentage
   */
  getBufferedPercent(): number {
    if (!this.metadata) return 0;
    return ((this.lastAppendedIndex + 1) / this.metadata.totalChunks) * 100;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.mediaSource && this.mediaSource.readyState === 'open') {
      try {
        this.mediaSource.endOfStream();
      } catch { /* ignore */ }
    }
    
    this.chunks.clear();
    this.receivedChunks.clear();
    this.pendingRequests.clear();
    this.peerChunks.clear();
    this.appendQueue = [];
  }
}

/**
 * Supported video formats for MSE
 */
export function getSupportedVideoFormats(): string[] {
  const formats: string[] = [];
  
  const testFormats = [
    'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    'video/mp4; codecs="avc1.42E01E"',
    'video/webm; codecs="vp9, opus"',
    'video/webm; codecs="vp8, vorbis"',
    'video/webm; codecs="vp9"',
    'video/webm; codecs="vp8"',
  ];
  
  for (const format of testFormats) {
    if (MediaSource.isTypeSupported(format)) {
      formats.push(format);
    }
  }
  
  return formats;
}
