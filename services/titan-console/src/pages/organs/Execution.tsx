import { useState, useEffect } from 'react';
import { DenseTable } from '@/components/titan/DenseTable';
import { RowDetailDrawer, DetailSection, DetailRow } from '@/components/titan/RowDetailDrawer';
import { LatencyWaterfall } from '@/components/titan/LatencyWaterfall';
import { StatusPill } from '@/components/titan/StatusPill';
import { formatTimestamp, formatCurrency } from '@/types';
import { cn } from '@/lib/utils';
import { Zap, Check, AlertTriangle, Clock } from 'lucide-react';
import { useTitanData } from '@/hooks/useTitanData';

const statusConfig: any = {
  FILLED: { color: 'text-status-healthy', bg: 'bg-status-healthy/10' },
  PARTIAL: { color: 'text-warning', bg: 'bg-warning/10' },
  OPEN: { color: 'text-primary', bg: 'bg-primary/10' },
  CANCELLED: { color: 'text-muted-foreground', bg: 'bg-muted' },
};

const phaseColors: any = {
  scavenger: 'bg-phase-scavenger/10 text-phase-scavenger',
  hunter: 'bg-phase-hunter/10 text-phase-hunter',
  sentinel: 'bg-phase-sentinel/10 text-phase-sentinel',
};

