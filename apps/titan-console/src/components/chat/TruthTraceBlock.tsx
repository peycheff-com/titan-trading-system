/**
 * TruthTraceBlock
 *
 * Renders verification evidence for intent receipts:
 * - VERIFIED: list of VerificationEvidence items (source, timestamp, hash, summary)
 * - UNVERIFIED: explanation + deterministic recommended actions
 * - FAILED: error + recommended actions
 *
 * Single source of truth for "what proved this intent was executed correctly?"
 */

import { cn } from '@/lib/utils';
import type { IntentReceipt, VerificationEvidence } from '@/hooks/useOperatorIntents';
import { ActionButton } from './ActionButton';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Database,
  Hash,
  Shield,
  SkipForward,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EvidenceItem({ evidence }: { evidence: VerificationEvidence }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/20 last:border-0">
      <Database className="h-3 w-3 text-status-healthy flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xxs font-medium text-foreground">{evidence.source}</span>
          <span className="text-muted-foreground/60 text-xxs">
            {new Date(evidence.timestamp).toLocaleString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
        <p className="text-xxs text-muted-foreground">{evidence.summary}</p>
        <div className="flex items-center gap-1 text-xxs text-muted-foreground/50">
          <Hash className="h-2.5 w-2.5" aria-hidden="true" />
          <span className="font-mono truncate max-w-[180px]">{evidence.hash_or_seq}</span>
        </div>
      </div>
    </div>
  );
}

/** Default recommended actions for UNVERIFIED state */
const UNVERIFIED_ACTIONS = [
  { label: 'Run reconciliation', command: 'reconcile', danger: 'safe' as const },
  { label: 'Check system status', command: 'status', danger: 'safe' as const },
  { label: 'Disarm system', command: 'disarm', danger: 'moderate' as const },
];

/** Default recommended actions for FAILED state */
const FAILED_ACTIONS = [
  { label: 'Check system status', command: 'status', danger: 'safe' as const },
  { label: 'Disarm system', command: 'disarm', danger: 'moderate' as const },
  { label: 'Flatten all positions', command: 'flatten all', danger: 'critical' as const },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TruthTraceBlockProps {
  receipt: IntentReceipt;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TruthTraceBlock({ receipt, className }: TruthTraceBlockProps) {
  const { verification, verification_evidence, effect, error } = receipt;

  const isPassed = verification === 'passed';
  const isFailed = verification === 'failed';
  const isTimeout = verification === 'timeout';
  const isSkipped = verification === 'skipped';
  const isUnverified = !isPassed && !isSkipped;

  // Pick the right recommended actions for the current state
  const actions = isFailed || isTimeout ? FAILED_ACTIONS : isUnverified ? UNVERIFIED_ACTIONS : [];

  return (
    <div
      role="region"
      aria-label="Truth trace"
      className={cn(
        'rounded-md border p-3 text-xs space-y-2.5',
        isPassed
          ? 'border-status-healthy/30 bg-status-healthy/5'
          : isFailed || isTimeout
            ? 'border-status-critical/30 bg-status-critical/5'
            : isSkipped
              ? 'border-border/50 bg-background/50'
              : 'border-status-degraded/30 bg-status-degraded/5',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-muted-foreground uppercase tracking-wider text-xxs">
          Truth Trace
        </span>
        <div className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xxs font-bold uppercase tracking-wider',
          isPassed ? 'bg-status-healthy/10 text-status-healthy'
            : isFailed || isTimeout ? 'bg-status-critical/10 text-status-critical'
              : isSkipped ? 'bg-muted text-muted-foreground'
                : 'bg-status-degraded/10 text-status-degraded',
        )}>
          {isPassed ? <CheckCircle className="h-3 w-3" aria-hidden="true" />
            : isFailed ? <XCircle className="h-3 w-3" aria-hidden="true" />
              : isTimeout ? <Clock className="h-3 w-3" aria-hidden="true" />
                : isSkipped ? <SkipForward className="h-3 w-3" aria-hidden="true" />
                  : <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
          {verification || 'unknown'}
        </div>
      </div>

      {/* Effect summary */}
      {effect && (
        <div className="flex gap-2">
          <span className="text-muted-foreground">Effect:</span>
          <span className="text-foreground font-medium">{effect}</span>
        </div>
      )}

      {/* Error detail */}
      {error && (
        <div className="rounded-md bg-status-critical/10 border border-status-critical/20 p-2">
          <div className="flex items-start gap-1.5">
            <XCircle className="h-3 w-3 text-status-critical flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span className="text-status-critical font-medium">{error}</span>
          </div>
        </div>
      )}

      {/* VERIFIED path: show evidence */}
      {isPassed && verification_evidence && verification_evidence.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-status-healthy" aria-hidden="true" />
            <span className="text-xxs font-semibold uppercase tracking-wider text-status-healthy/70">
              Verification Evidence ({verification_evidence.length})
            </span>
          </div>
          <div className="rounded-md border border-status-healthy/20 bg-background/50 px-2">
            {verification_evidence.map((ev, i) => (
              <EvidenceItem key={i} evidence={ev} />
            ))}
          </div>
        </div>
      )}

      {/* VERIFIED with no evidence — still sealed */}
      {isPassed && (!verification_evidence || verification_evidence.length === 0) && (
        <div className="flex items-center gap-2 text-xxs text-status-healthy/70">
          <CheckCircle className="h-3 w-3" aria-hidden="true" />
          <span>Verification passed — no detailed evidence available from backend</span>
        </div>
      )}

      {/* UNVERIFIED/FAILED path: explanation + recommended actions */}
      {isUnverified && !isSkipped && (
        <div className="space-y-2">
          <div className="flex items-start gap-1.5 text-xxs">
            <AlertTriangle className={cn(
              'h-3 w-3 flex-shrink-0 mt-0.5',
              isFailed || isTimeout ? 'text-status-critical' : 'text-status-degraded',
            )} aria-hidden="true" />
            <span className={cn(
              'font-medium',
              isFailed || isTimeout ? 'text-status-critical' : 'text-status-degraded',
            )}>
              {isFailed ? 'Verification failed — intent execution could not be confirmed.'
                : isTimeout ? 'Verification timed out — truth source did not respond.'
                  : 'Intent not yet verified — awaiting confirmation from truth sources.'}
            </span>
          </div>

          {/* Deterministic recommended actions */}
          {actions.length > 0 && (
            <div className="space-y-1">
              <span className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground/70 block">
                Recommended Actions
              </span>
              {actions.map((action, i) => (
                <ActionButton key={i} action={action} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
