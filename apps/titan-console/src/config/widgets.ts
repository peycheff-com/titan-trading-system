/**
 * Widget Registry
 *
 * Maps widget IDs to lazy-loaded page components.
 * Every existing page becomes a widget by reference — no new implementations.
 *
 * Consumed by: WorkspaceLayout (center tabs, bottom panels)
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  MessageSquare,
  LayoutDashboard,
  Radio,
  Terminal,
  TrendingUp,
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
  Settings,
  Key,
  UserCheck,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WidgetDef {
  /** Widget display name */
  name: string;
  /** Lucide icon */
  icon: LucideIcon;
  /** Lazy-loaded React component */
  component: LazyExoticComponent<ComponentType<unknown>>;
}

// ---------------------------------------------------------------------------
// Widget Definitions
// ---------------------------------------------------------------------------

export const WIDGETS: Record<string, WidgetDef> = {
  chatops: {
    name: 'Chat Ops',
    icon: MessageSquare,
    component: lazy(() => import('@/pages/ChatOps')),
  },
  overview: {
    name: 'Overview',
    icon: LayoutDashboard,
    component: lazy(() => import('@/pages/Overview')),
  },
  live: {
    name: 'Live Ops',
    icon: Radio,
    component: lazy(() => import('@/pages/LiveOps')),
  },
  trade: {
    name: 'Trade Control',
    icon: Terminal,
    component: lazy(() => import('@/pages/ops/TradeControl')),
  },
  risk: {
    name: 'Risk',
    icon: TrendingUp,
    component: lazy(() => import('@/pages/ops/Risk')),
  },
  scavenger: {
    name: 'Scavenger',
    icon: Bug,
    component: lazy(() => import('@/pages/phases/Scavenger')),
  },
  hunter: {
    name: 'Hunter',
    icon: Target,
    component: lazy(() => import('@/pages/phases/Hunter')),
  },
  sentinel: {
    name: 'Sentinel',
    icon: Shield,
    component: lazy(() => import('@/pages/phases/Sentinel')),
  },
  brain: {
    name: 'Brain',
    icon: Brain,
    component: lazy(() => import('@/pages/organs/Brain')),
  },
  'ai-quant': {
    name: 'AI Quant',
    icon: Cpu,
    component: lazy(() => import('@/pages/organs/AIQuant')),
  },
  execution: {
    name: 'Execution',
    icon: Zap,
    component: lazy(() => import('@/pages/organs/Execution')),
  },
  'decision-log': {
    name: 'Decision Log',
    icon: BrainCircuit,
    component: lazy(() => import('@/pages/organs/DecisionLog')),
  },
  journal: {
    name: 'Journal',
    icon: BookOpen,
    component: lazy(() => import('@/pages/ops/Journal')),
  },
  history: {
    name: 'Trade History',
    icon: History,
    component: lazy(() => import('@/pages/ops/TradeHistory')),
  },
  alerts: {
    name: 'Alerts',
    icon: Bell,
    component: lazy(() => import('@/pages/ops/Alerts')),
  },
  infra: {
    name: 'Infra / DR',
    icon: Server,
    component: lazy(() => import('@/pages/ops/Infra')),
  },
  powerlaw: {
    name: 'Power Law',
    icon: TrendingUp,
    component: lazy(() => import('@/pages/ops/PowerLaw')),
  },
  config: {
    name: 'Config',
    icon: Settings,
    component: lazy(() => import('@/pages/ops/ConfigCenter')),
  },
  venues: {
    name: 'Venues',
    icon: Server,
    component: lazy(() => import('@/pages/ops/Venues')),
  },
  credentials: {
    name: 'API Keys',
    icon: Key,
    component: lazy(() => import('@/pages/Credentials')),
  },
  settings: {
    name: 'Settings',
    icon: Settings,
    component: lazy(() => import('@/pages/Settings')),
  },
  identity: {
    name: 'Identity',
    icon: UserCheck,
    component: lazy(() => import('@/pages/Identity')),
  },
};
