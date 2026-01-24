import { useEffect, useRef, useState } from 'react';

export interface StreamMessage<T = unknown> {
  subject: string;
  data: T;
  timestamp: number;
}

export function useTitanStream(subjectFilter: string = '>') {
  const [lastMessage, setLastMessage] = useState<StreamMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to Titan Brain WS Proxy
    // In prod, this would be env var
    const token = localStorage.getItem('titan_jwt');
    if (!token) {
      console.warn('⚠️ No auth token found, skipping WS connection');
      return;
    }

    const wsUrl = `ws://localhost:3100/ws/stream?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

     
    ws.onopen = () => {
      console.log('✅ Connected to Titan Stream');
      setIsConnected(true);
      // Subscribe logic if supported by proxy
      ws.send(JSON.stringify({ type: 'SUBSCRIBE', subject: subjectFilter }));
    };

     
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Assume standard envelope
        setLastMessage({
          subject: data.subject || 'unknown',
          data: data.payload || data,
          timestamp: Date.now(),
        });
      } catch (e) {
        console.error('Failed to parse WS msg', e);
      }
    };

     
    ws.onclose = () => {
      console.log('❌ Disconnected from Titan Stream');
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [subjectFilter]);

  return { lastMessage, isConnected };
}
