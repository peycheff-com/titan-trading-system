import { useState } from 'react';
import { KpiTile } from '@/components/titan/KpiTile';
import { StatusPill } from '@/components/titan/StatusPill';
import { DenseTable } from '@/components/titan/DenseTable';
import { DiffViewer } from '@/components/titan/DiffViewer';
import { ConfirmModal } from '@/components/titan/ConfirmModal';
import { formatTimeAgo } from '@/types';
import { cn } from '@/lib/utils';
import { Bug, AlertTriangle, Edit3, Check, X } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';

interface ContextType {
  safetyLocked: boolean;
}

const mockDraftConfig = {
  before: { sensitivityMultiplier: 1.0, cooldownPeriod: 300, maxTripwires: 10 },
  after: { sensitivityMultiplier: 1.15, cooldownPeriod: 280, maxTripwires: 12 },
};

export default function ScavengerPhase() {
  const { safetyLocked } = useOutletContext<ContextType>();
  const [hasDraft, setHasDraft] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Default empty state
  const status = { status: 'offline' as const, enabled: false, allocationWeight: 0, activeStrategies: 0 };
  const tripwires: any[] = [];
  const armedTripwires: any[] = [];
  const criticalTripwires: any[] = [];

  const handleCreateDraft = () => {
    if (safetyLocked) {
      toast.error('Safety lock is enabled. Unlock to make changes.');
      return;
    }
    setHasDraft(true);
    toast.success('Draft created. Changes are local only.');
  };

  const handleApplyDraft = () => {
    setShowConfirm(true);
  };

  const handleConfirmApply = () => {
    setShowConfirm(false);
    toast.info('Waiting for backend integration...');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-phase-scavenger/10">
            <Bug className="h-6 w-6 text-phase-scavenger" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Scavenger Phase</h1>
            <p className="text-sm text-muted-foreground">
              Trap-based strategies using tripwire triggers
            </p>
          </div>
        </div>
        <StatusPill status={status.status} size="md" />
      </div>

      {/* Phase Intent Card */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Phase Intent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Scavenger deploys passive "tripwire" orders at key price levels. When triggered, 
          it executes rapid mean-reversion or momentum-following trades. Optimal for volatile, 
          ranging markets with clear support/resistance levels.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Status:</span>
            <span className={cn(
              'text-xs font-medium',
              status.enabled ? 'text-status-healthy' : 'text-muted-foreground'
            )}>
              {status.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Allocation:</span>
            <span className="font-mono text-xs text-foreground">{status.allocationWeight}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Active Strategies:</span>
            <span className="font-mono text-xs text-foreground">{status.activeStrategies}</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Armed Tripwires" value={armedTripwires.length} />
        <KpiTile
          label="Critical Proximity"
          value={criticalTripwires.length}
          variant={criticalTripwires.length > 0 ? 'warning' : 'default'}
        />
        <KpiTile label="Triggers Today" value={3} />
        <KpiTile label="Win Rate" value="67.4%" trend="up" trendValue="+2.1%" variant="positive" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tripwire Board */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Tripwire Board</h2>
            <span className="text-xxs text-muted-foreground">
              {armedTripwires.length} armed / {tripwires.length} total
            </span>
          </div>

          <DenseTable
            columns={[
              { key: 'symbol', header: 'Symbol' },
              { key: 'trigger', header: 'Trigger Condition' },
              {
                key: 'proximity',
                header: 'Proximity',
                align: 'right',
                render: (tw) => (
                  <span
                    className={cn(
                      'font-mono',
                      tw.proximity < 5 && 'text-status-critical',
                      tw.proximity >= 5 && tw.proximity < 15 && 'text-warning',
                      tw.proximity >= 15 && 'text-muted-foreground'
                    )}
                  >
                    {tw.proximity.toFixed(1)}%
                  </span>
                ),
              },
              {
                key: 'armed',
                header: 'Armed',
                align: 'center',
                render: (tw) => (
                  tw.armed ? (
                    <Check className="mx-auto h-4 w-4 text-status-healthy" />
                  ) : (
                    <X className="mx-auto h-4 w-4 text-muted-foreground" />
                  )
                ),
              },
              {
                key: 'lastTriggered',
                header: 'Last Triggered',
                align: 'right',
                render: (tw) => (
                  <span className="text-muted-foreground">
                    {tw.lastTriggered ? formatTimeAgo(tw.lastTriggered) : '—'}
                  </span>
                ),
              },
            ]}
            data={tripwires}
            keyExtractor={(tw) => tw.id}
            maxHeight="320px"
          />
        </div>

        {/* Controls (Draft Only) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Controls</h2>
            {safetyLocked && (
              <span className="flex items-center gap-1 text-xxs text-warning">
                <AlertTriangle className="h-3 w-3" />
                Locked
              </span>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            {!hasDraft ? (
              <button
                onClick={handleCreateDraft}
                disabled={safetyLocked}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors',
                  safetyLocked
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:bg-muted'
                )}
              >
                <Edit3 className="h-4 w-4" />
                Create Draft
              </button>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-xs font-medium text-primary">Draft Active</span>
                </div>

                <DiffViewer
                  before={mockDraftConfig.before}
                  after={mockDraftConfig.after}
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => setHasDraft(false)}
                    className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleApplyDraft}
                    className="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Apply Draft
                  </button>
                </div>
              </>
            )}

            <p className="text-xxs text-muted-foreground">
              Changes are saved as local drafts only. Apply requires backend integration.
            </p>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Apply Scavenger Configuration"
        description="This will apply the draft configuration to the Scavenger phase."
        confirmLabel="Apply"
        onConfirm={handleConfirmApply}
      />
    </div>
  );
}
