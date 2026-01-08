import { useState } from 'react';
import { KpiTile } from '@/components/titan/KpiTile';
import { StatusPill } from '@/components/titan/StatusPill';
import { DenseTable } from '@/components/titan/DenseTable';
import { DiffViewer } from '@/components/titan/DiffViewer';
import { ConfirmModal } from '@/components/titan/ConfirmModal';
import { formatCurrency } from '@/types';
import { cn } from '@/lib/utils';
import { Target, AlertTriangle, Edit3, TrendingUp, TrendingDown } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';

interface ContextType {
  safetyLocked: boolean;
}

const mockDraftConfig = {
  before: { poiThreshold: 0.5, minLiquidity: 1000000, timeframes: ['1H', '4H'] },
  after: { poiThreshold: 0.45, minLiquidity: 1200000, timeframes: ['1H', '4H', '1D'] },
};

export default function HunterPhase() {
  const { safetyLocked } = useOutletContext<ContextType>();
  const [hasDraft, setHasDraft] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState('all');

  const status = { status: 'offline' as const, enabled: false, allocationWeight: 0, activeStrategies: 0 };
  const pois: any[] = [];
  const filteredPois: any[] = [];

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
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-phase-hunter/10">
            <Target className="h-6 w-6 text-phase-hunter" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Hunter Phase</h1>
            <p className="text-sm text-muted-foreground">
              Structure-based strategies using POIs and order flow
            </p>
          </div>
        </div>
        <StatusPill status={status.status} size="md" />
      </div>

      {/* Phase Intent Card */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Phase Intent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hunter identifies high-probability Points of Interest (POIs) using market structure analysis.
          It executes directional trades at key levels with defined risk parameters, targeting
          liquidity pools and fair value gaps.
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
        <KpiTile label="Active POIs" value={pois.length} />
        <KpiTile label="Avg Distance" value="2.6%" />
        <KpiTile label="Hits Today" value={5} trend="up" />
        <KpiTile label="Win Rate" value="58.2%" trend="neutral" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* POI List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Points of Interest</h2>
            <div className="flex items-center gap-2">
              <span className="text-xxs text-muted-foreground">Timeframe:</span>
              <select
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
                className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground"
              >
                <option value="all">All</option>
                <option value="1H">1H</option>
                <option value="4H">4H</option>
                <option value="1D">1D</option>
              </select>
            </div>
          </div>

          <DenseTable
            columns={[
              { key: 'symbol', header: 'Symbol' },
              {
                key: 'type',
                header: 'Type',
                render: (poi) => (
                  <span className={cn(
                    'rounded px-1.5 py-0.5 text-xxs font-medium',
                    poi.type === 'Support' && 'bg-pnl-positive/10 text-pnl-positive',
                    poi.type === 'Resistance' && 'bg-pnl-negative/10 text-pnl-negative',
                    poi.type === 'FVG' && 'bg-primary/10 text-primary',
                    poi.type === 'Order Block' && 'bg-phase-hunter/10 text-phase-hunter'
                  )}>
                    {poi.type}
                  </span>
                ),
              },
              {
                key: 'price',
                header: 'Price',
                align: 'right',
                render: (poi) => formatCurrency(poi.price, poi.price < 10 ? 4 : 2),
              },
              { key: 'timeframe', header: 'TF', align: 'center' },
              {
                key: 'strength',
                header: 'Strength',
                render: (poi) => (
                  <span className={cn(
                    'text-xs',
                    poi.strength === 'Strong' && 'text-status-healthy',
                    poi.strength === 'Medium' && 'text-warning',
                    poi.strength === 'Weak' && 'text-muted-foreground'
                  )}>
                    {poi.strength}
                  </span>
                ),
              },
              {
                key: 'distance',
                header: 'Distance',
                align: 'right',
                render: (poi) => (
                  <span className={cn(
                    'font-mono',
                    poi.distance < 2 && 'text-status-critical'
                  )}>
                    {poi.distance.toFixed(1)}%
                  </span>
                ),
              },
            ]}
            data={filteredPois}
            keyExtractor={(poi) => poi.id}
            maxHeight="320px"
          />
        </div>

        {/* Controls */}
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
                    onClick={() => setShowConfirm(true)}
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
        title="Apply Hunter Configuration"
        description="This will apply the draft configuration to the Hunter phase."
        confirmLabel="Apply"
        onConfirm={() => {
          setShowConfirm(false);
          toast.info('Waiting for backend integration...');
        }}
      />
    </div>
  );
}