export default function ExecutionPage() {
  const { request } = useTitanData();
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const response = await request('/api/console/trades?limit=50');
        if (response && response.success) {
          // Normalize trades to match order view
          const normalized = (response.data.trades || []).map((t: any) => ({
            ...t,
            id: t.id || t.trade_id || `t-${t.timestamp}`,
            status: 'FILLED', // Historical trades are filled
            qty: t.size,
            filled: t.size,
            price: t.entry_price || t.price,
            phase: t.phase || 'scavenger',
          }));
          setOrders(normalized);
        }
      } catch (error) {
        console.error('Failed to fetch trades:', error);
      }
    };

    fetchTrades();
    const interval = setInterval(fetchTrades, 10000);
    return () => clearInterval(interval);
  }, [request]);

  const handleRowClick = (order: any) => {
    setSelectedOrder(order);
    setDrawerOpen(true);
  };

  const validator = {
    latencyBreakdown: { signal: 0, validate: 0, prepare: 0, confirm: 0, exchangeAck: 0 },
    obi: { imbalance: 0, status: 'pass' },
    depth: { ratio: 0, status: 'pass' },
    slippage: { actual: 0, expected: 0, status: 'pass' },
    twoPhaseCommit: { prepare: { status: 'pending' }, confirm: { status: 'pending' } },
  };
  const latencySteps = [
    { name: 'Signal', duration: validator.latencyBreakdown.signal },
    { name: 'Validate', duration: validator.latencyBreakdown.validate },
    { name: 'Prepare', duration: validator.latencyBreakdown.prepare },
    { name: 'Confirm', duration: validator.latencyBreakdown.confirm },
    { name: 'Exchange ACK', duration: validator.latencyBreakdown.exchangeAck },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10">
            <Zap className="h-6 w-6 text-warning" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Execution</h1>
            <p className="text-sm text-muted-foreground">
              Order validation, 2-phase commit lifecycle & fills
            </p>
          </div>
        </div>
        <StatusPill status="healthy" label="Operational" size="md" />
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-border bg-card p-3">
          <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
            Open Orders
          </span>
          <div className="mt-1 text-xl font-semibold text-foreground">
            {orders.filter((o) => o.status === 'OPEN').length}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
            Filled Today
          </span>
          <div className="mt-1 text-xl font-semibold text-pnl-positive">
            {orders.filter((o) => o.status === 'FILLED').length}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
            Avg Latency
          </span>
          <div className="mt-1 font-mono text-xl font-semibold text-foreground">
            {Math.round(
              orders.filter((o) => o.latency).reduce((sum, o) => sum + (o.latency || 0), 0) /
                orders.filter((o) => o.latency).length,
            )}
            ms
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
            Fill Rate
          </span>
          <div className="mt-1 text-xl font-semibold text-foreground">98.2%</div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Orders & Fills</h2>

        <DenseTable
          columns={[
            {
              key: 'timestamp',
              header: 'Time',
              render: (order) => (
                <span className="text-muted-foreground">{formatTimestamp(order.timestamp)}</span>
              ),
            },
            { key: 'symbol', header: 'Symbol' },
            {
              key: 'side',
              header: 'Side',
              render: (order) => (
                <span
                  className={cn(
                    'font-medium',
                    order.side === 'BUY' ? 'text-pnl-positive' : 'text-pnl-negative',
                  )}
                >
                  {order.side}
                </span>
              ),
            },
            { key: 'type', header: 'Type' },
            {
              key: 'price',
              header: 'Price',
              align: 'right',
              render: (order) => formatCurrency(order.price, order.price < 10 ? 4 : 2),
            },
            {
              key: 'qty',
              header: 'Qty',
              align: 'right',
              render: (order) => (
                <span className="font-mono">
                  {order.filled}/{order.qty}
                </span>
              ),
            },
            {
              key: 'phase',
              header: 'Phase',
              render: (order) => (
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xxs font-medium capitalize',
                    phaseColors[order.phase],
                  )}
                >
                  {order.phase}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (order) => (
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xxs font-medium',
                    statusConfig[order.status].bg,
                    statusConfig[order.status].color,
                  )}
                >
                  {order.status}
                </span>
              ),
            },
            {
              key: 'latency',
              header: 'Latency',
              align: 'right',
              render: (order) => (
                <span className="font-mono text-muted-foreground">
                  {order.latency ? `${order.latency}ms` : '—'}
                </span>
              ),
            },
          ]}
          data={orders}
          keyExtractor={(order) => order.id}
          onRowClick={handleRowClick}
          selectedKey={selectedOrder?.id}
          maxHeight="400px"
        />
      </div>

      {/* Trade Detail Drawer */}
      <RowDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={selectedOrder ? `Order ${selectedOrder.id}` : 'Order Details'}
      >
        {selectedOrder && (
          <div className="space-y-6">
            {/* Order Info */}
            <DetailSection title="Order Information">
              <DetailRow label="Symbol" value={selectedOrder.symbol} />
              <DetailRow
                label="Side"
                value={
                  <span
                    className={cn(
                      'font-medium',
                      selectedOrder.side === 'BUY' ? 'text-pnl-positive' : 'text-pnl-negative',
                    )}
                  >
                    {selectedOrder.side}
                  </span>
                }
              />
              <DetailRow label="Type" value={selectedOrder.type} />
              <DetailRow label="Price" value={formatCurrency(selectedOrder.price)} />
              <DetailRow label="Quantity" value={`${selectedOrder.filled}/${selectedOrder.qty}`} />
              <DetailRow
                label="Phase"
                value={<span className="capitalize">{selectedOrder.phase}</span>}
              />
            </DetailSection>

            {/* Validator Snapshot */}
            <DetailSection title="Validator Snapshot">
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <div>
                    <span className="text-xs text-muted-foreground">
                      OBI (Order Book Imbalance)
                    </span>
                    <div className="font-mono text-sm text-foreground">
                      {validator.obi.imbalance.toFixed(2)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'flex items-center gap-1 rounded px-1.5 py-0.5 text-xxs font-medium',
                      validator.obi.status === 'pass'
                        ? 'bg-status-healthy/10 text-status-healthy'
                        : 'bg-status-critical/10 text-status-critical',
                    )}
                  >
                    {validator.obi.status === 'pass' ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <AlertTriangle className="h-3 w-3" />
                    )}
                    {validator.obi.status}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Depth Ratio</span>
                    <div className="font-mono text-sm text-foreground">
                      {validator.depth.ratio.toFixed(2)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'flex items-center gap-1 rounded px-1.5 py-0.5 text-xxs font-medium',
                      validator.depth.status === 'pass'
                        ? 'bg-status-healthy/10 text-status-healthy'
                        : 'bg-status-critical/10 text-status-critical',
                    )}
                  >
                    {validator.depth.status === 'pass' ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <AlertTriangle className="h-3 w-3" />
                    )}
                    {validator.depth.status}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Slippage</span>
                    <div className="font-mono text-sm text-foreground">
                      {(validator.slippage.actual * 100).toFixed(3)}% (exp:{' '}
                      {(validator.slippage.expected * 100).toFixed(3)}%)
                    </div>
                  </div>
                  <span
                    className={cn(
                      'flex items-center gap-1 rounded px-1.5 py-0.5 text-xxs font-medium',
                      validator.slippage.status === 'pass'
                        ? 'bg-status-healthy/10 text-status-healthy'
                        : 'bg-status-critical/10 text-status-critical',
                    )}
                  >
                    {validator.slippage.status === 'pass' ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <AlertTriangle className="h-3 w-3" />
                    )}
                    {validator.slippage.status}
                  </span>
                </div>
              </div>
            </DetailSection>

            {/* 2-Phase Commit */}
            <DetailSection title="2-Phase Commit">
              <div className="flex gap-4">
                <div className="flex-1 rounded-md border border-border p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Prepare
                  </div>
                  <div
                    className={cn(
                      'mt-1 text-sm font-medium',
                      validator.twoPhaseCommit.prepare.status === 'completed'
                        ? 'text-status-healthy'
                        : 'text-muted-foreground',
                    )}
                  >
                    {validator.twoPhaseCommit.prepare.status === 'completed'
                      ? '✓ Completed'
                      : 'Pending'}
                  </div>
                </div>
                <div className="flex items-center text-muted-foreground">→</div>
                <div className="flex-1 rounded-md border border-border p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <Check className="h-3 w-3" />
                    Confirm
                  </div>
                  <div
                    className={cn(
                      'mt-1 text-sm font-medium',
                      validator.twoPhaseCommit.confirm.status === 'completed'
                        ? 'text-status-healthy'
                        : 'text-muted-foreground',
                    )}
                  >
                    {validator.twoPhaseCommit.confirm.status === 'completed'
                      ? '✓ Completed'
                      : 'Pending'}
                  </div>
                </div>
              </div>
            </DetailSection>

            {/* Latency Breakdown */}
            <DetailSection title="Latency Breakdown">
              <LatencyWaterfall steps={latencySteps} />
            </DetailSection>
          </div>
        )}
      </RowDetailDrawer>
    </div>
  );
}
