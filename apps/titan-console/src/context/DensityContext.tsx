/**
 * Density Context
 *
 * Provides compact/comfortable density modes for the Operator OS.
 * Toggleable via ⌘. or UI control.
 * The chosen mode is persisted to localStorage and applied as a data attribute on <html>.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export type DensityMode = 'comfortable' | 'compact';

interface DensityContextType {
  mode: DensityMode;
  toggle: () => void;
  setMode: (mode: DensityMode) => void;
}

const STORAGE_KEY = 'titan-density';

const DensityContext = createContext<DensityContextType | undefined>(undefined);

export function DensityProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DensityMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'compact' ? 'compact' : 'comfortable';
  });

  const setMode = useCallback((m: DensityMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === 'comfortable' ? 'compact' : 'comfortable');
  }, [mode, setMode]);

  // Apply data attribute on <html> so CSS can target [data-density="compact"]
  useEffect(() => {
    document.documentElement.setAttribute('data-density', mode);
  }, [mode]);

  // Keyboard shortcut: ⌘.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '.' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggle]);

  return (
    <DensityContext.Provider value={{ mode, toggle, setMode }}>
      {children}
    </DensityContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDensity() {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error('useDensity must be used within DensityProvider');
  return ctx;
}
