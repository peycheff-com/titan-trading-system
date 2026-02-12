import React, { createContext, useContext, ReactNode } from 'react';
import { useWebSocket, ConnectionStatus } from '@/hooks/useWebSocket';

interface WebSocketContextType {
  lastMessage: unknown;
  status: ConnectionStatus;
  sendMessage: (message: Record<string, unknown>) => void;
  isConnected: boolean;
  error: Error | null;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { status, error, sendMessage, lastMessage } = useWebSocket({
    // Using default URL from hook
    onMessage: (msg) => console.log('Global WS Message:', (msg as Record<string, unknown>)?.type),
  });

  const isConnected = status === 'CONNECTED';

  return (
    <WebSocketContext.Provider value={{ lastMessage, status, sendMessage, isConnected, error }}>
      {children}
    </WebSocketContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTitanWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useTitanWebSocket must be used within a WebSocketProvider');
  }
  return context;
};
