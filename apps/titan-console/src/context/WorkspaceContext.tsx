/**
 * Workspace Context
 *
 * Manages the active workspace, active tab per workspace, and bottom panel state.
 * Persisted to localStorage so layout survives reload.
 *
 * Keyboard shortcuts:
 *  ⌘1–⌘7  Switch workspace
 *  ⌃Tab   Next center tab
 *  ⌃⇧Tab  Previous center tab
 *  ⌘J     Toggle bottom panel
 *  /      Open command palette (when no input focused)
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { WORKSPACES, WORKSPACE_MAP, WORKSPACE_BY_KEY, type WorkspaceDef } from '@/config/workspaces';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersistedState {
  activeWorkspaceId: string;
  tabPerWorkspace: Record<string, string>;
  bottomPanelOpen: boolean;
}

interface WorkspaceContextType {
  /** Current workspace definition */
  workspace: WorkspaceDef;
  /** Active tab ID within current workspace */
  activeTab: string;
  /** Whether the bottom panel is visible */
  bottomPanelOpen: boolean;
  /** Switch to a workspace by ID */
  switchWorkspace: (id: string) => void;
  /** Switch tab within the current workspace */
  switchTab: (tabId: string) => void;
  /** Toggle bottom panel */
  toggleBottomPanel: () => void;
  /** All workspace definitions */
  workspaces: readonly WorkspaceDef[];
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'titan-workspace';
const DEFAULT_WORKSPACE_ID = 'command';

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (parsed.activeWorkspaceId && WORKSPACE_MAP.has(parsed.activeWorkspaceId)) {
        return {
          activeWorkspaceId: parsed.activeWorkspaceId,
          tabPerWorkspace: parsed.tabPerWorkspace ?? {},
          bottomPanelOpen: parsed.bottomPanelOpen ?? false,
        };
      }
    }
  } catch {
    // corrupt storage — fall through
  }
  return {
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    tabPerWorkspace: {},
    bottomPanelOpen: false,
  };
}

function saveState(state: PersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState);

  // Persist on every state change
  useEffect(() => {
    saveState(state);
  }, [state]);

  const workspace = WORKSPACE_MAP.get(state.activeWorkspaceId) ?? WORKSPACES[0];
  const activeTab =
    state.tabPerWorkspace[workspace.id] && workspace.tabs.includes(state.tabPerWorkspace[workspace.id])
      ? state.tabPerWorkspace[workspace.id]
      : workspace.defaultTab;

  // Broadcast channel for multi-window sync
  const channelRef = React.useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel('titan-workspace');
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<PersistedState>) => {
      // SOTA: Sync state from other windows instantly
      setState(event.data);
    };

    return () => {
      channel.close();
    };
  }, []);

  const switchWorkspace = useCallback((id: string) => {
    if (!WORKSPACE_MAP.has(id)) return;
    const newState = { ...state, activeWorkspaceId: id };
    setState(newState);
    channelRef.current?.postMessage(newState);
  }, [state]);

  const switchTab = useCallback(
    (tabId: string) => {
      if (!workspace.tabs.includes(tabId)) return;
      const newState = {
        ...state,
        tabPerWorkspace: { ...state.tabPerWorkspace, [workspace.id]: tabId },
      };
      setState(newState);
      channelRef.current?.postMessage(newState);
    },
    [workspace, state],
  );

  const toggleBottomPanel = useCallback(() => {
    const newState = { ...state, bottomPanelOpen: !state.bottomPanelOpen };
    setState(newState);
    channelRef.current?.postMessage(newState);
  }, [state]);

  // -----------------------------------------------------------------------
  // Keyboard shortcuts
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // ⌘1–⌘9 — switch workspace
      if (meta && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        const num = parseInt(e.key, 10);
        const target = WORKSPACE_BY_KEY.get(num);
        if (target) {
          e.preventDefault();
          switchWorkspace(target.id);
        }
        return;
      }

      // ⌃Tab / ⌃⇧Tab — cycle center tabs
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const ws = WORKSPACE_MAP.get(state.activeWorkspaceId) ?? WORKSPACES[0];
        const currentTab =
          state.tabPerWorkspace[ws.id] && ws.tabs.includes(state.tabPerWorkspace[ws.id])
            ? state.tabPerWorkspace[ws.id]
            : ws.defaultTab;
        const idx = ws.tabs.indexOf(currentTab);
        const next = e.shiftKey
          ? (idx - 1 + ws.tabs.length) % ws.tabs.length
          : (idx + 1) % ws.tabs.length;
        switchTab(ws.tabs[next]);
        return;
      }

      // ⌘J — toggle bottom panel
      if (meta && e.key === 'j') {
        e.preventDefault();
        toggleBottomPanel();
        return;
      }

      // / — focus command palette (only when no input/textarea focused)
      if (e.key === '/' && !meta && !e.altKey) {
        const active = document.activeElement;
        if (
          active &&
          (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            (active as HTMLElement).isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        // Dispatch ⌘K to trigger CommandPalette
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
        );
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [state, switchWorkspace, switchTab, toggleBottomPanel]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        activeTab,
        bottomPanelOpen: state.bottomPanelOpen,
        switchWorkspace,
        switchTab,
        toggleBottomPanel,
        workspaces: WORKSPACES,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
