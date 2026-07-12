import { useEffect, useState } from 'react';
import { getActiveNodes } from '../services/pact-services';
import type { NodeInfo } from '../services/pact-services';
import { Search, RefreshCw, Eye, Activity, Clock, Database, Filter } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function AllNodes({ onNodeClick }: { onNodeClick?: (peerId: string) => void }) {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [filteredNodes, setFilteredNodes] = useState<NodeInfo[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const loadNodes = () => {
    setLoading(true);
    getActiveNodes()
      .then((data) => {
        setNodes(data);
        setFilteredNodes(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching nodes:', error);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadNodes();
  }, []);

  useEffect(() => {
    let filtered = nodes;

    // Apply search filter
    if (searchText) {
      filtered = filtered.filter(
        (node) =>
          node.peer_id?.toLowerCase().includes(searchText.toLowerCase()) ||
          node.multiaddr?.toLowerCase().includes(searchText.toLowerCase()) ||
          node.status?.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((node) =>
        statusFilter === 'active' ? node.status === 'active' : node.status !== 'active'
      );
    }

    setFilteredNodes(filtered);
  }, [nodes, searchText, statusFilter]);

  const activeNodesCount = nodes.filter((n) => n.status === 'active').length;
  const activePercentage = nodes.length > 0 ? Math.round((activeNodesCount / nodes.length) * 100) : 0;

  const getStatusBadge = (status: string) => {
    const isActive = status === 'active' || status === 'online';
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold backdrop-blur-sm ${
          isActive
            ? 'bg-green-500/15 text-green-400 border border-green-500/20'
            : 'bg-ink-500/15 text-ink-400 border border-ink-500/20'
        }`}
      >
        {isActive ? <Activity className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
        {status}
      </span>
    );
  };

  const extractIP = (multiaddr: string) => {
    const match = multiaddr?.match(/\/ip4\/([^/]+)/);
    return match ? match[1] : 'N/A';
  };

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div
        className={`glass-panel rounded-2xl border p-8 animate-gradient ${
          isDark
            ? 'border-white/10 bg-gradient-to-r from-blue-900/50 via-teal-900/50 to-cyan-900/50'
            : 'border-white/20 bg-gradient-to-r from-blue-100 via-teal-100 to-cyan-100'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`mb-3 text-4xl font-bold gradient-text-blue`}>
              Network Nodes
            </h2>
            <p className={`text-lg ${isDark ? 'text-ink-300' : 'text-ink-600'}`}>
              Browse and monitor all active nodes in the Cyberfly network
            </p>
          </div>
                    <button
            onClick={loadNodes}
            disabled={loading}
            className={`btn-neon flex items-center gap-2 rounded-xl px-6 py-3 font-semibold transition-all duration-300 transform hover:scale-105`}
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div
          className={`glass-panel rounded-2xl border p-6 text-center card-hover ${
            isDark
              ? 'border-white/10 bg-gradient-to-br from-blue-900/50 to-blue-800/50'
              : 'border-white/20 bg-gradient-to-br from-blue-50 to-blue-100'
          }`}
        >
          <div className="mb-3 flex justify-center">
            <div className="p-3 bg-blue-500 bg-opacity-20 rounded-full">
              <Database className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className={`text-4xl font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
            {nodes.length}
          </div>
          <div className={`mt-2 text-sm font-medium ${isDark ? 'text-ink-400' : 'text-ink-500'}`}>
            Total Nodes
          </div>
        </div>

        <div
          className={`glass-panel rounded-2xl border p-6 text-center card-hover ${
            isDark
              ? 'border-white/10 bg-gradient-to-br from-green-900/50 to-green-800/50'
              : 'border-white/20 bg-gradient-to-br from-green-50 to-green-100'
          }`}
        >
          <div className="mb-3 flex justify-center">
            <div className="p-3 bg-green-500 bg-opacity-20 rounded-full">
              <Activity className="w-8 h-8 text-green-500 animate-pulse" />
            </div>
          </div>
          <div className={`text-4xl font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
            {activeNodesCount}
          </div>
          <div className={`mt-2 text-sm font-medium ${isDark ? 'text-ink-400' : 'text-ink-500'}`}>
            Active Nodes
          </div>
        </div>

        <div
          className={`glass-panel rounded-2xl border p-6 text-center card-hover ${
            isDark
              ? 'border-white/10 bg-gradient-to-br from-teal-900/50 to-teal-800/50'
              : 'border-white/20 bg-gradient-to-br from-teal-50 to-teal-100'
          }`}
        >
          <div className="mb-3 flex justify-center">
            <div className="p-3 bg-teal-500 bg-opacity-20 rounded-full">
              <Activity className="w-8 h-8 text-teal-500" />
            </div>
          </div>
          <div className={`text-4xl font-bold ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>
            {activePercentage}%
          </div>
          <div className={`mt-2 text-sm font-medium ${isDark ? 'text-ink-400' : 'text-ink-500'}`}>
            Health Rate
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div
        className={`glass-panel rounded-2xl border p-6 ${
          isDark ? 'border-white/10' : 'border-white/20'
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400`}
            />
            <input
              type="text"
              placeholder="Search by Peer ID, IP address, or status..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="glass-input w-full rounded-xl py-3 pl-12 pr-4 text-base font-medium"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500 bg-opacity-10 rounded-lg">
              <Filter className={`h-5 w-5 text-blue-500`} />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="glass-input rounded-xl px-5 py-3 font-medium"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Nodes List */}
      {loading ? (
        <div
          className={`glass-panel rounded-2xl border p-8 text-center ${
            isDark ? 'border-white/10' : 'border-white/20'
          }`}
        >
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          <p className={`font-medium ${isDark ? 'text-ink-300' : 'text-ink-600'}`}>
            Loading network nodes...
          </p>
        </div>
      ) : filteredNodes.length > 0 ? (
        <div
          className={`glass-panel overflow-hidden rounded-2xl border ${
            isDark ? 'border-white/10' : 'border-white/20'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead
                className={isDark ? 'bg-ink-900/50 text-ink-300' : 'bg-ink-100/50 text-ink-600'}
              >
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Node Info</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">IP Address</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-white/10' : 'divide-white/20'}`}>
                {filteredNodes.map((node, index) => (
                  <tr
                    key={node.peer_id}
                    className={`transition-colors ${
                      isDark ? 'hover:bg-white/5' : 'hover:bg-white/10'
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full ${
                            node.status === 'active'
                              ? 'bg-green-500/20'
                              : 'bg-gray-500/20'
                          }`}
                        >
                          <Database
                            className={`h-5 w-5 ${
                              node.status === 'active' ? 'text-green-500' : 'text-gray-500'
                            }`}
                          />
                        </div>
                        <div>
                          <div
                            className={`font-mono text-sm font-medium break-all ${
                              isDark ? 'text-ink-50' : 'text-ink-900'
                            }`}
                          >
                            {node.peer_id}
                          </div>
                          <div
                            className="text-xs text-ink-400"
                          >
                            Node #{index + 1}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(node.status)}</td>
                    <td className="px-6 py-4">
                      <div
                        className={`font-mono text-sm ${
                          isDark ? 'text-ink-400' : 'text-ink-500'
                        }`}
                      >
                        {extractIP(node.multiaddr)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => onNodeClick?.(node.peer_id)}
                        className="btn-glass inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                      >
                        <Eye className="h-4 w-4" />
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div
          className={`glass-panel rounded-2xl border p-8 text-center ${
            isDark ? 'border-white/10' : 'border-white/20'
          }`}
        >
          <Database
            className={`mx-auto mb-4 h-16 w-16 ${isDark ? 'text-ink-500' : 'text-ink-400'}`}
          />
          <h3 className={`mb-2 text-xl font-bold ${isDark ? 'text-ink-50' : 'text-ink-900'}`}>
            No nodes found
          </h3>
          <p className={isDark ? 'text-ink-400' : 'text-ink-500'}>
            {searchText
              ? 'Try adjusting your search or filter criteria'
              : 'No nodes are currently available'}
          </p>
        </div>
      )}
    </div>
  );
}
