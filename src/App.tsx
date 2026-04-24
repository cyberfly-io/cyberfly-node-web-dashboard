import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useParams, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutDashboard, Database, Search, HardDrive, Key, Menu, X, Settings, Users, Sun, Moon, Activity, Wallet, Cloud, Network, Video, FileVideo, Brain } from 'lucide-react';
import Dashboard from './components/Dashboard';
import DataSubmit from './components/DataSubmit';
import DataQuery from './components/DataQuery';
import BlobManager from './components/BlobManager';
import { KeyPairManager } from './components/KeyPairManager';
import { SettingsModal } from './components/Settings';
import PeerConnection from './components/PeerConnection';
import Metrics from './components/Metrics';
import MyNodes from './components/MyNodes';
import AllNodes from './components/AllNodes';
import NodeDetails from './components/NodeDetails';
import LiveStreaming from './components/LiveStreaming';
import VideoFileStreaming from './components/VideoFileStreaming';
import AIInference from './components/AIInference';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { KadenaWalletProvider, useKadenaWallet } from './context/KadenaWalletContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Wrapper for NodeDetails that uses URL params
function NodeDetailsRoute() {
  const { peerId } = useParams<{ peerId: string }>();
  const navigate = useNavigate();

  if (!peerId) {
    navigate('/all-nodes');
    return null;
  }

  return <NodeDetails peerId={peerId} onBack={() => navigate(-1)} />;
}

// Wrapper for MyNodes with navigation
function MyNodesRoute() {
  const navigate = useNavigate();
  return <MyNodes onNodeClick={(peerId) => navigate(`/node/${peerId}`)} />;
}

// Wrapper for AllNodes with navigation
function AllNodesRoute() {
  const navigate = useNavigate();
  return <AllNodes onNodeClick={(peerId) => navigate(`/node/${peerId}`)} />;
}

