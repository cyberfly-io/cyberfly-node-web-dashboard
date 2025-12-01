import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  initWasm,
  getStreamingNode,
  getEndpointId,
  createStream,
  joinStream as joinStreamApi,
  getUserMedia,
  getDisplayMedia,
  cleanup,
  StreamChannel,
  createBroadcasterPeerConnection,
  createViewerPeerConnection,
  decodeWebRTCSignal,
} from '../services/streaming';
import type { QualityPreset, StreamEvent, WebRTCSignal } from '../services/streaming';

interface Neighbor {
  id: string;
  name?: string;
  lastSeen: number;
}

// Track peer connections for WebRTC
interface PeerConnectionInfo {
  pc: RTCPeerConnection;
  peerId: string;
}

export default function LiveStreaming() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endpointId, setEndpointId] = useState<string>('');
  
  // Streaming state
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  const [streamTicket, setStreamTicket] = useState('');
  const [joinTicket, setJoinTicket] = useState('');
  const [broadcasterName, setBroadcasterName] = useState('Anonymous');
  const [quality, setQuality] = useState<QualityPreset>('medium');
  const [sourceType, setSourceType] = useState<'camera' | 'screen'>('camera');
  
  // Neighbors/peers
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [chunkCount, setChunkCount] = useState(0);
  const [connectionState, setConnectionState] = useState<string>('');
  
  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const streamChannelRef = useRef<StreamChannel | null>(null);
  
  // WebRTC refs
  const peerConnectionsRef = useRef<Map<string, PeerConnectionInfo>>(new Map());
  const myEndpointIdRef = useRef<string>('');
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Stop broadcasting/watching
  const stopStreamRef = useRef<(() => void) | undefined>(undefined);

  // Handle WebRTC signaling messages
  const handleWebRTCSignal = useCallback(async (signal: WebRTCSignal) => {
    console.log('[WebRTC] Received signal:', signal.type, 'from:', signal.from?.substring(0, 8));
    
    // Ignore messages from ourselves
    if (signal.from === myEndpointIdRef.current) {
      return;
    }
    
    // If message is targeted to someone else, ignore
    if (signal.to && signal.to !== myEndpointIdRef.current) {
      return;
    }
    
    const channel = streamChannelRef.current;
    if (!channel) return;
    
    switch (signal.type) {
      case 'webrtc-request-offer': {
        // Viewer is requesting an offer - broadcaster should respond
        if (!mediaStreamRef.current) {
          console.log('[WebRTC] Not broadcasting (no mediaStream), ignoring request-offer');
          return;
        }
        
        // Check if the media tracks are still active (mobile browsers suspend camera)
        const activeTracks = mediaStreamRef.current.getTracks().filter(t => t.readyState === 'live');
        if (activeTracks.length === 0) {
          console.warn('[WebRTC] Media tracks ended (camera suspended?), ignoring request-offer');
          return;
        }
        
        console.log('[WebRTC] Creating offer for peer:', signal.from?.substring(0, 8), 'tracks:', activeTracks.length);
        
        // Create peer connection for this viewer
        const pc = createBroadcasterPeerConnection(
          mediaStreamRef.current,
          (candidate) => {
            // Send ICE candidate to the peer
            const iceSignal: WebRTCSignal = {
              type: 'webrtc-ice-candidate',
              from: myEndpointIdRef.current,
              to: signal.from,
              candidate: candidate.toJSON(),
            };
            channel.broadcastSignal(iceSignal);
          },
          (state) => {
            setConnectionState(state);
          }
        );
        
        peerConnectionsRef.current.set(signal.from!, { pc, peerId: signal.from! });
        
        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        const offerSignal: WebRTCSignal = {
          type: 'webrtc-offer',
          from: myEndpointIdRef.current,
          to: signal.from,
          sdp: offer.sdp,
        };
        await channel.broadcastSignal(offerSignal);
        break;
      }
      
      case 'webrtc-offer': {
        // Received an offer - viewer should create answer
        console.log('[WebRTC] Received offer, creating answer');
        
        // Create peer connection for receiving
        const pc = createViewerPeerConnection(
          (event) => {
            // Got remote track - attach to video element
            console.log('[WebRTC] Got remote track:', event.track.kind);
            if (remoteVideoRef.current && event.streams[0]) {
              remoteVideoRef.current.srcObject = event.streams[0];
              remoteVideoRef.current.play().catch(e => 
                console.log('[WebRTC] Auto-play blocked:', e)
              );
            }
          },
          (candidate) => {
            // Send ICE candidate to the peer
            const iceSignal: WebRTCSignal = {
              type: 'webrtc-ice-candidate',
              from: myEndpointIdRef.current,
              to: signal.from,
              candidate: candidate.toJSON(),
            };
            channel.broadcastSignal(iceSignal);
          },
          (state) => {
            setConnectionState(state);
          }
        );
        
        peerConnectionsRef.current.set(signal.from!, { pc, peerId: signal.from! });
        
        // Set remote description (the offer)
        await pc.setRemoteDescription({
          type: 'offer',
          sdp: signal.sdp,
        });
        
        // Apply any pending ICE candidates
        const pending = pendingIceCandidatesRef.current.get(signal.from!) || [];
        for (const candidate of pending) {
          await pc.addIceCandidate(candidate);
        }
        pendingIceCandidatesRef.current.delete(signal.from!);
        
        // Create and send answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        const answerSignal: WebRTCSignal = {
          type: 'webrtc-answer',
          from: myEndpointIdRef.current,
          to: signal.from,
          sdp: answer.sdp,
        };
        await channel.broadcastSignal(answerSignal);
        break;
      }
      
      case 'webrtc-answer': {
        // Received an answer - broadcaster should apply it
        console.log('[WebRTC] Received answer from:', signal.from?.substring(0, 8));
        
        const peerInfo = peerConnectionsRef.current.get(signal.from!);
        if (peerInfo) {
          await peerInfo.pc.setRemoteDescription({
            type: 'answer',
            sdp: signal.sdp,
          });
          
          // Apply any pending ICE candidates
          const pending = pendingIceCandidatesRef.current.get(signal.from!) || [];
          for (const candidate of pending) {
            await peerInfo.pc.addIceCandidate(candidate);
          }
          pendingIceCandidatesRef.current.delete(signal.from!);
        }
        break;
      }
      
      case 'webrtc-ice-candidate': {
        // Received ICE candidate
        if (!signal.candidate) return;
        
        const peerInfo = peerConnectionsRef.current.get(signal.from!);
        if (peerInfo && peerInfo.pc.remoteDescription) {
          console.log('[WebRTC] Adding ICE candidate from:', signal.from?.substring(0, 8));
          await peerInfo.pc.addIceCandidate(signal.candidate);
        } else {
          // Queue the candidate for later
          console.log('[WebRTC] Queuing ICE candidate from:', signal.from?.substring(0, 8));
          if (!pendingIceCandidatesRef.current.has(signal.from!)) {
            pendingIceCandidatesRef.current.set(signal.from!, []);
          }
          pendingIceCandidatesRef.current.get(signal.from!)!.push(signal.candidate);
        }
        break;
      }
    }
  }, []);

  // Handle stream events
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    console.log('[Stream] Event:', event.type);

    const forwardSignal = (rawData?: number[]) => {
      if (!rawData) return false;
      const data = new Uint8Array(rawData);
      const signal = decodeWebRTCSignal(data);
      if (!signal) {
        return false;
      }
      handleWebRTCSignal(signal).catch(err => {
        console.error('[WebRTC] Error handling signal:', err);
      });
      return true;
    };

    switch (event.type) {
      case 'neighborUp':
        if (event.endpointId) {
          setNeighbors(prev => {
            if (prev.find(n => n.id === event.endpointId)) return prev;
            return [...prev, { id: event.endpointId!, lastSeen: Date.now() }];
          });
        }
        break;
        
      case 'neighborDown':
        if (event.endpointId) {
          setNeighbors(prev => prev.filter(n => n.id !== event.endpointId));
          // Clean up peer connection for this neighbor
          const peerInfo = peerConnectionsRef.current.get(event.endpointId);
          if (peerInfo) {
            peerInfo.pc.close();
            peerConnectionsRef.current.delete(event.endpointId);
          }
        }
        break;
        
      case 'presence':
        if (event.from && event.name) {
          setNeighbors(prev => prev.map(n => 
            n.id === event.from ? { ...n, name: event.name, lastSeen: Date.now() } : n
          ));
        }
        break;
        
      case 'mediaChunk':
        // Legacy fallback: some peers may still send WebRTC signals as media chunks
        if (!forwardSignal(event.data)) {
          setChunkCount(prev => prev + 1);
        }
        break;

      case 'signal':
        console.log('[Stream] Signal event received, data length:', event.data?.length);
        if (!forwardSignal(event.data)) {
          console.warn('[Stream] Received signal event without decodable payload');
        }
        break;
        
      case 'lagged':
        console.warn('[Stream] Connection lagged - some messages may have been missed');
        break;
    }
  }, [handleWebRTCSignal]);

  stopStreamRef.current = () => {
    peerConnectionsRef.current.forEach((info) => {
      info.pc.close();
    });
    peerConnectionsRef.current.clear();
    pendingIceCandidatesRef.current.clear();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (streamChannelRef.current) {
      const channel = streamChannelRef.current as StreamChannel & { _presenceInterval?: NodeJS.Timeout; _retryInterval?: NodeJS.Timeout };
      channel.off('all', handleStreamEvent);
      if (channel._presenceInterval) {
        clearInterval(channel._presenceInterval);
      }
      if (channel._retryInterval) {
        clearInterval(channel._retryInterval);
      }
      channel.destroy();
      streamChannelRef.current = null;
    }

    setIsBroadcasting(false);
    setIsWatching(false);
    setStreamTicket('');
    setNeighbors([]);
    setChunkCount(0);
    setConnectionState('');
  };

  // Initialize WASM on mount
  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        await initWasm();
        await getStreamingNode();
        const id = await getEndpointId();
        setEndpointId(id);
        myEndpointIdRef.current = id;
        setIsInitialized(true);
      } catch (err) {
        setError(`Failed to initialize: ${err}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    init();
    
    return () => {
      stopStreamRef.current?.();
      cleanup();
    };
  }, []);

  // Start broadcasting
  const startBroadcast = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);
      
      // Get media stream
      console.log('[Broadcast] Getting media stream...');
      const stream = sourceType === 'camera' 
        ? await getUserMedia(quality, true, true)
        : await getDisplayMedia(quality);
      
      mediaStreamRef.current = stream;
      console.log('[Broadcast] Media stream acquired');
      
      // Display local preview
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Create gossip stream for signaling
      console.log('[Broadcast] Creating gossip stream for signaling...');
      const channel = await createStream(broadcasterName);
      channel.setName(broadcasterName);
      streamChannelRef.current = channel;
      
      // Listen for events (WebRTC signaling comes through gossip)
      channel.on('all', handleStreamEvent);
      
      // Get ticket for sharing
      const ticket = channel.getTicket();
      setStreamTicket(ticket);
      console.log('[Broadcast] Stream created, ticket:', ticket.substring(0, 40) + '...');
      
      // Send initial presence
      await channel.sendPresence();
      
      setIsBroadcasting(true);
      setIsLoading(false);
      
      // Periodically send presence to keep peers informed
      const presenceInterval = setInterval(async () => {
        if (streamChannelRef.current) {
          await streamChannelRef.current.sendPresence();
        }
      }, 5000);
      
      // Store interval for cleanup
      (channel as unknown as { _presenceInterval: NodeJS.Timeout })._presenceInterval = presenceInterval;
      
    } catch (err) {
      console.error('[Broadcast] Error:', err);
      setError(`Failed to start broadcast: ${err}`);
      setIsLoading(false);
    }
  }, [quality, sourceType, broadcasterName, handleStreamEvent]);

  // Stop broadcasting
  const stopBroadcast = useCallback(() => {
    if (streamChannelRef.current) {
      const channel = streamChannelRef.current as unknown as { _presenceInterval?: NodeJS.Timeout };
      if (channel._presenceInterval) {
        clearInterval(channel._presenceInterval);
      }
    }
    stopStreamRef.current?.();
  }, []);

  // Join a stream
  const handleJoinStream = useCallback(async () => {
    const ticket = joinTicket.trim();
    if (!ticket) {
      setError('Please enter a stream ticket');
      return;
    }
    
    // Validate ticket format
    if (!ticket.startsWith('stream')) {
      setError('Invalid ticket format. Stream tickets start with "stream".');
      return;
    }
    
    try {
      setError(null);
      setIsLoading(true);
      
      console.log('[Watch] Joining stream...');
      
      // Join the gossip stream for signaling
      const channel = await joinStreamApi(ticket, broadcasterName);
      channel.setName(broadcasterName);
      streamChannelRef.current = channel;
      
      // Listen for events (WebRTC signaling comes through gossip)
      channel.on('all', handleStreamEvent);
      
      // Send presence to announce ourselves
      await channel.sendPresence();
      
      setIsWatching(true);
      setIsLoading(false);
      
      // Request an offer from the broadcaster with retry logic
      // Gossip needs time to establish mesh, so we retry until connected
      let retryCount = 0;
      const maxRetries = 10;
      const retryInterval = setInterval(async () => {
        retryCount++;
        
        // Check if we already have a peer connection (offer received)
        if (peerConnectionsRef.current.size > 0) {
          console.log('[Watch] WebRTC connection established, stopping retries');
          clearInterval(retryInterval);
          return;
        }
        
        if (retryCount > maxRetries) {
          console.log('[Watch] Max retries reached, stopping');
          clearInterval(retryInterval);
          return;
        }
        
        if (streamChannelRef.current) {
          console.log(`[Watch] Requesting WebRTC offer from broadcaster (attempt ${retryCount})...`);
          const requestSignal: WebRTCSignal = {
            type: 'webrtc-request-offer',
            from: myEndpointIdRef.current,
          };
          try {
            await streamChannelRef.current.broadcastSignal(requestSignal);
          } catch (err) {
            console.warn('[Watch] Failed to send request:', err);
          }
        }
      }, 2000); // Retry every 2 seconds
      
      // Store interval for cleanup
      (channel as unknown as { _retryInterval: NodeJS.Timeout })._retryInterval = retryInterval;
      
      console.log('[Watch] Joined stream successfully, waiting for WebRTC connection');
      
    } catch (err) {
      console.error('[Watch] Error:', err);
      setError(`Failed to join stream: ${err}`);
      setIsLoading(false);
    }
  }, [joinTicket, broadcasterName, handleStreamEvent]);

  // Stop watching
  const stopWatching = useCallback(() => {
    if (streamChannelRef.current) {
      const channel = streamChannelRef.current as unknown as { _retryInterval?: NodeJS.Timeout };
      if (channel._retryInterval) {
        clearInterval(channel._retryInterval);
      }
    }
    stopStreamRef.current?.();
    setJoinTicket('');
  }, []);

  // Copy ticket to clipboard
  const copyTicket = useCallback(() => {
    if (streamTicket) {
      navigator.clipboard.writeText(streamTicket);
    }
  }, [streamTicket]);

  return (
    <div className={`p-6 ${isDark ? 'text-white' : 'text-gray-900'}`}>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Live Streaming</h1>
        <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          P2P video/audio streaming with WebRTC (signaling via Iroh Gossip)
        </p>
      </div>

      {/* Status Card */}
      <div className={`glass rounded-xl p-6 mb-6 ${isDark ? 'bg-gray-800/50' : 'bg-white/50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold mb-1">Node Status</h2>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {isInitialized ? (
                <>
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Connected
                  {connectionState && (
                    <span className="ml-2">• WebRTC: {connectionState}</span>
                  )}
                </>
              ) : isLoading ? (
                <>
                  <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></span>
                  Initializing...
                </>
              ) : (
                <>
                  <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                  Disconnected
                </>
              )}
            </p>
          </div>
          {endpointId && (
            <div className={`text-xs font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              ID: {endpointId.substring(0, 16)}...
            </div>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-6">
          <p className="text-red-400">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-300 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Name Input */}
      <div className={`glass rounded-xl p-4 mb-6 ${isDark ? 'bg-gray-800/50' : 'bg-white/50'}`}>
        <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          Your Display Name
        </label>
        <input
          type="text"
          value={broadcasterName}
          onChange={(e) => setBroadcasterName(e.target.value)}
          disabled={isBroadcasting || isWatching}
          placeholder="Enter your name..."
          className={`w-full px-4 py-2 rounded-lg ${
            isDark 
              ? 'bg-gray-700 text-white border-gray-600' 
              : 'bg-white text-gray-900 border-gray-300'
          } border focus:ring-2 focus:ring-blue-500 disabled:opacity-50`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Broadcast Section */}
        <div className={`glass rounded-xl p-6 ${isDark ? 'bg-gray-800/50' : 'bg-white/50'}`}>
          <h2 className="text-xl font-semibold mb-4">📡 Broadcast</h2>
          
          {/* Source Type Selection */}
          <div className="mb-4">
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Source
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSourceType('camera')}
                disabled={isBroadcasting}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                  sourceType === 'camera'
                    ? 'bg-blue-600 text-white'
                    : isDark 
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                } disabled:opacity-50`}
              >
                📷 Camera
              </button>
              <button
                onClick={() => setSourceType('screen')}
                disabled={isBroadcasting}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                  sourceType === 'screen'
                    ? 'bg-blue-600 text-white'
                    : isDark 
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                } disabled:opacity-50`}
              >
                🖥️ Screen
              </button>
            </div>
          </div>

          {/* Quality Selection */}
          <div className="mb-4">
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Quality
            </label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as QualityPreset)}
              disabled={isBroadcasting}
              className={`w-full px-4 py-2 rounded-lg ${
                isDark 
                  ? 'bg-gray-700 text-white border-gray-600' 
                  : 'bg-white text-gray-900 border-gray-300'
              } border focus:ring-2 focus:ring-blue-500 disabled:opacity-50`}
            >
              <option value="low">Low (360p, 15fps)</option>
              <option value="medium">Medium (480p, 24fps)</option>
              <option value="high">High (720p, 30fps)</option>
              <option value="ultra">Ultra (1080p, 30fps)</option>
            </select>
          </div>

          {/* Local Video Preview */}
          <div className={`relative aspect-video rounded-lg overflow-hidden mb-4 ${
            isDark ? 'bg-gray-900' : 'bg-gray-100'
          }`}>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {!isBroadcasting && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Preview will appear here
                </span>
              </div>
            )}
            {isBroadcasting && (
              <div className="absolute top-2 left-2 px-2 py-1 bg-red-600 rounded text-xs text-white flex items-center gap-1">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                LIVE
              </div>
            )}
          </div>

          {/* Broadcast Controls */}
          <div className="flex gap-2 mb-4">
            {!isBroadcasting ? (
              <button
                onClick={startBroadcast}
                disabled={!isInitialized || isLoading || isWatching}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Starting...' : '🔴 Start Broadcast'}
              </button>
            ) : (
              <button
                onClick={stopBroadcast}
                className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                ⏹️ Stop Broadcast
              </button>
            )}
          </div>

          {/* Stream Stats */}
          {isBroadcasting && (
            <div className={`p-4 rounded-lg mb-4 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <div className="flex justify-between text-sm">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Chunks sent:</span>
                <span className="font-mono">{chunkCount}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Viewers:</span>
                <span className="font-mono">{neighbors.length}</span>
              </div>
            </div>
          )}

          {/* Stream Ticket Display */}
          {streamTicket && (
            <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Share this ticket:
                </span>
                <button
                  onClick={copyTicket}
                  className="text-blue-500 hover:text-blue-400 text-sm"
                >
                  📋 Copy
                </button>
              </div>
              <div className={`text-xs font-mono break-all ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {streamTicket.substring(0, 80)}...
              </div>
            </div>
          )}
        </div>

        {/* Watch Section */}
        <div className={`glass rounded-xl p-6 ${isDark ? 'bg-gray-800/50' : 'bg-white/50'}`}>
          <h2 className="text-xl font-semibold mb-4">👁️ Watch Stream</h2>
          
          {/* Join Ticket Input */}
          <div className="mb-4">
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Stream Ticket
            </label>
            <textarea
              value={joinTicket}
              onChange={(e) => setJoinTicket(e.target.value)}
              disabled={isWatching || isBroadcasting}
              placeholder="Paste stream ticket here..."
              rows={3}
              className={`w-full px-4 py-2 rounded-lg ${
                isDark 
                  ? 'bg-gray-700 text-white border-gray-600 placeholder-gray-500' 
                  : 'bg-white text-gray-900 border-gray-300 placeholder-gray-400'
              } border focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none font-mono text-xs`}
            />
          </div>

          {/* Remote Video */}
          <div className={`relative aspect-video rounded-lg overflow-hidden mb-4 ${
            isDark ? 'bg-gray-900' : 'bg-gray-100'
          }`}>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {!isWatching && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Stream will appear here
                </span>
              </div>
            )}
            {isWatching && (
              <div className="absolute top-2 left-2 px-2 py-1 bg-green-600 rounded text-xs text-white">
                WATCHING
              </div>
            )}
          </div>

          {/* Watch Controls */}
          <div className="flex gap-2">
            {!isWatching ? (
              <button
                onClick={handleJoinStream}
                disabled={!isInitialized || isLoading || !joinTicket.trim() || isBroadcasting}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Joining...' : '▶️ Join Stream'}
              </button>
            ) : (
              <button
                onClick={stopWatching}
                className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                ⏹️ Leave Stream
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Neighbors/Peers Section */}
      {(isBroadcasting || isWatching) && neighbors.length > 0 && (
        <div className={`mt-6 glass rounded-xl p-6 ${isDark ? 'bg-gray-800/50' : 'bg-white/50'}`}>
          <h2 className="text-xl font-semibold mb-4">👥 Connected Peers ({neighbors.length})</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {neighbors.map((neighbor) => (
              <div
                key={neighbor.id}
                className={`p-3 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className={`text-sm font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {neighbor.name || 'Anonymous'}
                  </span>
                </div>
                <div className={`text-xs font-mono truncate mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  {neighbor.id.substring(0, 12)}...
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className={`mt-6 glass rounded-xl p-6 ${isDark ? 'bg-gray-800/50' : 'bg-white/50'}`}>
        <h2 className="text-xl font-semibold mb-4">ℹ️ How it works</h2>
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
            <h3 className={`font-medium mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>1. Broadcast</h3>
            <p>Start streaming your camera or screen. A gossip channel is created for peer discovery and WebRTC signaling.</p>
          </div>
          <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
            <h3 className={`font-medium mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>2. Share</h3>
            <p>Share the ticket with viewers. They'll join the gossip network and receive WebRTC connection info.</p>
          </div>
          <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
            <h3 className={`font-medium mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>3. Watch</h3>
            <p>WebRTC handles the actual video/audio streaming with native browser codecs for optimal quality.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
