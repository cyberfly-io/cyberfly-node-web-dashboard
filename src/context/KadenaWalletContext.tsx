import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

// Types based on cyberfly-node-ui implementation
interface KadenaWalletState {
  isConnected: boolean;
  isInstalled: boolean;
  account: string | null;
}

interface KadenaWalletContextType extends KadenaWalletState {
  initializeKadenaWallet: (walletName: string) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  requestSign: (signingCmd: unknown) => Promise<unknown>;
  showNotification: (message: string, severity: 'success' | 'error' | 'warning' | 'info') => void;
}

interface NotificationState {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
}

interface AccountInfo {
  wallet?: { account: string };
  status?: string;
}

interface ConnectResult {
  status?: string;
}

interface NetworkInfo {
  networkId?: string;
}

type KadenaExtension = NonNullable<Window['kadena']>;

const KadenaWalletContext = createContext<KadenaWalletContextType | undefined>(undefined);

export const useKadenaWallet = () => {
  const context = useContext(KadenaWalletContext);
  if (!context) {
    throw new Error('useKadenaWallet must be used within KadenaWalletProvider');
  }
  return context;
};

const NETWORKID = 'mainnet01';

export const KadenaWalletProvider = ({ children }: { children: ReactNode }) => {
  const [notification, setNotification] = useState<NotificationState>({
    open: false,
    message: '',
    severity: 'info',
  });

  const [kadenaExt, setKadenaExt] = useState<KadenaExtension | null>(null);
  
  const [kadenaWalletState, setKadenaWalletState] = useState<KadenaWalletState>(() => {
    const saved = localStorage.getItem('KadenaWalletState');
    return saved ? JSON.parse(saved) : {
      isConnected: false,
      isInstalled: false,
      account: null,
    };
  });

  const showNotification = useCallback(
    (message: string, severity: 'success' | 'error' | 'warning' | 'info' = 'info') => {
      setNotification({
        open: true,
        message,
        severity,
      });
    },
    []
  );

  const hideNotification = useCallback(() => {
    setNotification((prev) => ({ ...prev, open: false }));
  }, []);

  // Initialize Kadena extension
  const initialize = useCallback(() => {
    const { kadena } = window;
    if (kadena?.isKadena) {
      setKadenaExt(kadena);
      setKadenaWalletState((prev) => ({
        ...prev,
        isInstalled: true,
      }));
    }
  }, []);

  useEffect(() => {
    const handleLoad = () => initialize();
    if (document.readyState === 'complete') {
      initialize();
    } else {
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, [initialize]);

  // Save state to localStorage
  useEffect(() => {
    localStorage.setItem('KadenaWalletState', JSON.stringify(kadenaWalletState));
    if (kadenaWalletState.account) {
      localStorage.setItem('kadenaAccount', kadenaWalletState.account);
    } else {
      localStorage.removeItem('kadenaAccount');
    }
  }, [kadenaWalletState]);

  const getNetworkInfo = async (): Promise<NetworkInfo | null> => {
    if (!kadenaExt) return null;
    try {
      return await kadenaExt.request<NetworkInfo>({
        method: 'kda_getNetwork',
      });
    } catch (error) {
      console.error('Error fetching network info:', error);
      return null;
    }
  };

  const connectWallet = async (): Promise<ConnectResult> => {
    if (!kadenaExt) return { status: 'fail' };
    return await kadenaExt.request<ConnectResult>({
      method: 'kda_connect',
      networkId: NETWORKID,
    });
  };

  const getAccountInfo = async (): Promise<AccountInfo | null> => {
    if (!kadenaExt) return null;
    return await kadenaExt.request<AccountInfo>({
      method: 'kda_requestAccount',
      networkId: NETWORKID,
    });
  };

  const setAccountData = async () => {
    const acc = await getAccountInfo();
    if (acc?.wallet) {
      setKadenaWalletState({
        account: acc.wallet.account,
        isInstalled: true,
        isConnected: true,
      });
    } else if (kadenaWalletState.isConnected) {
      const connectRes = await connectWallet();
      if (connectRes?.status === 'success') {
        await setAccountData();
      }
    }
  };

  const initializeKadenaWallet = async (walletName: string) => {
    if (walletName === 'eckoWallet') {
      const networkInfo = await getNetworkInfo();
      
      if (networkInfo == null) {
        showNotification('Please install Ecko Wallet Extension', 'warning');
      } else {
        if (networkInfo.networkId !== NETWORKID) {
          showNotification(`Please change network to ${NETWORKID}`, 'error');
        } else {
          const connectResponse = await connectWallet();
          if (connectResponse?.status === 'success') {
            await setAccountData();
            showNotification('Wallet Connected', 'success');
          }
        }
      }
    }
  };

  const disconnectWallet = async () => {
    if (kadenaExt) {
      setKadenaWalletState({
        ...kadenaWalletState,
        account: null,
        isConnected: false,
      });
      await kadenaExt.request({
        method: 'kda_disconnect',
        networkId: NETWORKID,
      });
      localStorage.removeItem('kadenaAccount');
      showNotification('Wallet Disconnected', 'success');
    }
  };

  const requestSign = async (signingCmd: unknown) => {
    if (!kadenaExt) return null;
    const account = await getAccountInfo();
    if (account?.status === 'fail') {
      showNotification('Wallet disconnected', 'error');
      return null;
    } else {
      return await kadenaExt.request({
        method: 'kda_requestSign',
        data: {
          networkId: NETWORKID,
          signingCmd,
        },
      });
    }
  };

  return (
    <KadenaWalletContext.Provider
      value={{
        ...kadenaWalletState,
        initializeKadenaWallet,
        disconnectWallet,
        requestSign,
        showNotification,
      }}
    >
      {children}
      {/* Notification UI - Bottom positioned toast */}
      {notification.open && (
        <div
          style={{
            position: 'fixed',
            bottom: '30px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '16px 24px',
            borderRadius: '12px',
            background:
              notification.severity === 'success'
                ? 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)'
                : notification.severity === 'error'
                ? 'linear-gradient(135deg, #f44336 0%, #e53935 100%)'
                : notification.severity === 'warning'
                ? 'linear-gradient(135deg, #ff9800 0%, #fb8c00 100%)'
                : 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)',
            color: 'white',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 10000,
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '15px',
            minWidth: '300px',
            textAlign: 'center',
            animation: 'slideUp 0.3s ease-out',
          }}
          onClick={hideNotification}
        >
          {notification.message}
        </div>
      )}
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </KadenaWalletContext.Provider>
  );
};
