import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search, Database, ChevronDown, ChevronUp, Zap, Clock, Key } from 'lucide-react';
import { 
  getDataByDbName, 
  getDataByDbNameAndType,
  type DataEntry 
} from '../api/client';
import { loadKeyPair } from '../utils/crypto';

export default function DataQuery() {
  const [storeType, setStoreType] = useState('');
  const [dbName, setDbName] = useState('');
  const [latency, setLatency] = useState<number | null>(null);

  // Auto-load dbName from keypair
  const keyPair = loadKeyPair();
  const defaultDbName = keyPair ? `mydb-${keyPair.publicKey}` : '';

  const dbQuery = useQuery({
    queryKey: ['dbData', dbName, storeType],
    queryFn: async () => {
      const startTime = performance.now();
      const targetDbName = dbName || defaultDbName;
      if (!targetDbName) {
        throw new Error('No database name specified');
      }
      let result;
      if (storeType) {
        result = await getDataByDbNameAndType(targetDbName, storeType);
      } else {
        result = await getDataByDbName(targetDbName);
      }
      const endTime = performance.now();
      setLatency(endTime - startTime);
      return result;
    },
    enabled: (dbName.length > 0 || defaultDbName.length > 0),
  });

  const data = dbQuery.data || [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header & Controls */}
      <div className="glass dark:glass-dark rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl border border-white/20 dark:border-gray-700/50">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-xl shadow-lg backdrop-blur-sm">
                <Database className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Query Data</h1>
                <p className="text-blue-100">Explore stored data across the network</p>
              </div>
            </div>
            <button
              onClick={() => dbQuery.refetch()}
              disabled={dbQuery.isFetching}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl backdrop-blur-sm transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${dbQuery.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="p-6 bg-white/50 dark:bg-gray-800/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                placeholder={`Database Name (default: ${defaultDbName ? 'Your DB' : '...'})`}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 shadow-sm transition-all"
              />
            </div>
            <div className="relative">
              <select
                value={storeType}
                onChange={(e) => setStoreType(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 shadow-sm transition-all appearance-none"
              >
                <option value="">All Types</option>
                <option value="String">String</option>
                <option value="Hash">Hash</option>
                <option value="List">List</option>
                <option value="Set">Set</option>
                <option value="SortedSet">Sorted Set</option>
                <option value="Json">JSON</option>
                <option value="Stream">Stream</option>
                <option value="TimeSeries">Time Series</option>
                <option value="Geo">Geospatial</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="glass dark:glass-dark rounded-2xl shadow-xl overflow-hidden backdrop-blur-xl border border-white/20 dark:border-gray-700/50">
        <div className="px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              Results 
              <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs">
                {data.length}
              </span>
            </h2>
            {latency !== null && !dbQuery.isFetching && (
              <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1 bg-green-100 dark:bg-green-900/20 px-2 py-1 rounded-lg">
                <Zap className="w-3 h-3 text-green-600 dark:text-green-400" /> 
                {latency.toFixed(2)}ms
              </span>
            )}
          </div>
        </div>

        <div className="divide-y divide-gray-200/50 dark:divide-gray-700/50 max-h-[600px] overflow-y-auto custom-scrollbar">
          {dbQuery.isFetching && data.length === 0 ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">Fetching data...</p>
            </div>
          ) : data.length === 0 ? (
            <div className="p-12 text-center">
              <Database className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No data found</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try adjusting your search or store type</p>
            </div>
          ) : (
            data.map((entry, index) => (
              <DataEntryRow key={`${entry.key}-${index}`} entry={entry} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DataEntryRow({ entry }: { entry: DataEntry }) {
  const [expanded, setExpanded] = useState(false);

  const getStoreTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      String: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      Hash: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800',
      List: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800',
      Set: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
      SortedSet: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800',
      Json: 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-300 border-pink-200 dark:border-pink-800',
      Stream: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
      TimeSeries: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800',
      Geo: 'bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800',
    };
    return colors[type] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700';
  };

  return (
    <div className="group p-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors duration-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${getStoreTypeColor(entry.storeType)}`}>
              {entry.storeType}
            </span>
            <code className="text-sm font-mono font-semibold text-gray-700 dark:text-gray-200 truncate" title={entry.key}>
              {entry.key}
            </code>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            {expanded ? (
              <div className="mt-3 relative">
                <pre className="p-4 bg-gray-900 text-gray-100 rounded-xl overflow-x-auto text-xs font-mono shadow-inner">
                  {JSON.stringify(entry.value, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="truncate font-mono text-xs opacity-80">
                {typeof entry.value === 'object' 
                  ? JSON.stringify(entry.value)
                  : String(entry.value)
                }
              </p>
            )}
          </div>

          {entry.metadata && expanded && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="flex items-center gap-1.5 font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    <Key className="w-3 h-3" /> Public Key
                  </span>
                  <code className="block p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 break-all">
                    {entry.metadata.publicKey}
                  </code>
                </div>
                <div>
                  <span className="flex items-center gap-1.5 font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    <Clock className="w-3 h-3" /> Timestamp
                  </span>
                  <p className="p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                    {new Date(entry.metadata.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-shrink-0 p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
