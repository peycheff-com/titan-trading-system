/**
 * ActionCard
 *
 * Interactive confirmation card for compiled OperatorIntents.
 * Shows intent description, risk preview (from backend), editable params,
 * and approve/reject buttons.
 *
 * Fetches preview from backend before allowing approval.
 * State hash invalidation warns operator if state drifted since preview.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { CompiledIntent, DangerLevel } from '@/lib/intentCompiler';
import type { IntentPreviewResult } from '@/hooks/useOperatorIntents';
import { useOperatorIntents } from '@/hooks/useOperatorIntents';
import { useScreenSize } from '@/hooks/use-media-query';
import { DecisionTraceBlock } from './DecisionTraceBlock';
import {
  Shield,
  ShieldAlert,
  AlertTriangle,
  Check,
  X,
  Loader2,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ActionCardProps {
  intent: CompiledIntent;
  onApprove: (intent: CompiledIntent) => Promise<void>;
  onReject: (intent: CompiledIntent) => void;
  disabled?: boolean;
  /** Current state hash from operator state — used for OCC */
  stateHash?: string;
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

export function ActionCard({ intent, onApprove, onReject, disabled, stateHash }: ActionCardProps) {
  const { isMobile } = useScreenSize();
  const [mobileConfirming, setMobileConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [decided, setDecided] = useState<'approved' | 'rejected' | null>(null);
  const [preview, setPreview] = useState<IntentPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  // Abort controller for in-flight preview requests
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const { previewIntent } = useOperatorIntents();

  const style = dangerStyles[intent.dangerLevel];
  const Icon = style.icon;

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Reset mobile confirming if user waits too long
  useEffect(() => {
    if (mobileConfirming) {
      const timer = setTimeout(() => setMobileConfirming(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [mobileConfirming]);

  // Fetch preview on mount or when stateHash changes
  const fetchPreview = useCallback(async () => {
    if (!stateHash) return; // No state hash = skip preview

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPreviewLoading(true);
    setPreviewError(null);
    setStale(false);

    try {
      const result = await previewIntent({
        type: intent.type,
        params: intent.params,
        operator_id: 'console-operator',
        state_hash: stateHash,
      });

      // Guard: don't update state if unmounted or aborted
      if (!mountedRef.current || controller.signal.aborted) return;

      if (result) {
        setPreview(result);
        if (!result.state_hash_valid) {
          setStale(true);
        }
      } else {
        setPreviewError('Preview unavailable — proceed with caution');
      }
    } catch (e) {
      if (!mountedRef.current || controller.signal.aborted) return;
      setPreviewError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setPreviewLoading(false);
      }
    }
  }, [stateHash, intent.type, intent.params, previewIntent]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  // Detect stale state when stateHash prop changes after initial preview
  useEffect(() => {
    if (preview && stateHash && preview.current_state_hash !== stateHash) {
      setStale(true);
    }
  }, [stateHash, preview]);

  const handleApprove = async () => {
    if (stale) {
      // Re-fetch preview first
      await fetchPreview();
      return; // User must click approve again after fresh preview
    }

    // Mobile double-tap safety
    if (isMobile && !mobileConfirming) {
      setMobileConfirming(true);
      return;
    }
    setMobileConfirming(false);

    setSubmitting(true);
    try {
      await onApprove(intent);
      if (mountedRef.current) setDecided('approved');
    } catch (e) {
      // Surface approval errors instead of swallowing them
      if (mountedRef.current) {
        setPreviewError(e instanceof Error ? e.message : 'Approval failed');
      }
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleReject = () => {
    onReject(intent);
    setDecided('rejected');
  };

  const isInteractive = !decided && !disabled;
  const previewBlocked = preview && !preview.allowed;

  return (
    <div
      role="region"
      aria-label={`Intent confirmation: ${intent.type}`}
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
        <Icon className={cn('mt-0.5 h-5 w-5 flex-shrink-0', style.iconColor)} aria-hidden="true" />
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

      {/* Risk Preview Block (from backend) */}
      {previewLoading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Loading risk preview…
        </div>
      )}
      {previewError && !previewLoading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-status-degraded">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          <span>{previewError}</span>
          <button
            onClick={fetchPreview}
            className="ml-1 underline hover:no-underline text-xxs focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            aria-label="Retry loading risk preview"
          >
            Retry
          </button>
        </div>
      )}
      {preview && !previewLoading && !previewError && (
        <DecisionTraceBlock preview={preview} stale={stale} className="mt-3" />
      )}

      {/* Decision state or action buttons */}
      {decided ? (
        <div className="mt-3 flex items-center gap-2 text-xs" role="status">
          {decided === 'approved' ? (
            <>
              <Check className="h-3.5 w-3.5 text-status-healthy" aria-hidden="true" />
              <span className="text-status-healthy font-medium">Approved — executing</span>
            </>
          ) : (
            <>
              <X className="h-3.5 w-3.5 text-status-critical" aria-hidden="true" />
              <span className="text-muted-foreground font-medium">Rejected</span>
            </>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2" role="group" aria-label="Intent actions">
          <button
            onClick={handleApprove}
            disabled={!isInteractive || submitting || !!previewBlocked}
            aria-label={stale ? `Re-confirm ${intent.type}` : mobileConfirming ? 'Click again to confirm' : `Confirm ${intent.type}`}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              stale
                ? 'bg-status-degraded/15 text-status-degraded hover:bg-status-degraded/25'
                : mobileConfirming
                  ? 'bg-status-critical text-status-critical-foreground animate-pulse'
                  : 'bg-status-healthy/15 text-status-healthy hover:bg-status-healthy/25',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : stale ? (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            ) : mobileConfirming ? (
               <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {stale ? 'Re-confirm' : mobileConfirming ? 'Click again' : 'Confirm'}
          </button>
          <button
            onClick={handleReject}
            disabled={!isInteractive || submitting}
            aria-label={`Cancel ${intent.type}`}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Cancel
          </button>
        </div>
      )}
      
      {/* Undo/Revert Hint (SOTA: Safety) */}
      {!decided && isInteractive && (
         <div className="mt-2 text-xxs text-muted-foreground/50 text-center">
            You can always undo this action from the <strong>History</strong> panel.
         </div>
      )}
    </div>
  );
}
