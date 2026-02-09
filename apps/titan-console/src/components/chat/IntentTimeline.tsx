/**
 * IntentTimeline
 *
 * Renders the lifecycle of an OperatorIntent as a vertical timeline,
 * showing each status transition with timestamp and icon.
 *
 * PR6: Accepts optional intentId to fetch receipt from backend.
 * UNVERIFIED is shown as a first-class terminal status with distinct styling.
 */

import { useEffect, useState, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { IntentStatus, IntentReceipt } from '@/hooks/useOperatorIntents';
import { useOperatorIntents } from '@/hooks/useOperatorIntents';
import { TruthTraceBlock } from './TruthTraceBlock';
import {
  Send,
  CheckCircle,
  Clock,
  Play,
  ShieldCheck,
  ShieldAlert,
  XCircle,
  Ban,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

interface StatusMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

const STATUS_META: Record<IntentStatus, StatusMeta> = {
  SUBMITTED: {
    label: 'Submitted',
    icon: Send,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
  ACCEPTED: {
    label: 'Accepted',
    icon: CheckCircle,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  PENDING_APPROVAL: {
    label: 'Pending Approval',
    icon: Clock,
    color: 'text-status-degraded',
    bgColor: 'bg-status-degraded/10',
  },
  EXECUTING: {
    label: 'Executing',
    icon: Play,
    color: 'text-status-degraded',
    bgColor: 'bg-status-degraded/10',
  },
  VERIFIED: {
    label: 'Verified',
    icon: ShieldCheck,
    color: 'text-status-healthy',
    bgColor: 'bg-status-healthy/10',
  },
  UNVERIFIED: {
    label: 'Unverified',
    icon: ShieldAlert,
    color: 'text-status-critical',
    bgColor: 'bg-status-critical/10',
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-status-critical',
    bgColor: 'bg-status-critical/10',
  },
  REJECTED: {
    label: 'Rejected',
    icon: Ban,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
};

// Ordered lifecycle stages for rendering timeline
const LIFECYCLE_ORDER: IntentStatus[] = [
  'SUBMITTED',
  'ACCEPTED',
  'PENDING_APPROVAL',
  'EXECUTING',
  'VERIFIED',
];



// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface IntentTimelineProps {
  currentStatus: IntentStatus;
  /** Backend intent ID — if provided, fetches receipt on terminal status */
  intentId?: string;
  timestamps?: Partial<Record<IntentStatus, string>>;
  className?: string;
}

export function IntentTimeline({ currentStatus, intentId, timestamps, className }: IntentTimelineProps) {
  const [receipt, setReceipt] = useState<IntentReceipt | null>(null);
  const { getIntent } = useOperatorIntents();
  const fetchedReceiptFor = useRef<string | null>(null);

  const isTerminal = useMemo(
    () => ['VERIFIED', 'UNVERIFIED', 'FAILED', 'REJECTED'].includes(currentStatus),
    [currentStatus],
  );

  // Fetch receipt when reaching terminal status (once per intentId)
  useEffect(() => {
    if (isTerminal && intentId && fetchedReceiptFor.current !== intentId) {
      fetchedReceiptFor.current = intentId;
      getIntent(intentId).then((record) => {
        if (record?.receipt) {
          setReceipt(record.receipt as IntentReceipt);
        }
      });
    }
  }, [isTerminal, intentId, getIntent]);

  // Build the timeline steps
  const steps = LIFECYCLE_ORDER.map((status) => {
    const meta = STATUS_META[status];
    const currentIdx = LIFECYCLE_ORDER.indexOf(currentStatus);
    const stepIdx = LIFECYCLE_ORDER.indexOf(status);
    const isActive = status === currentStatus;
    const isCompleted = stepIdx < currentIdx || (isTerminal && stepIdx <= currentIdx);
    const isFuture = stepIdx > currentIdx && !isTerminal;

    return { status, meta, isActive, isCompleted, isFuture };
  });

  // If terminal status is not VERIFIED, add the terminal status as the last step
  if (isTerminal && currentStatus !== 'VERIFIED') {
    const meta = STATUS_META[currentStatus];
    steps.push({
      status: currentStatus,
      meta,
      isActive: true,
      isCompleted: false,
      isFuture: false,
    });
  }

  return (
    <div className={cn('space-y-0', className)} role="list" aria-label="Intent lifecycle">
      {steps.map((step, i) => {
        const Icon = step.meta.icon;
        const ts = timestamps?.[step.status];
        const isLast = i === steps.length - 1;

        return (
          <div key={`${step.status}-${i}`} className="flex items-start gap-3">
            {/* Vertical line + icon */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full',
                  step.isActive
                    ? step.meta.bgColor
                    : step.isCompleted
                      ? 'bg-status-healthy/10'
                      : 'bg-muted/50',
                )}
              >
                <Icon
                  className={cn(
                    'h-3.5 w-3.5',
                    step.isActive
                      ? step.meta.color
                      : step.isCompleted
                        ? 'text-status-healthy'
                        : 'text-muted-foreground/40',
                  )}
                />
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'h-4 w-px',
                    step.isCompleted ? 'bg-status-healthy/30' : 'bg-border',
                  )}
                />
              )}
            </div>

            {/* Label + timestamp */}
            <div className="pb-4 last:pb-0">
              <span
                className={cn(
                  'text-xs font-medium',
                  step.isActive
                    ? step.meta.color
                    : step.isCompleted
                      ? 'text-foreground'
                      : 'text-muted-foreground/50',
                )}
              >
                {step.meta.label}
              </span>
              {ts && (
                <span className="ml-2 text-xxs text-muted-foreground/60 font-mono">
                  {new Date(ts).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Receipt — rendered via TruthTraceBlock for proper evidence + actions */}
      {receipt && <TruthTraceBlock receipt={receipt} className="mt-2" />}
    </div>
  );
}
