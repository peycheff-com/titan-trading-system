/**
 * InspectorPanel — Mission Control
 *
 * Entity-agnostic right-side panel showing:
 *  - Live status with risk posture badge
 *  - Current risk caps
 *  - Last 20 related events (intents, errors, breaker trips)
 *  - Receipts and verification state
 *  - Context runbook (next 3 safest actions)
 *  - Red status → suggested safe action + proof trail
 *
 * Resizable via drag handle, ESC to close.
 */

import { useModuleRegistry } from '@/context/ModuleRegistryContext';
import { useInspector } from '@/context/InspectorContext';

// ...


import { cn } from '@/lib/utils';
import {
  X,
  GripVertical,
  Minus,
  FileText,
  AlertTriangle,
  Package,
  Activity,
  Brain,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Clock,
  BookOpen,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { useOperatorIntents } from '@/hooks/useOperatorIntents';
import type { OperatorIntentRecord, IntentStatus, OperatorState, IntentPreviewResult, IntentReceipt } from '@/hooks/useOperatorIntents';
import { DecisionTraceBlock } from '@/components/chat/DecisionTraceBlock';

import { TruthTraceBlock } from '@/components/chat/TruthTraceBlock';
import { ActionButton } from '@/components/chat/ActionButton';
import { MemoryInspector } from '@/components/chat/MemoryInspector';
import { useScreenSize } from '@/hooks/use-media-query';

// ---------------------------------------------------------------------------
// Entity icons
// ---------------------------------------------------------------------------

const entityIcons = {
  position: Package,
  order: FileText,
  intent: FileText,
  incident: AlertTriangle,
  config: FileText,
  phase: Package,
  memory: Brain,
  none: Minus,
} as const;

// ---------------------------------------------------------------------------
// Runbook actions — contextual safe actions per entity status
// ---------------------------------------------------------------------------

interface RunbookAction {
  label: string;
  command: string;
  danger: 'safe' | 'moderate' | 'critical';
  description: string;
}

function getRunbookActions(
  entityType: string,
  status: string | undefined,
  posture: string | undefined,
): RunbookAction[] {
  const isCritical = status === 'FAILED' || status === 'UNVERIFIED' || posture === 'emergency';
  const isDegraded = posture === 'degraded' || status === 'PENDING_APPROVAL';

  if (isCritical) {
    return [
      { label: 'Flatten all positions', command: 'flatten all', danger: 'critical', description: 'Emergency close all open positions' },
      { label: 'Disarm system', command: 'disarm', danger: 'moderate', description: 'Stop all new order placement' },
      { label: 'Check system status', command: 'status', danger: 'safe', description: 'Get current posture and health' },
    ];
  }

  if (isDegraded) {
    return [
      { label: 'Reduce throttle', command: `throttle ${entityType} 25%`, danger: 'moderate', description: 'Reduce activity to 25%' },
      { label: 'Disarm system', command: 'disarm', danger: 'moderate', description: 'Stop all new order placement' },
      { label: 'Check system status', command: 'status', danger: 'safe', description: 'Get current posture and health' },
    ];
  }

  // Normal operations
  return [
    { label: 'Check system status', command: 'status', danger: 'safe', description: 'Get current posture and health' },
    { label: 'View recent events', command: 'events', danger: 'safe', description: 'Show last 20 system events' },
    { label: 'Arm for trading', command: 'arm', danger: 'moderate', description: 'Enable live order placement' },
  ];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status, posture }: { status?: string; posture?: string }) {
  const displayStatus = status || posture || 'unknown';
  const isHealthy = posture === 'armed' || status === 'VERIFIED';
  const isCritical = posture === 'emergency' || status === 'FAILED' || status === 'UNVERIFIED';

  return (
    <div className={cn(
      'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xxs font-medium uppercase',
      isHealthy ? 'bg-status-healthy/10 text-status-healthy'
        : isCritical ? 'bg-status-critical/10 text-status-critical'
          : 'bg-status-degraded/10 text-status-degraded',
    )}>
      {isHealthy ? <ShieldCheck className="h-3 w-3" /> :
        isCritical ? <ShieldAlert className="h-3 w-3" /> :
          <Shield className="h-3 w-3" />}
      {displayStatus}
    </div>
  );
}

