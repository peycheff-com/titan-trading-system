import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getApiBaseUrl } from '@/lib/api-config';
import { type HealthReport, type Position } from '../types/sentinel'; // We need to define these types or import generic ones

// Define local types if not available in shared
export interface SentinelState {
  isConnected: boolean;
  health: HealthReport | null; // From types/portfolio.ts basically
  lastEvent: string | null;
}

export function useSentinelSocket() {
  const [state, setState] = useState<SentinelState>({
    isConnected: false,
    health: null,
    lastEvent: null,
  });

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    try {
      // Connect to Titan Brain which proxies or broadcasts Sentinel data
      // Assuming Brain exposes /ws/console or similar, but for specific Phase it might be /ws/sentinel
      // Based on Brain config, it has `ws/console`. Let's assume console WS broadcasts everything via NATS consumer.
      // So we might just listen to the main console socket and filter.
      // BUT `useScavengerSocket` connects to `/ws/scavenger`.
      // Let's assume we map `/ws/sentinel` similarly in the gateway or Brain.

      const baseUrl = getApiBaseUrl(); // Usually Brain URL
      const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws/sentinel';
      console.log('Connecting to Sentinel WS:', wsUrl);

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('✅ Sentinel WS Connected');
        setState((prev) => ({ ...prev, isConnected: true }));
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'sentinel' }));
      };

      ws.onclose = () => {
        console.log('🔌 Sentinel WS Disconnected');
        setState((prev) => ({ ...prev, isConnected: false }));
        socketRef.current = null;
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.warn('⚠️ Sentinel WS Error:', error);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'snapshot' || message.type === 'update') {
            // Expecting message.data to be SentinelState (HealthReport etc)
            if (message.data && message.data.health) {
              setState((prev) => ({
                ...prev,
                health: message.data.health,
              }));
            }
          } else if (message.type === 'rebalance_event') {
            toast.info(`⚖️ Rebalance: ${message.data.action} on ${message.data.symbol}`);
            setState((prev) => ({
              ...prev,
              lastEvent: `Rebalance: ${message.data.action}`,
            }));
          }
        } catch (e) {
          console.error('Failed to parse Sentinel WS message', e);
        }
      };

      socketRef.current = ws;
    } catch (error) {
      console.error('WS Connection failed', error);
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (socketRef.current) socketRef.current.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return state;
}
