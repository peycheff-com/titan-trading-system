/**
 * DecisionTraceBlock
 *
 * Renders structured decision explainability for an intent preview:
 * - Verdict badge (ALLOWED / BLOCKED)
 * - Machine-readable reason codes as chips
 * - Constraints hit (cap violations, OCC, breaker)
 * - Risk delta (delegates to RiskDeltaBlock)
 * - Blast radius summary
 * - Backend-recommended next actions
 *
 * Single source of truth for "why was this intent allowed/blocked?"
 */

import { cn } from '@/lib/utils';
import type { IntentPreviewResult, ReasonCode } from '@/hooks/useOperatorIntents';
import { RiskDeltaBlock } from './RiskDeltaBlock';
import { ActionButton } from './ActionButton';
import { categoryIcons, severityChipColors as severityColors } from '@/lib/decision-trace-constants';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  AlertTriangle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ReasonChip({ reason }: { reason: ReasonCode }) {
  const Icon = categoryIcons[reason.code] || Shield;
  const colors = severityColors[reason.severity] || severityColors.info;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xxs',
        colors.bg,
        colors.border,
      )}
      title={`${reason.key}: ${reason.message}`}
    >
      <Icon className={cn('h-3 w-3 flex-shrink-0', colors.text)} aria-hidden="true" />
      <span className={cn('font-mono font-medium', colors.text)}>{reason.key}</span>
      <span className="text-muted-foreground truncate max-w-[160px]">{reason.message}</span>
    </div>
  );
}

function VerdictBadge({ allowed }: { allowed: boolean }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xxs font-bold uppercase tracking-wider',
        allowed
          ? 'bg-status-healthy/10 text-status-healthy'
          : 'bg-status-critical/10 text-status-critical',
      )}
    >
      {allowed ? (
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      ) : (
        <ShieldAlert className="h-3 w-3" aria-hidden="true" />
      )}
      {allowed ? 'Allowed' : 'Blocked'}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DecisionTraceBlockProps {
  preview: IntentPreviewResult;
  stale?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DecisionTraceBlock({ preview, stale, className }: DecisionTraceBlockProps) {
  const { allowed, reason, reasons, risk_delta, blast_radius, recommended_actions } = preview;

  // Use structured reasons if available, else synthesize from reason string
  const effectiveReasons: ReasonCode[] = reasons && reasons.length > 0
    ? reasons
    : reason
      ? [{ code: 'POSTURE' as const, key: 'LEGACY_REASON', message: reason, severity: allowed ? 'info' as const : 'block' as const }]
      : [];

  const blockingReasons = effectiveReasons.filter((r) => r.severity === 'block');
  const warningReasons = effectiveReasons.filter((r) => r.severity === 'warning');
  const infoReasons = effectiveReasons.filter((r) => r.severity === 'info');

  return (
    <div
      role="region"
      aria-label="Decision trace"
      className={cn(
        'rounded-md border p-3 text-xs space-y-3',
        stale
          ? 'border-status-degraded/40 bg-status-degraded/5'
          : allowed
            ? 'border-border/50 bg-background/50'
            : 'border-status-critical/30 bg-status-critical/5',
        className,
      )}
    >
      {/* Header: verdict + stale warning */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground uppercase tracking-wider text-xxs">
            Decision Trace
          </span>
          <VerdictBadge allowed={allowed} />
        </div>
        {stale && (
          <span className="flex items-center gap-1 text-status-degraded text-xxs font-medium">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Stale
          </span>
        )}
      </div>

      {/* Blocking reasons */}
      {blockingReasons.length > 0 && (
        <div className="space-y-1">
          <span className="text-xxs font-semibold uppercase tracking-wider text-status-critical/70">
            Blocked By
          </span>
          <div className="flex flex-wrap gap-1">
            {blockingReasons.map((r, i) => (
              <ReasonChip key={`block-${i}`} reason={r} />
            ))}
          </div>
        </div>
      )}

      {/* Warning reasons */}
      {warningReasons.length > 0 && (
        <div className="space-y-1">
          <span className="text-xxs font-semibold uppercase tracking-wider text-status-degraded/70">
            Warnings
          </span>
          <div className="flex flex-wrap gap-1">
            {warningReasons.map((r, i) => (
              <ReasonChip key={`warn-${i}`} reason={r} />
            ))}
          </div>
        </div>
      )}

      {/* Info reasons */}
      {infoReasons.length > 0 && (
        <div className="space-y-1">
          <span className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground/70">
            Context
          </span>
          <div className="flex flex-wrap gap-1">
            {infoReasons.map((r, i) => (
              <ReasonChip key={`info-${i}`} reason={r} />
            ))}
          </div>
        </div>
      )}

      {/* Risk delta — delegate to existing component (no duplication) */}
      <RiskDeltaBlock preview={preview} stale={stale} />

      {/* Blast radius summary (compact inline) */}
      {(blast_radius.phases.length > 0 || blast_radius.venues.length > 0 || blast_radius.symbols.length > 0) && (
        <div className="rounded-md border border-border/30 bg-background/30 p-2 space-y-0.5">
          <span className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground/70 block">
            Blast Radius
          </span>
          {blast_radius.phases.length > 0 && (
            <div className="flex gap-1 text-xxs">
              <span className="text-muted-foreground">Phases:</span>
              <span className="font-mono text-foreground">{blast_radius.phases.join(', ')}</span>
            </div>
          )}
          {blast_radius.venues.length > 0 && (
            <div className="flex gap-1 text-xxs">
              <span className="text-muted-foreground">Venues:</span>
              <span className="font-mono text-foreground">{blast_radius.venues.join(', ')}</span>
            </div>
          )}
          {blast_radius.symbols.length > 0 && (
            <div className="flex gap-1 text-xxs">
              <span className="text-muted-foreground">Symbols:</span>
              <span className="font-mono text-foreground">{blast_radius.symbols.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {/* Cap violations */}
      {risk_delta.cap_violations.length > 0 && (
        <div className="rounded-md bg-status-critical/10 border border-status-critical/20 p-2">
          <span className="text-xxs font-semibold uppercase tracking-wider text-status-critical block mb-1">
            Cap Violations
          </span>
          <ul className="space-y-0.5 text-xxs text-status-critical">
            {risk_delta.cap_violations.map((v, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="text-status-critical/60">•</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended actions (from backend) */}
      {recommended_actions && recommended_actions.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground/70 block">
            Recommended Actions
          </span>
          {recommended_actions.map((action, i) => (
            <ActionButton key={i} action={action} />
          ))}
        </div>
      )}
    </div>
  );
}
