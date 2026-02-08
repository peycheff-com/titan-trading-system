/**
 * ActionCard
 *
 * Interactive confirmation card for compiled OperatorIntents.
 * Shows intent description, risk delta, editable params, and approve/reject buttons.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { CompiledIntent, DangerLevel } from '@/lib/intentCompiler';
import {
  Shield,
  ShieldAlert,
  AlertTriangle,
  Check,
  X,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ActionCardProps {
  intent: CompiledIntent;
  onApprove: (intent: CompiledIntent) => Promise<void>;
  onReject: (intent: CompiledIntent) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Danger styling
// ---------------------------------------------------------------------------

const dangerStyles: Record<DangerLevel, { border: string; bg: string; icon: typeof Shield; iconColor: string }> = {
  safe: {
    border: 'border-status-healthy/30',
    bg: 'bg-status-healthy/5',
    icon: Shield,
    iconColor: 'text-status-healthy',
  },
  moderate: {
    border: 'border-status-degraded/30',
    bg: 'bg-status-degraded/5',
    icon: AlertTriangle,
    iconColor: 'text-status-degraded',
  },
  critical: {
    border: 'border-status-critical/30',
    bg: 'bg-status-critical/5',
    icon: ShieldAlert,
    iconColor: 'text-status-critical',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActionCard({ intent, onApprove, onReject, disabled }: ActionCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [decided, setDecided] = useState<'approved' | 'rejected' | null>(null);

  const style = dangerStyles[intent.dangerLevel];
  const Icon = style.icon;

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await onApprove(intent);
      setDecided('approved');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = () => {
    onReject(intent);
    setDecided('rejected');
  };

  const isInteractive = !decided && !disabled;

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        style.border,
        style.bg,
        decided === 'approved' && 'opacity-60',
        decided === 'rejected' && 'opacity-40',
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 h-5 w-5 flex-shrink-0', style.iconColor)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{intent.type}</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xxs font-medium uppercase',
                intent.dangerLevel === 'critical'
                  ? 'bg-status-critical/15 text-status-critical'
                  : intent.dangerLevel === 'moderate'
                    ? 'bg-status-degraded/15 text-status-degraded'
                    : 'bg-status-healthy/15 text-status-healthy',
              )}
            >
              {intent.dangerLevel}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{intent.description}</p>
        </div>
      </div>

      {/* Parameters */}
      {Object.keys(intent.params).length > 0 && (
        <div className="mt-3 rounded-md border border-border/50 bg-background/50 p-2.5">
          <h5 className="mb-1.5 text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
            Parameters
          </h5>
          <div className="space-y-1">
            {Object.entries(intent.params).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{key}</span>
                <span className="font-mono text-foreground">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision state or action buttons */}
      {decided ? (
        <div className="mt-3 flex items-center gap-2 text-xs">
          {decided === 'approved' ? (
            <>
              <Check className="h-3.5 w-3.5 text-status-healthy" />
              <span className="text-status-healthy font-medium">Approved — executing</span>
            </>
          ) : (
            <>
              <X className="h-3.5 w-3.5 text-status-critical" />
              <span className="text-muted-foreground font-medium">Rejected</span>
            </>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={handleApprove}
            disabled={!isInteractive || submitting}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              'bg-status-healthy/15 text-status-healthy hover:bg-status-healthy/25',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Confirm
          </button>
          <button
            onClick={handleReject}
            disabled={!isInteractive || submitting}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
