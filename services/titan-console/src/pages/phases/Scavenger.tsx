import { useState } from 'react';
import { KpiTile } from '@/components/titan/KpiTile';
import { StatusPill } from '@/components/titan/StatusPill';
import { DenseTable } from '@/components/titan/DenseTable';
import { DiffViewer } from '@/components/titan/DiffViewer';
import { ConfirmModal } from '@/components/titan/ConfirmModal';
import { TrapMapCanvas } from '@/components/scavenger/TrapMapCanvas';
import { useScavengerSocket } from '@/hooks/useScavengerSocket';
import { cn } from '@/lib/utils';
import { Bug, AlertTriangle, Edit3, Wifi, Activity, RotateCcw } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';

interface ContextType {
  safetyLocked: boolean;
}

// Using real TrapConfig keys for meaningful updates
const mockDraftConfig = {
  before: {
    liquidationConfidence: 95,
    maxLeverage: 20,
    minTradesIn100ms: 50,
    ghostMode: true
  },
  after: {
    liquidationConfidence: 92, // Lower confidence threshold
    maxLeverage: 25,           // Higher leverage
    minTradesIn100ms: 45,      // More sensitive volume trigger
    ghostMode: false           // Live mode
  },
};

export default function ScavengerPhase() {
  const { safetyLocked } = useOutletContext<ContextType>();
  const [hasDraft, setHasDraft] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);

  // Hook into Real-time Data
  const { isConnected, trapMap, sensorStatus } = useScavengerSocket();

  const armedTripwires = trapMap.filter(t => t.proximity < 0.1); // Consider <10% as "Armed/Watching"
  const criticalTripwires = trapMap.filter(t => t.proximity < 0.02); // <2% is Critical

  const getBaseUrl = () => import.meta.env.VITE_TITAN_EXECUTION_URL || "http://localhost:3000";

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

  const handleConfirmApply = async () => {
    setShowConfirm(false);
    
    try {
      const baseUrl = getBaseUrl();
      const payload = {
        scavenger: mockDraftConfig.after
      };

      const response = await fetch(`${baseUrl}/api/config/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update configuration');
      }

      toast.success('Configuration applied successfully');
      setHasDraft(false);
    } catch (error) {
      console.error('Failed to apply config:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to apply configuration');
    }
  };

  const handleRollback = () => {
    if (safetyLocked) {
        toast.error('Safety lock is enabled. Unlock to rollback.');
        return;
    }
    setShowRollbackConfirm(true);
  };

  const handleConfirmRollback = async () => {
    setShowRollbackConfirm(false);

    try {
        const baseUrl = getBaseUrl();
        // 1. Fetch versions to find previous tag
        const versionsRes = await fetch(`${baseUrl}/api/config/versions?limit=2`);
        const versionsData = await versionsRes.json();
        
        if (!versionsData.versions || versionsData.versions.length < 2) {
            throw new Error('No previous version available for rollback');
        }

        const previousVersion = versionsData.versions[1]; // Index 1 is the one before current (Index 0)

        // 2. Perform Rollback
        const rollbackRes = await fetch(`${baseUrl}/api/config/rollback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetVersionTag: previousVersion.tag,
                confirm: true
            })
        });

        const rollbackResult = await rollbackRes.json();
        if (!rollbackRes.ok) {
            throw new Error(rollbackResult.error || 'Rollback failed');
        }

        toast.success(`Rolled back to ${previousVersion.tag}`);

    } catch (error) {
        console.error('Rollback failed:', error);
        toast.error(error instanceof Error ? error.message : 'Rollback failed');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-phase-scavenger/10 relative overflow-hidden">
             {/* Pulse effect if connected */}
            {isConnected && (
               <div className="absolute inset-0 bg-phase-scavenger/20 animate-pulse" />
            )}
            <Bug className="h-6 w-6 text-phase-scavenger relative z-10" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Scavenger Phase</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              Trap-based strategies using tripwire triggers
              {isConnected ? (
                 <span className="flex items-center gap-1 text-green-500 text-xs px-2 py-0.5 bg-green-500/10 rounded-full">
                    <Wifi className="h-3 w-3" /> Live
                 </span>
              ) : (
                <span className="flex items-center gap-1 text-red-500 text-xs px-2 py-0.5 bg-red-500/10 rounded-full">
                    <Wifi className="h-3 w-3" /> Disconnected
                 </span>
              )}
            </p>
          </div>
        </div>
        <StatusPill status={isConnected ? 'active' : 'offline'} size="md" />
      </div>

      {/* Phase Intent Card */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Phase Intent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Scavenger deploys passive "tripwire" orders at key price levels. When triggered, 
          it executes rapid mean-reversion trades with <strong>Adaptive Volatility Scaling</strong>.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Binance Feed:</span>
            <span className={cn(
              'text-xs font-medium',
              sensorStatus.binanceHealth === 'OK' ? 'text-status-healthy' : 'text-status-critical'
            )}>
              {sensorStatus.binanceHealth} ({sensorStatus.binanceTickRate} tps)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Bybit Exec:</span>
            <span className={cn(
              'text-xs font-medium',
              sensorStatus.bybitStatus === 'ARMED' ? 'text-status-healthy' : 'text-muted-foreground'
            )}>
              {sensorStatus.bybitStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Canvas Visualization */}
      <div className="w-full">
        <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Live Trap Map
        </h2>
        <TrapMapCanvas traps={trapMap} height={200} />
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Armed Tripwires" value={trapMap.length} />
        <KpiTile
          label="Critical Proximity"
          value={criticalTripwires.length}
          variant={criticalTripwires.length > 0 ? 'warning' : 'default'}
        />
        {/* Placeholder stats as these aren't in the WS stream yet */}
        <KpiTile label="Triggers Today" value={3} />
        <KpiTile label="Win Rate" value="67.4%" trend="up" trendValue="+2.1%" variant="positive" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tripwire Board */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Tripwire Board</h2>
            <span className="text-xxs text-muted-foreground">
              {trapMap.length} managed traps
            </span>
          </div>

          <DenseTable
            columns={[
              { key: 'symbol', header: 'Symbol' },
              { key: 'trapType', header: 'Trap Type' },
              {
                key: 'triggerPrice',
                header: 'Trigger',
                render: (tw) => <span className="font-mono">{tw.triggerPrice.toFixed(4)}</span>
              },
              {
                key: 'proximity',
                header: 'Proximity',
                align: 'right',
                render: (tw) => (
                  <span
                    className={cn(
                      'font-mono',
                      tw.proximity < 0.01 && 'text-status-critical animate-pulse',
                      tw.proximity >= 0.01 && tw.proximity < 0.05 && 'text-warning',
                      tw.proximity >= 0.05 && 'text-muted-foreground'
                    )}
                  >
                    {(tw.proximity * 100).toFixed(2)}%
                  </span>
                ),
              },
              {
                key: 'confidence',
                header: 'Conf.',
                align: 'right',
                render: (tw) => (
                    <span className="font-mono text-xs">{tw.confidence}%</span>
                )
              }
            ]}
            data={trapMap}
            keyExtractor={(tw) => tw.symbol + tw.trapType}
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
               <div className="space-y-2">
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

                  <button
                    onClick={handleRollback}
                    disabled={safetyLocked}
                    className={cn(
                      'flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors text-muted-foreground',
                       safetyLocked
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Rollback
                  </button>
               </div>
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
              Changes are saved as local drafts only. Apply to push to live engine.
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
      
      <ConfirmModal
        open={showRollbackConfirm}
        onOpenChange={setShowRollbackConfirm}
        title="Rollback Configuration"
        description="This will revert the configuration to the immediately previous version. Are you sure?"
        confirmLabel="Rollback"
        onConfirm={handleConfirmRollback}
        variant="destructive"
      />
    </div>
  );
}
