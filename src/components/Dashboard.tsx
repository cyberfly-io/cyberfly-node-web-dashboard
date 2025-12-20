import { useQuery } from '@tanstack/react-query';
import { Activity, Network, Copy, Check, Server, Clock, TrendingUp, Coins, RefreshCw, Search, Zap } from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip 
} from 'recharts';
import { getNodeInfo, getDiscoveredPeers } from '../api/client';
import { getAPY, getStakeStats } from '../services/kadena';
import { useState, useMemo } from 'react';

export default function Dashboard() {
  const [peerSearch, setPeerSearch] = useState('');

  const {
    data: nodeInfo,
    isLoading: isNodeLoading,
    dataUpdatedAt: nodeUpdatedAt,
    isFetching: isNodeFetching,
  } = useQuery({
    queryKey: ['nodeInfo'],
    queryFn: getNodeInfo,
    refetchInterval: 5000,
  });

  const {
    data: peers = [],
    isLoading: arePeersLoading,
    isFetching: arePeersFetching,
  } = useQuery({
    queryKey: ['peers'],
    queryFn: getDiscoveredPeers,
    refetchInterval: 5000,
  });

  const {
    data: apy,
    isLoading: isApyLoading,
    isError: isApyError,
  } = useQuery({
    queryKey: ['apy'],
    queryFn: getAPY,
    refetchInterval: 60000, // Refetch every minute
  });

  const {
    data: stakeStats,
    isLoading: isStakeLoading,
    isError: isStakeError,
  } = useQuery({
    queryKey: ['stakeStats'],
    queryFn: getStakeStats,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Filter peers based on search
  const filteredPeers = useMemo(() => {
    if (!peerSearch.trim()) return peers;
    return peers.filter(peer => 
      peer.peerId.toLowerCase().includes(peerSearch.toLowerCase())
    );
  }, [peers, peerSearch]);

  return (
    <div className="p-4 sm:p-6 space-y-6 sm:space-y-8 text-gray-900 dark:text-gray-100">
      <div className="pt-16 lg:pt-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold gradient-text-blue mb-1 sm:mb-2">CyberFly Node Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg">Monitor your decentralized network node</p>
          </div>
          {nodeUpdatedAt && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-lg">
              <RefreshCw className={`w-3 h-3 ${isNodeFetching ? 'animate-spin' : ''}`} />
              <span>Updated {formatRelativeTime(new Date(nodeUpdatedAt).toISOString())}</span>
            </div>
          )}
        </div>
      </div>

      {/* Node Info */}
      <div className="glass dark:glass-dark rounded-2xl shadow-2xl overflow-hidden card-hover backdrop-blur-xl border border-white/20 dark:border-gray-700/50">
        <div className="bg-gradient-to-r from-blue-500 via-blue-600 to-purple-600 px-8 py-6 animate-gradient">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-xl shadow-lg backdrop-blur-sm">
                <Server className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Node Information</h2>
                <p className="text-blue-100 text-base">Decentralized Network Node</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div
                className={`px-4 py-2 rounded-xl text-sm font-bold shadow-lg backdrop-blur-sm flex items-center gap-2 ${
                  nodeInfo?.health === 'healthy'
                    ? 'bg-green-500/90 text-white'
                    : nodeInfo?.health === 'discovering'
                    ? 'bg-yellow-500/90 text-white'
                    : 'bg-red-500/90 text-white animate-pulse'
                }`}
                title="Node health status"
              >
                <span className="inline-flex w-2 h-2 rounded-full bg-white/90" />
                {nodeInfo?.health?.toUpperCase() || (isNodeLoading ? 'CONNECTING…' : 'UNKNOWN')}
              </div>
              {nodeInfo?.region && (
                <span className="hidden sm:inline-flex px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white border border-white/30">
                  Region: {nodeInfo.region}
                </span>
              )}
            </div>
          </div>
        </div>
        
  <div className="p-6 space-y-6 backdrop-blur-xl">
          {/* Node IDs Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              <div className="w-1 h-4 bg-blue-500 rounded"></div>
              Node Identifiers
            </div>
            
            <div className="glass dark:glass-dark rounded-lg p-4 backdrop-blur-md border border-white/10 dark:border-gray-600/30">
              <CopyableField 
                label="Node ID / Peer ID" 
                value={nodeInfo?.nodeId || 'Loading...'} 
                fullWidth
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              <div className="w-1 h-4 bg-green-500 rounded"></div>
              Network Statistics
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatBox
                icon={<Network className="w-5 h-5 text-blue-600" />}
                label="Connected Peers"
                value={nodeInfo?.connectedPeers || 0}
                subtitle="Active connections"
                color="blue"
              />
              <StatBox
                icon={<Activity className="w-5 h-5 text-green-600" />}
                label="Discovered Peers"
                value={nodeInfo?.discoveredPeers || 0}
                subtitle="Network participants"
                color="green"
              />
              <StatBox
                icon={<Clock className="w-5 h-5 text-purple-600" />}
                label="Uptime"
                value={formatUptime(nodeInfo?.uptimeSeconds || 0)}
                subtitle={`${nodeInfo?.uptimeSeconds || 0} seconds`}
                color="purple"
              />
            </div>
          </div>

          {/* Additional Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              <div className="w-1 h-4 bg-purple-500 rounded"></div>
              Configuration
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InfoBox 
                label="Region" 
                value={nodeInfo?.region || 'Unknown'} 
                muted={!nodeInfo?.region}
              />
              <InfoBox 
                label="Relay URL" 
                value={nodeInfo?.relayUrl || 'Not configured'} 
                muted={!nodeInfo?.relayUrl}
              />
              <InfoBox 
                label="Protocol Version" 
                value="Iroh v0.95.0" 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Staking & Peers Grid - Side by side on large screens */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Staking Statistics - Takes 2 columns on xl */}
        <div className="xl:col-span-2 glass dark:glass-dark rounded-2xl shadow-2xl overflow-hidden card-hover backdrop-blur-xl border border-white/20 dark:border-gray-700/50">
          <div className="bg-gradient-to-r from-green-500 via-emerald-600 to-teal-600 px-6 sm:px-8 py-5 sm:py-6 animate-gradient">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="bg-white/20 p-2.5 sm:p-3 rounded-xl shadow-lg backdrop-blur-sm">
                <Coins className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">Staking & Rewards</h2>
                <p className="text-green-100 text-sm sm:text-base">Node rewards and staking information</p>
              </div>
            </div>
          </div>
          
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 backdrop-blur-xl">
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {isApyLoading ? (
                  <SkeletonStatBox />
                ) : (
                  <StatBox
                    icon={<TrendingUp className="w-5 h-5 text-green-600" />}
                    label="Current APY"
                    value={apy !== null && apy !== undefined ? `${apy.toFixed(2)}%` : isApyError ? 'Unavailable' : 'N/A'}
                    subtitle="Annual percentage yield"
                    color="green"
                  />
                )}
                {isStakeLoading ? (
                  <SkeletonStatBox />
                ) : (
                  <StatBox
                    icon={<Coins className="w-5 h-5 text-emerald-600" />}
                    label="Active Stakes"
                    value={stakeStats?.totalStakes !== undefined ? stakeStats.totalStakes.toString() : isStakeError ? 'Unavailable' : 'N/A'}
                    subtitle={stakeStats?.activeStakes !== undefined ? `Active: ${stakeStats.activeStakes} nodes` : ''}
                    color="green"
                  />
                )}
                {isStakeLoading ? (
                  <SkeletonStatBox />
                ) : (
                  <StatBox
                    icon={<Zap className="w-5 h-5 text-blue-600" />}
                    label="Total Staked"
                    value={stakeStats?.totalStakedAmount !== undefined ? `${stakeStats.totalStakedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CFLY` : isStakeError ? 'Unavailable' : 'N/A'}
                    subtitle="Total amount staked"
                    color="blue"
                  />
                )}
              </div>

              {/* Staking Chart */}
              {!isStakeLoading && !isStakeError && stakeStats && (
                <div className="w-full lg:w-48 h-48 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Active', value: stakeStats.activeStakes },
                          { name: 'Inactive', value: stakeStats.totalStakes - stakeStats.activeStakes }
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#3b82f6" />
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(17, 24, 39, 0.8)', 
                          border: 'none', 
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            
            <div className="glass dark:glass-dark rounded-lg p-3 sm:p-4 backdrop-blur-md border border-white/10 dark:border-gray-600/30">
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 text-center">
                {isApyError || isStakeError
                  ? '⚠️ Unable to load staking data right now. Please check your connection.'
                  : isApyLoading || isStakeLoading
                  ? '💡 Fetching live staking data from Kadena…'
                  : '📊 Real-time staking data from Kadena blockchain (refreshes every 60s).'}
              </p>
            </div>
          </div>
        </div>

        {/* Connected Peers - Takes 1 column on xl */}
        <div className="xl:col-span-1 glass dark:glass-dark rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl border border-white/20 dark:border-gray-700/50 flex flex-col">
          <div className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 px-6 py-4 animate-gradient">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg shadow-lg backdrop-blur-sm">
                  <Network className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Connected Peers</h2>
                  <p className="text-blue-100 text-xs">
                    {arePeersLoading ? 'Discovering…' : `${peers.length} discovered`}
                  </p>
                </div>
              </div>
              {arePeersFetching && !arePeersLoading && (
                <RefreshCw className="w-4 h-4 text-white/70 animate-spin" />
              )}
            </div>
          </div>
          
          <div className="p-4 flex-1 flex flex-col">
            {/* Search input */}
            {peers.length > 5 && (
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search peers…"
                  value={peerSearch}
                  onChange={(e) => setPeerSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition"
                />
              </div>
            )}
            
            <div className="space-y-2 flex-1 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
              {arePeersLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <SkeletonPeerRow key={i} />
                  ))}
                </div>
              ) : filteredPeers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Network className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    {peerSearch ? 'No peers match your search.' : 'No peers discovered yet.'}
                  </p>
                  {!peerSearch && (
                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                      Ensure your node is running and reachable.
                    </p>
                  )}
                </div>
              ) : (
                filteredPeers.map((peer) => (
                  <div
                    key={peer.peerId}
                    className="group flex items-center justify-between p-2.5 bg-white/50 dark:bg-gray-800/50 rounded-lg hover:bg-white dark:hover:bg-gray-700/70 transition-all duration-200 border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative">
                        <div className="w-2 h-2 bg-green-500 rounded-full shadow-lg shadow-green-500/50" />
                        <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping opacity-75" />
                      </div>
                      <code
                        className="text-xs font-mono text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors break-all"
                        title={peer.peerId}
                      >
                        <a href={`http://${peer.address ? peer.address.replace(/:\d+$/, ":31000") : peer.address}`} target="_blank" rel="noopener noreferrer">{peer.peerId}</a>
                      </code>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap ml-2">
                      {formatRelativeTime(peer.lastSeen)}
                    </span>
                  </div>
                ))
              )}
            </div>
            
            {filteredPeers.length > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                Live updates every 5s
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Skeleton loading components
function SkeletonStatBox() {
  return (
    <div className="glass dark:glass-dark border border-gray-200/50 dark:border-gray-700/30 rounded-xl p-4 backdrop-blur-md animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg w-9 h-9" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
      </div>
      <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-1" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32" />
    </div>
  );
}

function SkeletonPeerRow() {
  return (
    <div className="flex items-center justify-between p-2.5 bg-white/50 dark:bg-gray-800/50 rounded-lg animate-pulse">
      <div className="flex items-center gap-2.5">
        <div className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48" />
      </div>
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-12" />
    </div>
  );
}

// UI Components
interface CopyableFieldProps {
  label: string;
  value: string;
  fullWidth?: boolean;
}

function CopyableField({ label, value, fullWidth }: CopyableFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={fullWidth ? 'w-full' : ''}>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{label}</label>
      <div className="flex items-center gap-2">
        <code
          className="flex-1 bg-white dark:bg-gray-700 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 text-sm font-mono text-gray-800 dark:text-gray-200 overflow-x-auto truncate"
          title={value}
        >
          {value}
        </code>
        <button
          onClick={handleCopy}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors flex-shrink-0"
          title="Copy to clipboard"
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : (
            <Copy className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          )}
        </button>
      </div>
    </div>
  );
}

