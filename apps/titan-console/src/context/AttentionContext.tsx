import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useTitanWebSocket } from './WebSocketContext';
import { NotificationPayload, NotificationType, Severity } from '@titan/shared';
import { toast } from 'sonner';

interface AttentionContextType {
  notifications: NotificationPayload[];
  activeBanner: NotificationPayload | null;
  unreadCount: number;
  isInboxOpen: boolean;
  setInboxOpen: (open: boolean) => void;
  dismiss: (id: string) => void;
  snooze: (id: string, durationMs: number) => void;
  clearAll: () => void;
}

const AttentionContext = createContext<AttentionContextType | undefined>(undefined);

export const AttentionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { lastMessage } = useTitanWebSocket();
  const [notifications, setNotifications] = useState<NotificationPayload[]>([]);
  const [isInboxOpen, setInboxOpen] = useState(false);

  // Derived state
  const unreadCount = notifications.filter(n => !n.acknowledged).length;

  // Active banner logic: Highest severity unacknowledged notification
  // Critical > High > Medium > Low
  const activeBanner = React.useMemo(() => {
    const unacked = notifications.filter(n => !n.acknowledged && !n.snoozed_until);
    if (unacked.length === 0) return null;

    // Sort by severity (assuming enum order or explicit weight) and timestamp
    const severityWeight: Record<Severity, number> = {
      'CRITICAL': 4,
      'WARNING': 3,
      'INFO': 2,
      'SUCCESS': 1,
    };

    return unacked.sort((a, b) => {
      const weightA = severityWeight[a.severity] || 0;
      const weightB = severityWeight[b.severity] || 0;
      if (weightA !== weightB) return weightB - weightA;
      return b.timestamp - a.timestamp;
    })[0];
  }, [notifications]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('titan_notifications');
      if (stored) {
        setNotifications(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load notifications', e);
    }
  }, []);

  // Save to localStorage whenever notifications change
  useEffect(() => {
    try {
      localStorage.setItem('titan_notifications', JSON.stringify(notifications));
    } catch (e) {
      console.error('Failed to save notifications', e);
    }
  }, [notifications]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    // TODO: We might need a stricter check if lastMessage structure is unknown
    // But assuming our backend sends { type: 'NOTIFICATION', payload: NotificationPayload }
    // Or if the message ITSELF is the payload if type is embedded?
    // Looking at WebSocketService.ts in brain:
    // broadcastNotification(payload) sends object with type: 'NOTIFICATION', ...payload
    
    // So lastMessage will have type: 'NOTIFICATION' and the rest properties
    if (lastMessage.type === 'NOTIFICATION' || lastMessage.type === NotificationType.SYSTEM_ERROR /* Legacy compat? */) { 
       const payload = lastMessage as NotificationPayload; // It has type, id, etc. directly on it based on verified implementation
       
       // Add to state
       setNotifications(prev => {
         // Dedup by ID
         if (prev.some(n => n.id === payload.id)) return prev;
         const newNotifications = [payload, ...prev];
         // Limit to 100
         return newNotifications.slice(0, 100);
       });

       const title = payload.reason_code.replace(/_/g, ' ');

       // Trigger Toast immediately for important ones
       if (payload.severity === 'CRITICAL' || payload.severity === 'WARNING') { // Treat HIGH (not in Shared?) as WARNING or CRITICAL? Shared has CRITICAL, WARNING, INFO, SUCCESS. Backend uses HIGH for priority but maps to severity?
         // NotificationService.ts maps priority to emojis but broadcastToConsole uses specific strings.
         // Let's check NotificationService.ts broadcastToConsole calls.
         // It used 'CRITICAL', 'WARNING', 'INFO'.
         // Shared types has 'CRITICAL', 'WARNING', 'INFO', 'SUCCESS'.
         
         const isCritical = payload.severity === 'CRITICAL';
         const toastFn = isCritical ? toast.error : toast.warning;
         
         toastFn(title, {
             description: payload.message,
             duration: isCritical ? Infinity : 5000,
         });
       } else if (payload.severity === 'INFO') {
            toast.info(title, { description: payload.message });
       } else if (payload.severity === 'SUCCESS') {
            toast.success(title, { description: payload.message });
       }
    }
  }, [lastMessage]);

  const dismiss = (id: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, acknowledged: true } : n
    ));
  };

  const snooze = (id: string, durationMs: number) => {
    setNotifications(prev => prev.map(n => 
        n.id === id ? { ...n, snoozed_until: Date.now() + durationMs } : n
      ));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <AttentionContext.Provider value={{ notifications, activeBanner, unreadCount, isInboxOpen, setInboxOpen, dismiss, snooze, clearAll }}>
      {children}
    </AttentionContext.Provider>
  );
};

export const useAttention = () => {
  const context = useContext(AttentionContext);
  if (context === undefined) {
    throw new Error('useAttention must be used within an AttentionProvider');
  }
  return context;
};
