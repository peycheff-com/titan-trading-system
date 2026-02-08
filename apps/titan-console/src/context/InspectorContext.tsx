/**
 * Inspector Panel Context
 *
 * Manages the state of the right-side Inspector panel:
 * - entity selection (what to display)
 * - open/close state
 * - width persistence
 */

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InspectorEntity {
  type: 'position' | 'order' | 'intent' | 'incident' | 'config' | 'phase' | 'none';
  id: string;
  title: string;
  data?: Record<string, unknown>;
}

interface InspectorContextType {
  /** Currently selected entity */
  entity: InspectorEntity | null;
  /** Whether the panel is open */
  isOpen: boolean;
  /** Panel width in pixels */
  width: number;
  /** Select an entity to show in the inspector */
  inspect: (entity: InspectorEntity) => void;
  /** Clear the inspector */
  clear: () => void;
  /** Toggle open/close */
  toggle: () => void;
  /** Set specific open state */
  setOpen: (open: boolean) => void;
  /** Set width (persisted to localStorage) */
  setWidth: (width: number) => void;
}

const STORAGE_KEY = 'titan-inspector-width';
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 280;
const MAX_WIDTH = 480;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const InspectorContext = createContext<InspectorContextType | undefined>(undefined);

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [entity, setEntity] = useState<InspectorEntity | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [width, setWidthState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return isNaN(parsed) ? DEFAULT_WIDTH : Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed));
  });

  const inspect = useCallback((entity: InspectorEntity) => {
    setEntity(entity);
    setIsOpen(true);
  }, []);

  const clear = useCallback(() => {
    setEntity(null);
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const setWidth = useCallback((w: number) => {
    const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w));
    setWidthState(clamped);
    localStorage.setItem(STORAGE_KEY, String(clamped));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ⌘\ — toggle Inspector
      if (e.key === '\\' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
      // Escape — close Inspector
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, toggle]);

  return (
    <InspectorContext.Provider
      value={{ entity, isOpen, width, inspect, clear, toggle, setOpen, setWidth }}
    >
      {children}
    </InspectorContext.Provider>
  );
}

export function useInspector() {
  const ctx = useContext(InspectorContext);
  if (!ctx) throw new Error('useInspector must be used within InspectorProvider');
  return ctx;
}
