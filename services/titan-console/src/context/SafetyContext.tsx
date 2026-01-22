import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface SafetyContextType {
  isArmed: boolean;
  arm: (durationMs?: number) => void;
  disarm: () => void;
  expiresAt: number | null;
}

const SafetyContext = createContext<SafetyContextType | null>(null);

export const useSafety = () => {
  const context = useContext(SafetyContext);
  if (!context) {
    throw new Error('useSafety must be used within a SafetyProvider');
  }
  return context;
};

export const SafetyProvider = ({ children }: { children: React.ReactNode }) => {
  const [isArmed, setIsArmed] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const disarm = () => {
    setIsArmed(false);
    setExpiresAt(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const arm = (durationMs: number = 30000) => {
    // Clear existing timer if any
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const expiry = Date.now() + durationMs;
    setExpiresAt(expiry);
    setIsArmed(true);

    toast.warning(`System ARMED for ${durationMs / 1000}s`, {
      description: 'Critical commands are now enabled. Proceed with caution.',
    });

    timerRef.current = setTimeout(() => {
      disarm();
      toast.info('System Disarmed', {
        description: 'Safety interlocks re-engaged automatically.',
      });
    }, durationMs);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <SafetyContext.Provider value={{ isArmed, arm, disarm, expiresAt }}>
      {children}
    </SafetyContext.Provider>
  );
};
