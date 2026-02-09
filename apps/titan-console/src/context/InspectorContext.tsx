/**
 * Inspector Panel Context
 *
 * Manages the state of the right-side Inspector panel:
 * - entity selection (what to display)
 * - open/close state
 * - width persistence
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InspectorEntity {
  type: 'position' | 'order' | 'intent' | 'incident' | 'config' | 'phase' | 'memory' | 'none';
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

// ... imports

// Defines the shape of messages exchanged between windows
type InspectorMessage = 
  | { type: 'INSPECTOR_UPDATE'; entity: InspectorEntity | null }
  | { type: 'INSPECTOR_SYNC_REQUEST' }
  | { type: 'INSPECTOR_SYNC_RESPONSE'; entity: InspectorEntity | null; isOpen: boolean };

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [entity, setEntity] = useState<InspectorEntity | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [width, setWidthState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return isNaN(parsed) ? DEFAULT_WIDTH : Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed));
  });

  // Refs for current state to avoid re-binding effect
  const entityRef = useRef(entity);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    entityRef.current = entity;
    isOpenRef.current = isOpen;
  }, [entity, isOpen]);

  // Broadcast channel for multi-window sync
  const channelRef = React.useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel('titan-inspector');
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<InspectorMessage>) => {
      const msg = event.data;
      if (msg.type === 'INSPECTOR_UPDATE') {
        setEntity(msg.entity);
        if (msg.entity) {
             setIsOpen(true);
        }
      } else if (msg.type === 'INSPECTOR_SYNC_REQUEST') {
        // Another window asked for state, reply with ours if we have an entity
        if (entityRef.current) {
          channel.postMessage({ type: 'INSPECTOR_SYNC_RESPONSE', entity: entityRef.current, isOpen: isOpenRef.current });
        }
      } else if (msg.type === 'INSPECTOR_SYNC_RESPONSE') {
        // We received initial state
        if (msg.entity) {
          setEntity(msg.entity);
          setIsOpen(true); // Auto-open if we synced an active entity
        }
      }
    };

    // On mount, if we are empty, ask for sync (likely we are the pop-out)
    if (!entityRef.current) {
      channel.postMessage({ type: 'INSPECTOR_SYNC_REQUEST' });
    }

    return () => {
      channel.close();
    };
  }, []); // Run once on mount

  // ... (keep width state logic separate or simple)

  const inspect = useCallback((newEntity: InspectorEntity) => {
    setEntity(newEntity);
    setIsOpen(true);
    // Broadcast change
    channelRef.current?.postMessage({ type: 'INSPECTOR_UPDATE', entity: newEntity });
  }, []);

  const clear = useCallback(() => {
    setEntity(null);
    setIsOpen(false);
     // Broadcast change
    channelRef.current?.postMessage({ type: 'INSPECTOR_UPDATE', entity: null });
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
      // ⌘K — focus chat input (global command palette)
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const chatInput = document.getElementById('operator-input');
        if (chatInput) {
          (chatInput as HTMLInputElement).focus();
          (chatInput as HTMLInputElement).select();
        }
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
