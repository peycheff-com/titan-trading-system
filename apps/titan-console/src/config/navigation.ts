/**
 * Shared Navigation Configuration
 *
 * Single source of truth for all navigation items.
 * Consumed by: App.tsx (router), Sidebar.tsx, CommandPalette.tsx
 */
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Radio,
  Terminal,
  Bug,
  Target,
  Shield,
  Brain,
  Cpu,
  Zap,
  BrainCircuit,
  BookOpen,
  History,
  Bell,
  Server,
  TrendingUp,
  Key,
  Settings,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Phase = 'scavenger' | 'hunter' | 'sentinel';

export interface NavItem {
  /** Display name */
  name: string;
  /** Route path */
  path: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Strategy phase (for color coding) */
  phase?: Phase;
  /** Whether to show in CommandPalette (default: true) */
  searchable?: boolean;
}

export interface NavGroup {
  /** Group label */
  group: string;
  /** Items in this group */
  items: NavItem[];
}

// ---------------------------------------------------------------------------
// Navigation Items
// ---------------------------------------------------------------------------

export const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Command',
    items: [
      { name: 'Overview', path: '/', icon: LayoutDashboard },
      { name: 'Live Ops', path: '/live', icon: Radio },
      { name: 'Trade Control', path: '/trade', icon: Terminal },
      { name: 'Risk', path: '/risk', icon: TrendingUp },
    ],
  },
  {
    group: 'Strategy Phases',
    items: [
      { name: 'Scavenger', path: '/phases/scavenger', icon: Bug, phase: 'scavenger' },
      { name: 'Hunter', path: '/phases/hunter', icon: Target, phase: 'hunter' },
      { name: 'Sentinel', path: '/phases/sentinel', icon: Shield, phase: 'sentinel' },
    ],
  },
  {
    group: 'Organs',
    items: [
      { name: 'Brain', path: '/brain', icon: Brain },
      { name: 'AI Quant', path: '/ai-quant', icon: Cpu },
      { name: 'Execution', path: '/execution', icon: Zap },
      { name: 'Decision Log', path: '/decision-log', icon: BrainCircuit },
    ],
  },
  {
    group: 'Ops',
    items: [
      { name: 'Journal', path: '/journal', icon: BookOpen },
      { name: 'Trade History', path: '/history', icon: History },
      { name: 'Alerts', path: '/alerts', icon: Bell },
      { name: 'Infra / DR', path: '/infra', icon: Server },
      { name: 'Power Law', path: '/powerlaw', icon: TrendingUp },
      { name: 'Config', path: '/config', icon: Settings },
      { name: 'Venues', path: '/venues', icon: Server },
      { name: 'API Keys', path: '/credentials', icon: Key },
      { name: 'Settings', path: '/settings', icon: Settings },
    ],
  },
];

/** Flat list of all nav items (convenience helper) */
export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Flat list of all nav items with their group (for CommandPalette) */
export const ALL_NAV_ITEMS_WITH_GROUP = NAV_GROUPS.flatMap((g) =>
  g.items.map((item) => ({ ...item, group: g.group })),
);
