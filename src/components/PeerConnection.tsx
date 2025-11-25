import { useState } from 'react';
import { dialPeer } from '../api/client';
import { Network, X, Link, Info } from 'lucide-react';

export default function PeerConnection() {
  const [peerId, setPeerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!peerId.trim()) {
      setError('Please enter a peer ID');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await dialPeer(peerId.trim());
      setResult(response);
      if (response.success) {
        // Clear form on success
        setPeerId('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to peer');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setPeerId('');
    setResult(null);
    setError(null);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="glass dark:glass-dark rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl border border-white/20 dark:border-gray-700/50">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-xl shadow-lg backdrop-blur-sm">
              <Network className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Connect to Peer</h2>
              <p className="text-blue-100">Establish direct P2P connections via Iroh</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 flex gap-4">
            <Info className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">About Peer Connections</h3>
              <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                Enter a peer's EndpointId (public key) to establish a direct connection. This uses Iroh's 
                hole-punching to create peer-to-peer connections.
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300 font-mono bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded inline-block">
                Format: 64-character hexadecimal string
              </p>
            </div>
          </div>

          <form onSubmit={handleConnect} className="space-y-6">
            <div>
              <label htmlFor="peerId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Peer ID (EndpointId)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Link className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="peerId"
                  type="text"
                  value={peerId}
                  onChange={(e) => setPeerId(e.target.value)}
                  placeholder="Enter peer's EndpointId..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 font-mono text-sm shadow-sm transition-all"
                  disabled={loading}
                />
                {peerId && (
                  <button
                    type="button"
                    onClick={() => setPeerId('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <button
                type="submit"
                disabled={loading || !peerId.trim()}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-3 px-6 rounded-xl shadow-lg shadow-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Connecting...
                  </span>
                ) : (
                  'Connect to Peer'
                )}
              </button>
              
              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 font-medium focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
              >
                Clear
              </button>
            </div>
          </form>

        {/* Success Message */}
        {result && result.success && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-green-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Connection Successful</h3>
                <p className="mt-1 text-sm text-green-700">{result.message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Failure Message */}
        {result && !result.success && (
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Connection Failed</h3>
                <p className="mt-1 text-sm text-yellow-700">{result.message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-red-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">How to Find Peer IDs</h3>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Your own EndpointId is displayed in the Dashboard under "Node Information"</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Other peers' EndpointIds can be found in the "Discovered Peers" section</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>EndpointIds are 64-character hexadecimal strings (256-bit public keys)</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Successful connections are tracked and displayed in the Dashboard</span>
            </li>
          </ul>
        </div>
      </div>
      </div>
    </div>
  );
}