function EventItem({ event, onInspect }: { event: OperatorIntentRecord; onInspect?: (event: OperatorIntentRecord) => void }) {
  const statusColors: Record<string, string> = {
    VERIFIED: 'text-status-healthy',
    ACCEPTED: 'text-primary',
    EXECUTING: 'text-status-degraded',
    FAILED: 'text-status-critical',
    UNVERIFIED: 'text-status-critical',
    REJECTED: 'text-muted-foreground',
    SUBMITTED: 'text-muted-foreground',
    PENDING_APPROVAL: 'text-status-degraded',
  };

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 py-1.5 text-xs border-b border-border/30 last:border-0 hover:bg-muted/50 transition-colors cursor-pointer text-left"
      onClick={() => onInspect?.(event)}
      aria-label={`Inspect ${event.type} intent — ${event.status}`}
    >
      <div className={cn(
        'h-1.5 w-1.5 rounded-full flex-shrink-0',
        event.status === 'VERIFIED' || event.status === 'ACCEPTED' ? 'bg-status-healthy'
          : event.status === 'FAILED' || event.status === 'UNVERIFIED' ? 'bg-status-critical'
            : 'bg-status-degraded',
      )} />
      <span className="font-mono text-muted-foreground flex-shrink-0">
        {new Date(event.submitted_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
      </span>
      <span className="font-medium text-foreground truncate">{event.type}</span>
      <span className={cn('ml-auto text-xxs font-medium uppercase flex-shrink-0', statusColors[event.status] || 'text-muted-foreground')}>
        {event.status}
      </span>
    </button>
  );
}

function StateDiffRow({ label, before, after }: { label: string; before: unknown; after: unknown }) {
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  return (
    <div className="flex items-center gap-1.5 text-xxs font-mono">
      <span className="text-muted-foreground w-16 flex-shrink-0 truncate">{label}</span>
      <span className="text-muted-foreground/60">{String(before)}</span>
      {changed && (
        <>
          <ArrowRight className="h-2.5 w-2.5 text-primary flex-shrink-0" aria-hidden="true" />
          <span className="text-primary font-semibold">{String(after)}</span>
        </>
      )}
    </div>
  );
}

function ReceiptSection({ receipt }: { receipt: Record<string, unknown> }) {
  const effect = receipt.effect as string | undefined;
  const error = receipt.error as string | undefined;
  const verification = receipt.verification as string | undefined;
  const priorState = receipt.prior_state as Record<string, unknown> | undefined;
  const newState = receipt.new_state as Record<string, unknown> | undefined;

  return (
    <div className="space-y-2 text-xs">
      {effect && (
        <div className="flex gap-2">
          <span className="text-muted-foreground">Effect:</span>
          <span className="text-foreground font-medium">{effect}</span>
        </div>
      )}
      {error && (
        <div className="flex gap-2">
          <span className="text-muted-foreground">Error:</span>
          <span className="text-status-critical font-medium">{error}</span>
        </div>
      )}
      {verification && (
        <div className="flex gap-2">
          <span className="text-muted-foreground">Verification:</span>
          <span className={cn(
            'font-mono font-medium',
            verification === 'passed' || verification === 'skipped' ? 'text-status-healthy'
              : verification === 'failed' ? 'text-status-critical'
                : 'text-muted-foreground',
          )}>
            {verification}
          </span>
        </div>
      )}

      {/* State diff: prior → new */}
      {priorState && newState && (
        <div className="mt-1.5 rounded-md border border-border/40 bg-background/30 p-2 space-y-0.5">
          <span className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1 block">
            State Change
          </span>
          {Object.keys({ ...priorState, ...newState }).map((key) => (
            <StateDiffRow
              key={key}
              label={key}
              before={priorState[key]}
              after={newState[key]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function InspectorPanel({ mobile = false }: { mobile?: boolean }) {
  const { entity, isOpen, width, setWidth, setOpen, inspect } = useInspector();
  const { getIntents, getOperatorState, previewIntent } = useOperatorIntents();
  const { isMobile: screenIsMobile } = useScreenSize();
  const registry = useModuleRegistry();
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Allow prop override or screen detection
  const isMobileView = mobile || screenIsMobile;

  const [events, setEvents] = useState<OperatorIntentRecord[]>([]);
  const [operatorState, setOperatorState] = useState<OperatorState | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [intentPreview, setIntentPreview] = useState<IntentPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Resize handlers (Desktop only)
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isMobileView) return;
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      e.preventDefault();
    },
    [width, isMobileView],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      setWidth(startWidth.current + delta);
    };

    const onMouseUp = () => {
      isDragging.current = false;
    };

    if (!isMobileView) {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [setWidth, isMobileView]);

  // Pop out handler
  const handlePopOut = () => {
    window.open('/inspector', 'TitanInspector', 'width=450,height=800,menubar=no,toolbar=no,location=no,status=no');
    setOpen(false);
  };

  // Fetch events and state when panel opens or entity changes
  useEffect(() => {
    if (!isOpen && !mobile) return; // Always fetch if mobile (sheet) or open

    setLoadingEvents(true);
    setIntentPreview(null);

    // Fetch recent intents
    getIntents({ limit: 20 }).then((intents) => {
      setEvents(intents);
      setLoadingEvents(false);
    });

    // Fetch operator state
    getOperatorState().then((state) => {
      if (state) setOperatorState(state);
    });

    // Fetch preview for intent entities
    if (entity?.type === 'intent' && entity.data) {
      const intentData = entity.data as Record<string, unknown>;
      const intentType = intentData.type as string;
      const intentParams = (intentData.params as Record<string, unknown>) || {};
      setPreviewLoading(true);
      getOperatorState().then((state) => {
        if (state) {
          previewIntent({
             type: intentType,
             params: intentParams,
             operator_id: 'console-operator',
             state_hash: state.state_hash,
          }).then((result) => {
             setIntentPreview(result);
             setPreviewLoading(false);
          });
        } else {
             setPreviewLoading(false);
        }
      });
    }
  }, [isOpen, entity?.id, getIntents, getOperatorState, entity?.type, entity?.data, previewIntent, mobile]);

  // Determine entity status from data
  const entityStatus = useMemo(() => {
    if (!entity?.data) return undefined;
    return (entity.data.status as string) || (entity.data.state as string) || undefined;
  }, [entity?.data]);

  // Get runbook actions based on current context
  const runbookActions = useMemo(() => {
    return getRunbookActions(
      entity?.type || 'system',
      entityStatus,
      operatorState?.posture,
    );
  }, [entity?.type, entityStatus, operatorState?.posture]);

  // Latest receipt from events
  const latestReceipt = useMemo(() => {
    const withReceipt = events.find((e) => e.receipt);
    return withReceipt?.receipt || null;
  }, [events]);

  if (!isOpen && !mobile) return null;

  const Icon = entity ? entityIcons[entity.type] || FileText : Minus;
  const isCritical = entityStatus === 'FAILED' || entityStatus === 'UNVERIFIED' ||
    operatorState?.posture === 'emergency';

  return (
    <div
      ref={panelRef}
      role="complementary"
      aria-label="Inspector panel"
      className={cn(
        "relative flex h-full flex-col bg-card",
        !isMobileView && "border-l border-border"
      )}
      style={isMobileView ? { width: '100%' } : { width: `${width}px`, minWidth: '280px', maxWidth: '480px' }}
    >
      {/* Drag handle - Desktop Only */}
      {!isMobileView && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
            className="absolute inset-y-0 left-0 z-10 flex w-1.5 cursor-col-resize items-center justify-center hover:bg-primary/20 transition-colors"
            onMouseDown={onMouseDown}
            role="separator"
            aria-label="Resize inspector panel"
            aria-orientation="vertical"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setWidth(width - 10);
            if (e.key === 'ArrowRight') setWidth(width + 10);
            }}
        >
            <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 hover:opacity-100 transition-opacity" aria-hidden="true" />
        </div>
      )}

      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="truncate text-sm font-medium text-foreground">
            {entity ? entity.title : 'Mission Control'}
          </h3>
          {entity && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xxs font-medium text-muted-foreground uppercase">
              {entity.type}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
            {/* Pop Out Button - Desktop Only */}
            {!isMobileView && (
                <button
                    onClick={handlePopOut}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Pop out inspector"
                    title="Pop out in new window"
                >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </button>
            )}
            
            {/* Close Button - Hide if strictly required by mobile Sheet but often nice to have anyway. 
                Sheet usually has its own close X, but we are inside Content. 
                AppShell SheetContent has "p-0", so we are the content.
                The Sheet primitive usually adds a Close X absolute top right.
                If we render our own, we might duplicate it or overlap.
                Sheet primitive's X is usually z-10.
                Let's keep this one.
            */}
            <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close inspector (Escape)"
            >
            <X className="h-4 w-4" aria-hidden="true" />
            </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-titan space-y-4">
        {/* ... Content remains same ... */}
        {entity && entity.type !== 'none' ? (
          <>
            {/* Registry-based Views */}
            {registry.getInspectorViewsFor(entity).map((view) => (
              <view.component key={view.id} entity={entity} />
            ))}

            {/* Special Entity Views */}
            {entity.type === 'memory' && <MemoryInspector />}

            {/* Legacy / Fallback Content (only if no specific views handled it, OR we want to support mixing?) 
                For now, let's allow mixing: Registry views appear at the top (if priority high) or we can just append them.
                Actually, let's render legacy content only if we haven't fully migrated.
                For this step, I will RENDER BOTH to allow new modules to append.
            */}
            
            {/* Legacy Content */}
            {/* Live Status + Risk Posture */}
            <section aria-label="Status and risk posture">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
                  Live Status
                </h4>
                <StatusBadge status={entityStatus} posture={operatorState?.posture} />
              </div>

              {/* Risk Caps */}
              {operatorState && (
                <div className="rounded-md border border-border/50 bg-background/50 p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Mode</span>
                    <span className="font-mono text-foreground">{operatorState.mode}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Confidence</span>
                    <span className={cn(
                      'font-mono',
                      operatorState.truth_confidence === 'high' ? 'text-status-healthy'
                        : operatorState.truth_confidence === 'low' ? 'text-status-critical'
                          : 'text-status-degraded',
                    )}>{operatorState.truth_confidence}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Breaker</span>
                    <span className={cn(
                      'font-mono',
                      operatorState.breaker === 'closed' ? 'text-status-healthy' : 'text-status-critical',
                    )}>{operatorState.breaker}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-mono text-foreground">{operatorState.pending_approvals}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">State Hash</span>
                    <span className="font-mono text-foreground/60 text-xxs truncate max-w-[120px]">
                      {operatorState.state_hash}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* Critical Alert Banner */}
            {isCritical && (
              <div className="rounded-md border border-status-critical/30 bg-status-critical/5 p-2.5 text-xs" role="alert">
                <div className="flex items-start gap-2 text-status-critical">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">Critical state detected</p>
                    <p className="mt-0.5 text-status-critical/80">
                      Recommended: execute safest action below before proceeding.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Properties */}
            {entity.data && Object.keys(entity.data).length > 0 && (
              <section aria-label="Entity properties">
                <h4 className="mb-2 text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
                  Properties
                </h4>
                <div className="space-y-1.5">
                  {Object.entries(entity.data).map(([key, value]) => (
                    <div key={key} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{key}</span>
                      <span className="font-mono text-foreground truncate max-w-[60%] text-right">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recent Events (Last 20) */}
            <section aria-label="Recent events">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent Events
                </h4>
                <span className="text-xxs text-muted-foreground/60">
                  {events.length} events
                </span>
              </div>
              {loadingEvents ? (
                <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                  <Activity className="h-3 w-3 animate-pulse" aria-hidden="true" />
                  Loading events…
                </div>
              ) : events.length > 0 ? (
                <div className="rounded-md border border-border/50 bg-background/50 divide-y-0 max-h-60 overflow-y-auto scrollbar-titan">
                  {events.map((event) => (
                    <EventItem
                      key={event.id}
                      event={event}
                      onInspect={(ev) => inspect({
                        type: 'intent',
                        id: ev.id,
                        title: `${ev.type} — ${ev.status}`,
                        data: ev as unknown as Record<string, unknown>,
                      })}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-border bg-muted/50 p-3 text-center text-xs text-muted-foreground">
                  No recent events
                </div>
              )}
            </section>

            {/* Decision Trace (intent entities only) */}
            {entity.type === 'intent' && (
              <section aria-label="Decision trace">
                <h4 className="mb-2 text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
                  Decision Trace
                </h4>
                {previewLoading ? (
                  <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                    <Activity className="h-3 w-3 animate-pulse" aria-hidden="true" />
                    Loading decision trace…
                  </div>
                ) : intentPreview ? (
                  <DecisionTraceBlock preview={intentPreview} />
                ) : (
                  <div className="rounded-md border border-border bg-muted/50 p-3 text-center text-xs text-muted-foreground">
                    Decision trace unavailable
                  </div>
                )}
              </section>
            )}

            {/* Truth Trace / Receipt */}
            <section aria-label="Latest receipt">
              <h4 className="mb-2 text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
                {entity.type === 'intent' ? 'Truth Trace' : 'Latest Receipt'}
              </h4>
              {latestReceipt ? (
                entity.type === 'intent' ? (
                  <TruthTraceBlock receipt={latestReceipt as IntentReceipt} />
                ) : (
                  <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
                    <ReceiptSection receipt={latestReceipt as unknown as Record<string, unknown>} />
                  </div>
                )
              ) : (
                <div className="rounded-md border border-border bg-muted/50 p-3 text-center text-xs text-muted-foreground">
                  No receipts available
                </div>
              )}
            </section>

            {/* Context Runbook (Next 3 Actions) */}
            <section aria-label="Suggested actions">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                <h4 className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
                  {isCritical ? 'Emergency Actions' : 'Suggested Actions'}
                </h4>
              </div>
              <div className="space-y-1.5">
                {runbookActions.map((action, i) => (
                  <ActionButton
                    key={i}
                    action={{ ...action, danger: action.danger as 'safe' | 'moderate' | 'critical' }}
                    compact={false}
                    requireConfirmation={isMobileView && action.danger !== 'safe'}
                  />
                ))}
              </div>
            </section>

            {/* Proof Trail */}
            {isCritical && events.length > 0 && (
              <section aria-label="Proof trail">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <h4 className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
                    Proof Trail
                  </h4>
                </div>
                <div className="rounded-md border border-border/50 bg-background/50 p-2.5 text-xs space-y-1">
                  {events.filter((e) =>
                    ['FAILED', 'UNVERIFIED', 'REJECTED'].includes(e.status)
                  ).slice(0, 5).map((event) => (
                    <div key={event.id} className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-status-critical flex-shrink-0" aria-hidden="true" />
                      <span className="text-foreground font-medium">{event.type}</span>
                      <span className="text-status-critical text-xxs uppercase ml-auto">{event.status}</span>
                    </div>
                  ))}
                  {events.filter((e) => ['FAILED', 'UNVERIFIED', 'REJECTED'].includes(e.status)).length === 0 && (
                    <span className="text-muted-foreground">No failure events in recent history</span>
                  )}
                </div>
              </section>
            )}
          </>
        ) : (
          /* Empty state */
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Minus className="mx-auto h-8 w-8 text-muted-foreground/30" aria-hidden="true" />
              <p className="mt-2 text-sm text-muted-foreground">Select an entity to inspect</p>
              <p className="mt-1 text-xxs text-muted-foreground/60">
                Click a row in any table, or select an intent from chat
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
