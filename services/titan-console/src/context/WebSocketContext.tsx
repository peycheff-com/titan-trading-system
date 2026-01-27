import React, { createContext, useContext, ReactNode } from 'react';
import { useWebSocket, ConnectionStatus } from '@/hooks/useWebSocket';

interface WebSocketContextType {
  lastMessage: any;
  status: ConnectionStatus;
  sendMessage: (message: any) => void;
  isConnected: boolean;
  error: Error | null;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { status, error, sendMessage, lastMessage } = useWebSocket({
    // Using default URL from hook
    onMessage: (msg) => console.log('Global WS Message:', (msg as any)?.type),
  });

  const isConnected = status === 'CONNECTED';

  return (
    <WebSocketContext.Provider value={{ lastMessage, status, sendMessage, isConnected, error }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useTitanWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useTitanWebSocket must be used within a WebSocketProvider');
  }
  return context;
};