interface StatBoxProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
}

function StatBox({ icon, label, value, subtitle, color }: StatBoxProps) {
  const colors = {
    blue: 'glass dark:glass-dark border-blue-200/50 dark:border-blue-700/30 hover:border-blue-300 dark:hover:border-blue-600',
    green: 'glass dark:glass-dark border-green-200/50 dark:border-green-700/30 hover:border-green-300 dark:hover:border-green-600',
    purple: 'glass dark:glass-dark border-purple-200/50 dark:border-purple-700/30 hover:border-purple-300 dark:hover:border-purple-600',
    orange: 'glass dark:glass-dark border-orange-200/50 dark:border-orange-700/30 hover:border-orange-300 dark:hover:border-orange-600',
  };

  return (
    <div className={`${colors[color]} border rounded-xl p-4 backdrop-blur-md transition-all duration-300 hover:shadow-lg`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="p-2 bg-white/30 dark:bg-gray-700/30 rounded-lg backdrop-blur-sm">
          {icon}
        </div>
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</div>
    </div>
  );
}

interface InfoBoxProps {
  label: string;
  value: string;
  muted?: boolean;
}

function InfoBox({ label, value, muted }: InfoBoxProps) {
  return (
    <div className="glass dark:glass-dark rounded-xl p-4 backdrop-blur-md border border-white/20 dark:border-gray-600/30 hover:border-white/30 dark:hover:border-gray-500/40 transition-all duration-300">
      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</div>
      <div className={`text-sm font-medium ${muted ? 'text-gray-500 dark:text-gray-400 italic' : 'text-gray-900 dark:text-white'}`}>
        {value}
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
