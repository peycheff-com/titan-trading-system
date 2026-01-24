import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * SafetyContext - Manages the "Armed" state of the Operator Console.
 * 
 * DESIGN PHILOSOPHY:
 * Dangerous actions (Halt, Cancel, Override) are hidden or disabled by default.
 * The Operator must explicitly "Arm" the console to reveal these controls.
 * Armed state auto-disarms after a timeout to prevent accidental clicks.
 */

interface SafetyContextType {
  isArmed: boolean;
  armConsole: () => void;
  disarmConsole: () => void;
  toggleArmed: () => void;
}

const SafetyContext = createContext<SafetyContextType | undefined>(undefined);

export const SafetyProvider = ({ children }: { children: ReactNode }) => {
  const [isArmed, setIsArmed] = useState(false);
  const [armTimeout, setArmTimeout] = useState<NodeJS.Timeout | null>(null);

  const disarmConsole = useCallback(() => {
    setIsArmed(false);
    if (armTimeout) {
      clearTimeout(armTimeout);
      setArmTimeout(null);
    }
  }, [armTimeout]);

  const armConsole = useCallback(() => {
    setIsArmed(true);
    toast.warning("DANGER: Console Armed. Dangerous controls are now active.");
    
    // Auto-disarm after 60 seconds of inactivity (simple timeout for now)
    // In a real app, we might reset this timer on actions
    if (armTimeout) clearTimeout(armTimeout);
    
    const timeout = setTimeout(() => {
      setIsArmed(false);
      toast.info("Console auto-disarmed for safety.");
    }, 60000); 
    
    setArmTimeout(timeout);
  }, [armTimeout]);

  const toggleArmed = useCallback(() => {
    if (isArmed) {
      disarmConsole();
    } else {
      armConsole();
    }
  }, [isArmed, armConsole, disarmConsole]);

  return (
    <SafetyContext.Provider value={{ isArmed, armConsole, disarmConsole, toggleArmed }}>
      {children}
    </SafetyContext.Provider>
  );
};

export const useSafety = () => {
  const context = useContext(SafetyContext);
  if (context === undefined) {
    throw new Error('useSafety must be used within a SafetyProvider');
  }
  return context;
};
