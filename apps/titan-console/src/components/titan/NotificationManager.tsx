import { useEffect, useRef } from 'react';
import { useTitanWebSocket } from '@/context/WebSocketContext';
import { toast } from 'sonner';

interface WebSocketMessage {
  type: string;
  payload?: any;
}

export const NotificationManager = () => {
  const { lastMessage } = useTitanWebSocket();
  // Keep track of the last processed message ID or timestamp if available to avoid duplicates
  // For now, we rely on the fact that lastMessage reference changes only on new messages

  useEffect(() => {
    if (!lastMessage) return;

    // Type guards/casting would be better in a stricter setup,
    // assuming lastMessage matches specific shapes.
    const msg = lastMessage as WebSocketMessage;

    switch (msg.type) {
      case 'RISK_ALERT':
        toast.error('Risk Alert', {
          description: msg.payload?.message || 'Critical risk threshold breached.',
          duration: 5000,
        });
        break;

      case 'ORDER_FILLED':
        toast.success('Order Filled', {
          description: `${msg.payload?.side} ${msg.payload?.symbol} @ ${msg.payload?.price}`,
        });
        // Play sound if we were fancy
        break;

      case 'ORDER_REJECTED':
        toast.warning('Order Rejected', {
          description: msg.payload?.reason || 'Order could not be processed.',
        });
        break;

      case 'SYSTEM_HALT':
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
        toast.error('Circuit Breaker Tripped', {
          description: `System halted due to ${msg.payload?.reason || 'volatility'}.`,
          duration: 10000,
        });
        break;
    }
  }, [lastMessage]);

  return null; // Headless component
};
