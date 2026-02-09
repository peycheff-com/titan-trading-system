/**
 * RiskDeltaBlock
 *
 * Displays the risk impact preview before intent approval:
 * - Posture change (e.g., "disarmed → armed")
 * - Affected phases and symbols (blast radius)
 * - Throttle adjustments
 * - Cap violations (v2)
 * - Machine-readable reason codes (Decision Trace v1)
 */

import { cn } from '@/lib/utils';
import type { IntentPreviewResult, ReasonCode } from '@/hooks/useOperatorIntents';
import { categoryIcons, severityTextColors as severityColors } from '@/lib/decision-trace-constants';
import {
  ArrowRight,
  AlertTriangle,
  Target,
  Layers,
  TrendingDown,
  ShieldAlert,
  Shield,
} from 'lucide-react';

function ReasonChipInline({ reason }: { reason: ReasonCode }) {
  const Icon = categoryIcons[reason.code] || Shield;
  const color = severityColors[reason.severity] || 'text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xxs font-mono', color)} title={reason.key}>
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
      {reason.message}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RiskDeltaBlockProps {
  preview: IntentPreviewResult;
  stale?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RiskDeltaBlock({ preview, stale, className }: RiskDeltaBlockProps) {
  const { risk_delta, blast_radius, requires_approval, allowed, reason, reasons } = preview;

  return (
    <div
      role="region"
      aria-label="Risk preview"
      className={cn(
        'rounded-md border p-3 text-xs space-y-2.5',
        stale
          ? 'border-status-degraded/40 bg-status-degraded/5'
          : allowed
            ? 'border-border/50 bg-background/50'
            : 'border-status-critical/30 bg-status-critical/5',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-muted-foreground uppercase tracking-wider text-xxs">
          Risk Preview
        </span>
        {stale && (
          <span className="flex items-center gap-1 text-status-degraded text-xxs font-medium">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            State changed — re-confirm
          </span>
        )}
        {!allowed && !stale && (
          <span className="flex items-center gap-1 text-status-critical text-xxs font-medium">
            <ShieldAlert className="h-3 w-3" aria-hidden="true" />
            Blocked
          </span>
        )}
      </div>

      {/* Reason(s) — structured if available, else legacy string */}
      {!allowed && (
        reasons && reasons.length > 0 ? (
          <div className="space-y-1">
            {reasons.filter((r) => r.severity === 'block').map((r, i) => (
              <ReasonChipInline key={i} reason={r} />
            ))}
          </div>
        ) : (
          <p className="text-status-critical font-medium">{reason}</p>
        )
      )}

      {/* Posture change */}
      {risk_delta.posture_change && (
        <div className="flex items-center gap-2">
          <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
          <span className="text-foreground font-medium">{risk_delta.posture_change}</span>
        </div>
      )}

      {/* Affected phases */}
      {blast_radius.phases.length > 0 && (
        <div className="flex items-center gap-2">
          <Layers className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground">Phases:</span>
          <span className="text-foreground font-mono">
            {blast_radius.phases.join(', ')}
          </span>
        </div>
      )}

      {/* Affected symbols */}
      {risk_delta.affected_symbols.length > 0 && (
        <div className="flex items-center gap-2">
          <Target className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground">Symbols:</span>
          <span className="text-foreground font-mono">
            {risk_delta.affected_symbols.join(', ')}
          </span>
        </div>
      )}

      {/* Throttle delta */}
      {risk_delta.throttle_delta !== null && (
        <div className="flex items-center gap-2">
          <TrendingDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground">Throttle:</span>
          <span className={cn(
            'font-mono font-medium',
            risk_delta.throttle_delta < 0 ? 'text-status-critical' : 'text-status-healthy',
          )}>
            {risk_delta.throttle_delta > 0 ? '+' : ''}{risk_delta.throttle_delta}%
          </span>
        </div>
      )}

      {/* Cap violations (v2) */}
      {risk_delta.cap_violations.length > 0 && (
        <div className="rounded-md bg-status-critical/10 p-2">
          <p className="text-status-critical font-medium">Cap violations:</p>
          <ul className="mt-1 space-y-0.5 text-status-critical">
            {risk_delta.cap_violations.map((v, i) => (
              <li key={i}>• {v}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Approval required badge */}
      {requires_approval && allowed && (
        <div className="flex items-center gap-1.5 text-status-degraded">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          <span className="font-medium">Requires approval before execution</span>
        </div>
      )}
    </div>
  );
}
