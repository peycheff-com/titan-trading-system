import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getWsBaseUrl } from '@/lib/api-config';

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';

interface WebSocketOptions<T = unknown> {
  url?: string;
  onMessage?: (data: T) => void;
  reconnectInterval?: number;
  maxRetries?: number;
}

export function useWebSocket<T = unknown>({
  url = getWsBaseUrl(),
  onMessage,
  reconnectInterval = 3000,
  maxRetries = 10,
}: WebSocketOptions<T> = {}) {
  const [status, setStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const [error, setError] = useState<Error | null>(null);
  const [lastMessage, setLastMessage] = useState<T | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    try {
      const fullUrl = `${url}/ws/console`;
      console.log('Connecting to WebSocket:', fullUrl);
      setStatus('CONNECTING');

      const ws = new WebSocket(fullUrl);
      wsRef.current = ws;

      // eslint-disable-next-line functional/immutable-data
      ws.onopen = () => {
        console.log('WebSocket Connected');
        setStatus('CONNECTED');
        reconnectCountRef.current = 0;
        setError(null);
        toast.success('Connected to Titan Core');
      };

      // eslint-disable-next-line functional/immutable-data
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          onMessage?.(data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      // eslint-disable-next-line functional/immutable-data
      ws.onclose = (event) => {
        console.log('WebSocket Disconnected:', event.code, event.reason);
        setStatus('DISCONNECTED');
        wsRef.current = null;

        if (reconnectCountRef.current < maxRetries) {
          setStatus('RECONNECTING');
          reconnectTimerRef.current = setTimeout(() => {
            reconnectCountRef.current += 1;
            connect();
          }, reconnectInterval);
        } else {
          setError(new Error('Max reconnection attempts reached'));
          toast.error('Connection lost. Please refresh.');
        }
      };

      // eslint-disable-next-line functional/immutable-data
      ws.onerror = (event) => {
        console.error('WebSocket Error:', event);
        setError(new Error('WebSocket connection error'));
      };
    } catch (e) {
      console.error('WebSocket Connection Failed:', e);
      setStatus('DISCONNECTED');
      setError(e instanceof Error ? e : new Error('Unknown error'));
    }
  }, [url, onMessage, reconnectInterval, maxRetries]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [connect]);

  const sendMessage = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket not connected, cannot send message');
      toast.error('Not connected to backend');
    }
  }, []);

  return { status, error, sendMessage, lastMessage };
}
