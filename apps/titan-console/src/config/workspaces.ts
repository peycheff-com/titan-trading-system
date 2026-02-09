/**
 * Workspace Registry
 *
 * Defines the canonical workspaces for Operator OS.
 * Each workspace groups related widgets as center tabs with an optional bottom panel.
 *
 * Single source of truth for workspace definitions.
 * Consumed by: WorkspaceContext, WorkspaceSwitcher, CommandPalette, Sidebar
 */

import type { LucideIcon } from 'lucide-react';
import {
  MessageSquare,
  TrendingUp,
  ShieldCheck,
  Target,
  BrainCircuit,
  Server,
  BookOpen,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceDef {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Lucide icon */
  icon: LucideIcon;
  /** Keyboard shortcut number (⌘1–⌘9) */
  shortcutKey: number;
  /** Widget IDs for center tabs (order matters) */
  tabs: string[];
  /** Default active tab (widget ID) */
  defaultTab: string;
  /** Widget IDs for bottom panel (empty = no bottom panel) */
  bottomPanels?: string[];
}

// ---------------------------------------------------------------------------
// Canonical Workspaces
// ---------------------------------------------------------------------------

export const WORKSPACES: WorkspaceDef[] = [
  {
    id: 'command',
    name: 'Command',
    icon: MessageSquare,
    shortcutKey: 1,
    tabs: ['chatops', 'overview', 'live'],
    defaultTab: 'chatops',
    bottomPanels: ['alerts'],
  },
  {
    id: 'trading',
    name: 'Trading',
    icon: TrendingUp,
    shortcutKey: 2,
    tabs: ['trade', 'history'],
    defaultTab: 'trade',
  },
  {
    id: 'risk',
    name: 'Risk',
    icon: ShieldCheck,
    shortcutKey: 3,
    tabs: ['risk', 'alerts'],
    defaultTab: 'risk',
  },
  {
    id: 'strategy',
    name: 'Strategy',
    icon: Target,
    shortcutKey: 4,
    tabs: ['scavenger', 'hunter', 'sentinel'],
    defaultTab: 'scavenger',
  },
  {
    id: 'systems',
    name: 'Systems',
    icon: BrainCircuit,
    shortcutKey: 5,
    tabs: ['brain', 'execution', 'ai-quant', 'decision-log'],
    defaultTab: 'brain',
  },
  {
    id: 'ops',
    name: 'Ops',
    icon: Server,
    shortcutKey: 6,
    tabs: ['infra', 'config', 'venues', 'credentials', 'identity', 'settings'],
    defaultTab: 'infra',
  },
  {
    id: 'journal',
    name: 'Journal',
    icon: BookOpen,
    shortcutKey: 7,
    tabs: ['journal', 'history', 'powerlaw'],
    defaultTab: 'journal',
  },
];

/** Lookup workspace by ID */
export const WORKSPACE_MAP = new Map(WORKSPACES.map((w) => [w.id, w]));

/** Lookup workspace by shortcut key */
export const WORKSPACE_BY_KEY = new Map(WORKSPACES.map((w) => [w.shortcutKey, w]));
