/**
 * Decision Trace — Shared Constants
 *
 * Single source of truth for reason-code visual mappings used by
 * DecisionTraceBlock, RiskDeltaBlock, and any future consumers.
 */

import {
  Lock,
  RefreshCw,
  Gauge,
  Zap,
  GitBranch,
  Radio,
  Shield,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Category → Icon mapping
// ---------------------------------------------------------------------------

export const categoryIcons: Record<string, typeof Shield> = {
  RBAC: Lock,
  OCC: RefreshCw,
  CAP: Gauge,
  BREAKER: Zap,
  CONFLICT: GitBranch,
  VENUE: Radio,
  POSTURE: Shield,
  RECONCILE: RefreshCw,
};

// ---------------------------------------------------------------------------
// Severity → Color mapping (full variant for chip-style rendering)
// ---------------------------------------------------------------------------

export const severityChipColors: Record<string, { bg: string; text: string; border: string }> = {
  info: {
    bg: 'bg-primary/10',
    text: 'text-primary',
    border: 'border-primary/20',
  },
  warning: {
    bg: 'bg-status-degraded/10',
    text: 'text-status-degraded',
    border: 'border-status-degraded/20',
  },
  block: {
    bg: 'bg-status-critical/10',
    text: 'text-status-critical',
    border: 'border-status-critical/20',
  },
};

// ---------------------------------------------------------------------------
// Severity → text color only (for inline rendering)
// ---------------------------------------------------------------------------

export const severityTextColors: Record<string, string> = {
  info: 'text-primary',
  warning: 'text-status-degraded',
  block: 'text-status-critical',
};
