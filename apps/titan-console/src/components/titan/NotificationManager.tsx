import { useEffect, useRef } from 'react';
import { useTitanWebSocket } from '@/context/WebSocketContext';
import { toast } from 'sonner';

interface WebSocketMessage {
  type: string;
  payload?: Record<string, unknown>;
}

export const NotificationManager = () => {
  const { lastMessage } = useTitanWebSocket();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('/sounds/alert.mp3');
  }, []);

  const playSound = () => {
    if (audioRef.current) {
      audioRef.current.play().catch((e) => console.warn('Audio play failed', e));
    }
  };

  useEffect(() => {
    if (!lastMessage) return;

    // Type guards/casting would be better in a stricter setup,
    // assuming lastMessage matches specific shapes.
    const msg = lastMessage as WebSocketMessage;

    switch (msg.type) {
      case 'RISK_ALERT':
        playSound();
        toast.error('Risk Alert', {
          description: String(msg.payload?.message || 'Critical risk threshold breached.'),
          duration: 5000,
          action: {
            label: 'View Risk',
            onClick: () => window.location.href = '/risk', // Simple nav for now
          }
        });
        break;

      case 'ORDER_FILLED':
        toast.success('Order Filled', {
          description: `${String(msg.payload?.side ?? '')} ${String(msg.payload?.symbol ?? '')} @ ${String(msg.payload?.price ?? '')}`,
          action: {
            label: 'View',
            onClick: () => window.location.href = '/orders',
          }
        });
        break;

      case 'ORDER_REJECTED':
        playSound();
        toast.warning('Order Rejected', {
          description: String(msg.payload?.reason || 'Order could not be processed.'),
        });
        break;

      case 'SYSTEM_HALT':
        playSound();
        toast.error('SYSTEM HALT', {
          description: 'Emergency Halt Triggered. Trading Suspended.',
          duration: Infinity, // Sticky
          action: {
            label: 'Acknowledge',
            onClick: () => console.log('Halt Acknowledged'),
          },
        });
        break;

      case 'CIRCUIT_BREAKER_TRIP':
        playSound();
        toast.error('Circuit Breaker Tripped', {
          description: `System halted due to ${String(msg.payload?.reason || 'volatility')}.`,
          duration: 10000,
          action: {
            label: 'Reset',
            onClick: () => window.location.href = '/risk',
          },
        });
        break;
    }
  }, [lastMessage]);

  return null; // Headless component
};
