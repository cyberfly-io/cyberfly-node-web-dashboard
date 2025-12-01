import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  initWasm,
  getStreamingNode,
  getEndpointId,
  createStream,
  joinStream as joinStreamApi,
  cleanup,
  StreamChannel,
} from '../services/streaming';
import type { StreamEvent } from '../services/streaming';
import {
  VideoFileBroadcaster,
  VideoFileViewer,
} from '../services/video-streaming';
import type { VideoMetadata } from '../services/video-streaming';

interface Neighbor {
  id: string;
  name?: string;
  lastSeen: number;
}

export default function VideoFileStreaming() {
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
  
  // Video file state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [broadcastProgress, setBroadcastProgress] = useState({ sent: 0, total: 0 });
  const [downloadProgress, setDownloadProgress] = useState({ received: 0, total: 0, percent: 0 });
  const [bufferedPercent, setBufferedPercent] = useState(0);
  
  // Neighbors/peers
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  
  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamChannelRef = useRef<StreamChannel | null>(null);
  const broadcasterRef = useRef<VideoFileBroadcaster | null>(null);
  const viewerRef = useRef<VideoFileViewer | null>(null);
  const myEndpointIdRef = useRef<string>('');

  // Stop streaming
  const stopStreamRef = useRef<(() => void) | undefined>(undefined);
  
  stopStreamRef.current = () => {
    if (broadcasterRef.current) {
      broadcasterRef.current.stopBroadcast();
      broadcasterRef.current = null;
    }
    
    if (viewerRef.current) {
      viewerRef.current.destroy();
      viewerRef.current = null;
    }
    
    if (localVideoRef.current) {
      localVideoRef.current.src = '';
    }
    
    if (remoteVideoRef.current) {
      remoteVideoRef.current.src = '';
    }
    
    if (streamChannelRef.current) {
      const channel = streamChannelRef.current as StreamChannel & { _presenceInterval?: NodeJS.Timeout };
      if (channel._presenceInterval) {
        clearInterval(channel._presenceInterval);
      }
      channel.destroy();
      streamChannelRef.current = null;
    }
    
    setIsBroadcasting(false);
    setIsWatching(false);
    setStreamTicket('');
    setNeighbors([]);
    setBroadcastProgress({ sent: 0, total: 0 });
    setDownloadProgress({ received: 0, total: 0, percent: 0 });
    setBufferedPercent(0);
    setVideoMetadata(null);
  };

  // Handle stream events
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    console.log('[VideoFile] Event:', event.type);
    
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
        }
        break;
        
      case 'presence':
        if (event.from && event.name) {
          setNeighbors(prev => prev.map(n => 
            n.id === event.from ? { ...n, name: event.name, lastSeen: Date.now() } : n
          ));
        }
        break;
        
      case 'signal':
      case 'mediaChunk':
        // Forward to viewer for processing
        if (viewerRef.current && event.data) {
          viewerRef.current.handleMessage(event);
        }
        
        // Forward to broadcaster for processing (for metadata/chunk requests)
        if (broadcasterRef.current && event.data) {
          broadcasterRef.current.handleMessage(event);
        }
        break;
        
      case 'lagged':
        console.warn('[VideoFile] Connection lagged');
        break;
    }
  }, []);

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

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate video file
      if (!file.type.startsWith('video/')) {
        setError('Please select a video file');
        return;
      }
      
      setSelectedFile(file);
      setError(null);
      
      // Preview the video locally
      if (localVideoRef.current) {
        localVideoRef.current.src = URL.createObjectURL(file);
      }
    }
  }, []);

  // Start broadcasting video file
  const startBroadcast = useCallback(async () => {
    if (!selectedFile) {
      setError('Please select a video file first');
      return;
    }
    
    try {
      setError(null);
      setIsLoading(true);
      
      // Create gossip channel
      console.log('[VideoFile] Creating gossip channel...');
      const channel = await createStream(broadcasterName);
      channel.setName(broadcasterName);
      streamChannelRef.current = channel;
      
      // Listen for events
      channel.on('all', handleStreamEvent);
      
      // Create broadcaster
      const broadcaster = new VideoFileBroadcaster(channel, selectedFile, myEndpointIdRef.current);
      broadcasterRef.current = broadcaster;
      
      // Set callbacks
      broadcaster.setOnProgress((sent, total) => {
        setBroadcastProgress({ sent, total });
      });
      
      broadcaster.setOnPeerRequest((peerId, chunkIndex) => {
        console.log('[VideoFile] Peer', peerId.substring(0, 8), 'requested chunk', chunkIndex);
      });
      
      // Prepare and start broadcasting
      const metadata = await broadcaster.prepare();
      setVideoMetadata(metadata);
      
      // Get ticket for sharing
      const ticket = channel.getTicket();
      setStreamTicket(ticket);
      
      // Start broadcast
      await broadcaster.startBroadcast(50); // 50ms between chunks
      
      // Send presence periodically
      const presenceInterval = setInterval(async () => {
        if (streamChannelRef.current) {
          await streamChannelRef.current.sendPresence();
        }
      }, 5000);
      
      (channel as unknown as { _presenceInterval: NodeJS.Timeout })._presenceInterval = presenceInterval;
      
      setIsBroadcasting(true);
      setIsLoading(false);
      
      console.log('[VideoFile] Broadcast started, ticket:', ticket.substring(0, 40) + '...');
      
    } catch (err) {
      console.error('[VideoFile] Error:', err);
      setError(`Failed to start broadcast: ${err}`);
      setIsLoading(false);
    }
  }, [selectedFile, broadcasterName, handleStreamEvent]);

  // Stop broadcasting
  const stopBroadcast = useCallback(() => {
    stopStreamRef.current?.();
  }, []);

  // Join a stream
  const handleJoinStream = useCallback(async () => {
    const ticket = joinTicket.trim();
    if (!ticket) {
      setError('Please enter a stream ticket');
      return;
    }
    
    if (!ticket.startsWith('stream')) {
      setError('Invalid ticket format. Stream tickets start with "stream".');
      return;
    }
    
    try {
      setError(null);
      setIsLoading(true);
      
      console.log('[VideoFile] Joining stream...');
      
      // Join gossip channel
      const channel = await joinStreamApi(ticket, broadcasterName);
      channel.setName(broadcasterName);
      streamChannelRef.current = channel;
      
      // Create viewer
      const viewer = new VideoFileViewer(channel, myEndpointIdRef.current);
      viewerRef.current = viewer;
      
      // Set video element
      if (remoteVideoRef.current) {
        viewer.setVideoElement(remoteVideoRef.current);
      }
      
      // Set callbacks
      viewer.setCallbacks({
        onMetadata: (metadata) => {
          console.log('[VideoFile] Got metadata:', metadata);
          setVideoMetadata(metadata);
        },
        onProgress: (received, total) => {
          setDownloadProgress({
            received,
            total,
            percent: total > 0 ? (received / total) * 100 : 0,
          });
          
          // Update buffered percent
          if (viewer) {
            setBufferedPercent(viewer.getBufferedPercent());
          }
        },
        onReady: () => {
          console.log('[VideoFile] Ready to play');
          // Auto-play when ready
          remoteVideoRef.current?.play().catch(e => {
            console.log('[VideoFile] Auto-play blocked:', e);
          });
        },
        onError: (error) => {
          console.error('[VideoFile] Error:', error);
          setError(error);
        },
      });
      
      // Listen for events
      channel.on('all', handleStreamEvent);
      
      // Send presence
      await channel.sendPresence();
      
      setIsWatching(true);
      setIsLoading(false);
      
      console.log('[VideoFile] Joined stream successfully');
      
      // Request metadata with retry logic (broadcaster may not see us immediately)
      const requestMetadataWithRetry = async (attempts: number = 5, delayMs: number = 1000) => {
        for (let i = 0; i < attempts; i++) {
          if (!viewerRef.current) return; // Stopped watching
          
          // Check if we already have metadata
          const progress = viewerRef.current.getProgress();
          if (progress.total > 0) {
            console.log('[VideoFile] Already have metadata, stopping requests');
            return;
          }
          
          console.log(`[VideoFile] Requesting metadata (attempt ${i + 1}/${attempts})...`);
          await viewerRef.current.requestMetadata();
          
          // Wait before next attempt
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        console.log('[VideoFile] Metadata request attempts exhausted');
      };
      
      // Start requesting metadata after a short delay
      setTimeout(() => {
        requestMetadataWithRetry();
      }, 500);
      
    } catch (err) {
      console.error('[VideoFile] Error:', err);
      setError(`Failed to join stream: ${err}`);
      setIsLoading(false);
    }
  }, [joinTicket, broadcasterName, handleStreamEvent]);

  // Stop watching
  const stopWatching = useCallback(() => {
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
        <h1 className="text-3xl font-bold mb-2">📁 Video File Streaming</h1>
        <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          P2P video file sharing with peer-assisted bandwidth (like WebTorrent)
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
                  {neighbors.length > 0 && (
                    <span className="ml-2">• {neighbors.length} peer(s) sharing bandwidth</span>
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
        {/* Share Video Section */}
        <div className={`glass rounded-xl p-6 ${isDark ? 'bg-gray-800/50' : 'bg-white/50'}`}>
          <h2 className="text-xl font-semibold mb-4">📤 Share Video File</h2>
          
          {/* File Selection */}
          <div className="mb-4">
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Select Video File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              disabled={isBroadcasting}
              className={`w-full px-4 py-2 rounded-lg ${
                isDark 
                  ? 'bg-gray-700 text-white border-gray-600' 
                  : 'bg-white text-gray-900 border-gray-300'
              } border focus:ring-2 focus:ring-blue-500 disabled:opacity-50`}
            />
            {selectedFile && (
              <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                📎 {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* Local Video Preview */}
          <div className={`relative aspect-video rounded-lg overflow-hidden mb-4 ${
            isDark ? 'bg-gray-900' : 'bg-gray-100'
          }`}>
            <video
              ref={localVideoRef}
              controls
              playsInline
              className="w-full h-full object-contain"
            />
            {!selectedFile && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Select a video file to preview
                </span>
              </div>
            )}
            {isBroadcasting && (
              <div className="absolute top-2 left-2 px-2 py-1 bg-blue-600 rounded text-xs text-white flex items-center gap-1">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                SHARING
              </div>
            )}
          </div>

          {/* Broadcast Controls */}
          <div className="flex gap-2 mb-4">
            {!isBroadcasting ? (
              <button
                onClick={startBroadcast}
                disabled={!isInitialized || isLoading || !selectedFile || isWatching}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Starting...' : '📤 Share Video'}
              </button>
            ) : (
              <button
                onClick={stopBroadcast}
                className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                ⏹️ Stop Sharing
              </button>
            )}
          </div>

          {/* Broadcast Progress */}
          {isBroadcasting && broadcastProgress.total > 0 && (
            <div className={`p-4 rounded-lg mb-4 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <div className="flex justify-between text-sm mb-2">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Progress:</span>
                <span className="font-mono">{broadcastProgress.sent} / {broadcastProgress.total} chunks</span>
              </div>
              <div className="w-full bg-gray-600 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${(broadcastProgress.sent / broadcastProgress.total) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-sm mt-2">
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
          <h2 className="text-xl font-semibold mb-4">📥 Watch Video</h2>
          
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
              controls
              playsInline
              className="w-full h-full object-contain"
            />
            {!isWatching && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Video will appear here
                </span>
              </div>
            )}
            {isWatching && (
              <div className="absolute top-2 left-2 px-2 py-1 bg-green-600 rounded text-xs text-white">
                DOWNLOADING
              </div>
            )}
          </div>

          {/* Watch Controls */}
          <div className="flex gap-2 mb-4">
            {!isWatching ? (
              <button
                onClick={handleJoinStream}
                disabled={!isInitialized || isLoading || !joinTicket.trim() || isBroadcasting}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Joining...' : '▶️ Watch Video'}
              </button>
            ) : (
              <button
                onClick={stopWatching}
                className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                ⏹️ Stop Watching
              </button>
            )}
          </div>

          {/* Download Progress */}
          {isWatching && downloadProgress.total > 0 && (
            <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <div className="flex justify-between text-sm mb-2">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Downloaded:</span>
                <span className="font-mono">{downloadProgress.received} / {downloadProgress.total} chunks ({downloadProgress.percent.toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-gray-600 rounded-full h-2 mb-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Buffered:</span>
                <span className="font-mono">{bufferedPercent.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-600 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${bufferedPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Video Metadata */}
          {videoMetadata && isWatching && (
            <div className={`p-4 rounded-lg mt-4 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <h3 className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Video Info
              </h3>
              <div className={`text-xs space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                <p>📎 {videoMetadata.fileName}</p>
                <p>📦 {(videoMetadata.fileSize / (1024 * 1024)).toFixed(2)} MB</p>
                <p>🎬 {videoMetadata.mimeType}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Peers Section */}
      {(isBroadcasting || isWatching) && neighbors.length > 0 && (
        <div className={`mt-6 glass rounded-xl p-6 ${isDark ? 'bg-gray-800/50' : 'bg-white/50'}`}>
          <h2 className="text-xl font-semibold mb-4">🌐 P2P Swarm ({neighbors.length} peers)</h2>
          <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            These peers are helping share bandwidth. More peers = faster downloads!
          </p>
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
        <h2 className="text-xl font-semibold mb-4">ℹ️ How P2P Video Sharing Works</h2>
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
            <h3 className={`font-medium mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>1. Share</h3>
            <p>Select a video file to share. It gets split into chunks and distributed via the P2P gossip network.</p>
          </div>
          <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
            <h3 className={`font-medium mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>2. Swarm</h3>
            <p>Viewers join using the ticket. As they receive chunks, they also share them with other viewers (like BitTorrent).</p>
          </div>
          <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
            <h3 className={`font-medium mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>3. Play</h3>
            <p>Video plays as it downloads using MediaSource Extensions. More peers = faster downloads and less load on the sharer!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