function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { account, initializeKadenaWallet, disconnectWallet, isInstalled } = useKadenaWallet();

  const navigation = [
    { path: '/', name: 'Dashboard', icon: LayoutDashboard },
    { path: '/metrics', name: 'Metrics', icon: Activity },
    { path: '/my-nodes', name: 'My Nodes', icon: Cloud },
    { path: '/all-nodes', name: 'All Nodes', icon: Network },
    { path: '/keypair', name: 'KeyPair', icon: Key },
    { path: '/submit', name: 'Store Data', icon: Database },
    { path: '/query', name: 'Query Data', icon: Search },
    { path: '/blobs', name: 'Blob Storage', icon: HardDrive },
    { path: '/ai-inference', name: 'AI Inference', icon: Brain },
    { path: '/peers', name: 'Connect Peer', icon: Users },
    { path: '/streaming', name: 'Live Streaming', icon: Video },
    { path: '/video-files', name: 'Video Files', icon: FileVideo },
  ];

  return (
    <div className="min-h-screen text-ink-900 dark:text-ink-100">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 glass dark:glass-dark shadow-card dark:shadow-card-dark border-r border-white/40 dark:border-white/10 transform transition-all duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        {/* Brand */}
        <div className="relative px-5 py-5 border-b border-white/40 dark:border-white/10 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-violet-500/15 to-pink-500/10 pointer-events-none" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 opacity-60 blur-md" />
                <div className="relative p-2 rounded-xl bg-ink-900/80 dark:bg-ink-950/90 border border-white/10 backdrop-blur-sm">
                  <img src="/newlogo.png" alt="CyberFly" className="w-6 h-6 object-contain" />
                </div>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-display text-xl font-bold tracking-tight gradient-text">CyberFly</span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-ink-500 dark:text-ink-400">Node Dashboard</span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg text-ink-600 dark:text-ink-300 hover:bg-white/60 dark:hover:bg-white/5 transition-colors"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1 overflow-y-auto custom-scrollbar max-h-[calc(100vh-210px)]">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() => {
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'text-white bg-gradient-to-r from-cyan-500/90 via-blue-500/90 to-violet-500/90 shadow-neon'
                      : 'text-ink-700 dark:text-ink-300 hover:text-ink-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full transition-all duration-300 ${
                        isActive
                          ? 'bg-gradient-to-b from-cyan-300 to-violet-400 shadow-[0_0_10px_rgba(34,211,238,0.9)]'
                          : 'bg-transparent'
                      }`}
                    />
                    <Icon className={`w-[18px] h-[18px] transition-transform duration-200 group-hover:scale-110 ${isActive ? '' : 'text-ink-500 dark:text-ink-400 group-hover:text-cyan-500 dark:group-hover:text-cyan-300'}`} />
                    <span className="font-semibold tracking-tight">{item.name}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 px-5 py-4 border-t border-white/40 dark:border-white/10 bg-white/30 dark:bg-ink-950/40 backdrop-blur-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="neon-dot" />
            <span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-ink-700 dark:text-ink-200">Rust Core Online</span>
          </div>
          <div className="text-[11px] text-ink-500 dark:text-ink-400 font-mono">
            v0.1.0 · Iroh + Sled
          </div>
        </div>
      </aside>

      {/* Mobile menu button */}
      <div className={`lg:hidden fixed top-4 left-4 z-40 items-center gap-3 ${sidebarOpen ? 'hidden' : 'flex'}`}>
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-3 btn-neon rounded-xl"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 px-3 py-2 glass dark:glass-dark rounded-xl border border-white/40 dark:border-white/10">
          <img src="/newlogo.png" alt="CyberFly" className="w-5 h-5 object-contain" />
          <span className="font-display text-lg font-bold gradient-text">CyberFly</span>
        </div>
      </div>

      {/* Header action cluster */}
      <div className="fixed top-5 right-5 z-40 flex items-center gap-2.5">
        {isInstalled && (
          <button
            onClick={() => (account ? disconnectWallet() : initializeKadenaWallet('eckoWallet'))}
            className={`group px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-semibold transition-all duration-200 backdrop-blur-xl border ${
              account
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/40 hover:bg-emerald-500/25'
                : 'btn-neon border-cyan-400/40'
            }`}
            title={account ? 'Disconnect wallet' : 'Connect wallet'}
          >
            <Wallet className="w-4 h-4" />
            {account ? (
              <span className="hidden sm:inline font-mono text-xs">
                {account.slice(0, 6)}…{account.slice(-4)}
              </span>
            ) : (
              <span className="hidden sm:inline">Connect</span>
            )}
          </button>
        )}

        <button
          onClick={toggleTheme}
          className="p-2.5 glass dark:glass-dark rounded-xl border border-white/40 dark:border-white/10 hover:border-cyan-400/50 dark:hover:border-cyan-400/40 transition-all duration-200 hover:shadow-neon"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-600" />
          )}
        </button>

        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2.5 glass dark:glass-dark rounded-xl border border-white/40 dark:border-white/10 hover:border-cyan-400/50 dark:hover:border-cyan-400/40 transition-all duration-200 hover:shadow-neon"
          title="Settings"
        >
          <Settings className="w-4 h-4 text-ink-700 dark:text-ink-200" />
        </button>
      </div>

      {/* Main content */}
      <main className="lg:ml-64 min-h-screen transition-all duration-300">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/my-nodes" element={<MyNodesRoute />} />
          <Route path="/all-nodes" element={<AllNodesRoute />} />
          <Route path="/node/:peerId" element={<NodeDetailsRoute />} />
          <Route path="/keypair" element={<KeyPairManager />} />
          <Route path="/submit" element={<DataSubmit />} />
          <Route path="/query" element={<DataQuery />} />
          <Route path="/blobs" element={<BlobManager />} />
          <Route path="/ai-inference" element={<AIInference />} />
          <Route path="/peers" element={<PeerConnection />} />
          <Route path="/streaming" element={<LiveStreaming />} />
          <Route path="/video-files" element={<VideoFileStreaming />} />
        </Routes>
      </main>

      {/* Settings Modal */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-ink-950/60 z-40 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <KadenaWalletProvider>
          <QueryClientProvider client={queryClient}>
            <AppContent />
          </QueryClientProvider>
        </KadenaWalletProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
