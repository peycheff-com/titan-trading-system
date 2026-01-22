import { useState } from 'react';
import { KpiTile } from '@/components/titan/KpiTile';
import { StatusPill } from '@/components/titan/StatusPill';
import { DenseTable } from '@/components/titan/DenseTable';
import { DiffViewer } from '@/components/titan/DiffViewer';
import { ConfirmModal } from '@/components/titan/ConfirmModal';
import { formatCurrency, formatPercent } from '@/types';
import { cn } from '@/lib/utils';
import { Shield, AlertTriangle, Edit3, ArrowLeftRight, TrendingUp } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';

interface ContextType {
  safetyLocked: boolean;
}

const mockDraftConfig = {
  before: { rebalanceThreshold: 0.02, maxDeltaExposure: 25000, hedgeRatio: 1.0 },
  after: { rebalanceThreshold: 0.025, maxDeltaExposure: 30000, hedgeRatio: 0.98 },
};

export default function SentinelPhase() {
  const { safetyLocked } = useOutletContext<ContextType>();
  const [hasDraft, setHasDraft] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const status = {
    status: 'offline' as const,
    enabled: false,
    allocationWeight: 0,
    activeStrategies: 0,
  };
  const sentinelData = {
    basisTrades: [] as any[],
    fundingRates: [] as any[],
    hedgeStatus: { hedgeRatio: 0, targetRatio: 0, deltaExposure: 0 },
  };
  const { basisTrades, fundingRates, hedgeStatus } = sentinelData;

  const handleCreateDraft = () => {
    if (safetyLocked) {
      toast.error('Safety lock is enabled. Unlock to make changes.');
      return;
    }
    setHasDraft(true);
    toast.success('Draft created. Changes are local only.');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-phase-sentinel/10">
            <Shield className="h-6 w-6 text-phase-sentinel" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Sentinel Phase</h1>
            <p className="text-sm text-muted-foreground">
              Market-neutral strategies using basis and funding arbitrage
            </p>
          </div>
        </div>
        <StatusPill status={status.status} size="md" />
      </div>

      {/* Phase Intent Card */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Phase Intent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sentinel maintains delta-neutral positions through basis trades and funding rate
          arbitrage. It provides stable, low-volatility returns by exploiting structural
          inefficiencies between spot and perpetual markets.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Status:</span>
            <span
              className={cn(
                'text-xs font-medium',
                status.enabled ? 'text-status-healthy' : 'text-muted-foreground',
              )}
            >
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
        <KpiTile
          label="Hedge Ratio"
          value={`${(hedgeStatus.hedgeRatio * 100).toFixed(0)}%`}
          subValue={`Target: ${(hedgeStatus.targetRatio * 100).toFixed(0)}%`}
          variant={
            Math.abs(hedgeStatus.hedgeRatio - hedgeStatus.targetRatio) > 0.05
              ? 'warning'
              : 'default'
          }
        />
        <KpiTile
          label="Delta Exposure"
          value={formatCurrency(Math.abs(hedgeStatus.deltaExposure))}
          variant={Math.abs(hedgeStatus.deltaExposure) > 20000 ? 'warning' : 'default'}
        />
        <KpiTile label="Active Basis Trades" value={basisTrades.length} />
        <KpiTile
          label="Basis PnL"
          value={formatCurrency(basisTrades.reduce((sum, t) => sum + t.pnl, 0))}
          variant="positive"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Basis Trades */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-phase-sentinel" />
            <h2 className="text-sm font-semibold text-foreground">Basis Trades</h2>
          </div>

          <DenseTable
            columns={[
              { key: 'pair', header: 'Pair' },
              {
                key: 'currentBasis',
                header: 'Current',
                align: 'right',
                render: (t) => (
                  <span
                    className={cn(
                      'font-mono',
                      t.currentBasis > t.avgBasis ? 'text-pnl-positive' : 'text-pnl-negative',
                    )}
                  >
                    {(t.currentBasis * 100).toFixed(3)}%
                  </span>
                ),
              },
              {
                key: 'avgBasis',
                header: 'Avg',
                align: 'right',
                render: (t) => (
                  <span className="font-mono text-muted-foreground">
                    {(t.avgBasis * 100).toFixed(3)}%
                  </span>
                ),
              },
              {
                key: 'position',
                header: 'Position',
                align: 'right',
                render: (t) => formatCurrency(t.position),
              },
              {
                key: 'pnl',
                header: 'PnL',
                align: 'right',
                render: (t) => (
                  <span
                    className={cn(
                      'font-mono',
                      t.pnl >= 0 ? 'text-pnl-positive' : 'text-pnl-negative',
                    )}
                  >
                    {formatCurrency(t.pnl)}
                  </span>
                ),
              },
            ]}
            data={basisTrades}
            keyExtractor={(t) => t.pair}
          />
        </div>

        {/* Funding Rates */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-phase-sentinel" />
            <h2 className="text-sm font-semibold text-foreground">Funding Rates</h2>
          </div>

          <DenseTable
            columns={[
              { key: 'symbol', header: 'Symbol' },
              {
                key: 'current',
                header: 'Current',
                align: 'right',
                render: (f) => (
                  <span
                    className={cn(
                      'font-mono',
                      f.current >= 0 ? 'text-pnl-positive' : 'text-pnl-negative',
                    )}
                  >
                    {formatPercent(f.current * 100, 4)}
                  </span>
                ),
              },
              {
                key: 'predicted',
                header: 'Predicted',
                align: 'right',
                render: (f) => (
                  <span className="font-mono text-muted-foreground">
                    {formatPercent(f.predicted * 100, 4)}
                  </span>
                ),
              },
              { key: 'nextIn', header: 'Next In', align: 'right' },
            ]}
            data={fundingRates}
            keyExtractor={(f) => f.symbol}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Hedge Status */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Hedge Status</h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Hedge Ratio</span>
                  <span className="font-mono text-foreground">
                    {(hedgeStatus.hedgeRatio * 100).toFixed(1)}% /{' '}
                    {(hedgeStatus.targetRatio * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-phase-sentinel transition-all"
                    style={{ width: `${hedgeStatus.hedgeRatio * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Delta Exposure</span>
                <span
                  className={cn(
                    'font-mono',
                    hedgeStatus.deltaExposure < 0 ? 'text-pnl-negative' : 'text-pnl-positive',
                  )}
                >
                  {formatCurrency(hedgeStatus.deltaExposure)}
                </span>
              </div>
            </div>
          </div>
        </div>

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
                  safetyLocked ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted',
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

                <DiffViewer before={mockDraftConfig.before} after={mockDraftConfig.after} />

                <div className="flex gap-2">
                  <button
                    onClick={() => setHasDraft(false)}
                    className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                  >
                    Discard
                  </button>
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Apply Draft
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Apply Sentinel Configuration"
        description="This will apply the draft configuration to the Sentinel phase."
        confirmLabel="Apply"
        onConfirm={() => {
          setShowConfirm(false);
          toast.info('Waiting for backend integration...');
        }}
      />
    </div>
  );
}
