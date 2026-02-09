/**
 * ActionButton
 *
 * Reusable danger-styled action button that injects a command into the
 * operator chat input on click. Used by DecisionTraceBlock, TruthTraceBlock,
 * and anywhere recommended/runbook actions are displayed.
 *
 * Single source of truth for the "recommended action" button pattern.
 */

// ... imports
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { injectCommand } from '@/lib/injectCommand';
import { ChevronRight, Lock, Unlock } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionButtonAction {
  label: string;
  command: string;
  danger: 'safe' | 'moderate' | 'critical';
  /** Optional description shown below the label */
  description?: string;
}

interface ActionButtonProps {
  action: ActionButtonAction;
  /** Use compact (text-xxs) or normal (text-xs) sizing */
  compact?: boolean;
  className?: string;
  /** Require a second click to confirm execution (for mobile/safety) */
  requireConfirmation?: boolean;
}

// ---------------------------------------------------------------------------
// Danger styling
// ---------------------------------------------------------------------------

const dangerStyles = {
  critical: {
    border: 'border-status-critical/30',
    bg: 'bg-status-critical/5',
    hover: 'hover:bg-status-critical/10',
    text: 'text-status-critical',
  },
  moderate: {
    border: 'border-status-degraded/30',
    bg: 'bg-status-degraded/5',
    hover: 'hover:bg-status-degraded/10',
    text: 'text-status-degraded',
  },
  safe: {
    border: 'border-border/50',
    bg: 'bg-background/50',
    hover: 'hover:bg-muted',
    text: 'text-foreground',
  },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActionButton({ action, compact = true, className, requireConfirmation = false }: ActionButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const style = dangerStyles[action.danger];

  useEffect(() => {
    if (confirming) {
      const timer = setTimeout(() => setConfirming(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [confirming]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (requireConfirmation && !confirming) {
      setConfirming(true);
      return;
    }
    injectCommand(action.command);
    setConfirming(false);
  };

  return (
    <button
      className={cn(
        'w-full flex items-center gap-2 rounded-md border p-2 text-left transition-all duration-200',
        compact ? 'text-xxs' : 'text-xs',
        // When confirming, always use critical style or active style
        confirming
            ? 'border-status-critical bg-status-critical/10 text-status-critical ring-1 ring-status-critical/50'
            : cn(style.border, style.bg, style.hover, style.text),
        className,
      )}
      onClick={handleClick}
      aria-label={confirming ? 'Confirm execution' : `Execute: ${action.label}`}
    >
      <div className="flex-1 min-w-0">
        <span className={cn('font-medium', confirming && 'font-bold')}>
          {confirming ? 'Click again to confirm' : action.label}
        </span>
        {action.description && !confirming && (
          <p className="mt-0.5 text-xxs text-muted-foreground">{action.description}</p>
        )}
      </div>
      {requireConfirmation ? (
        confirming ? (
           <Unlock className="h-3 w-3 flex-shrink-0 animate-pulse" aria-hidden="true" />
        ) : (
           <Lock className="h-3 w-3 flex-shrink-0 opacity-70" aria-hidden="true" />
        )
      ) : (
        <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
      )}
    </button>
  );
}
