import { useState, useCallback, useEffect } from 'react';
import { EventTimeline } from '@/components/titan/EventTimeline';
import { LatencyWaterfall } from '@/components/titan/LatencyWaterfall';
import { ServiceHealthCard } from '@/components/titan/ServiceHealthCard';
import { DenseTable } from '@/components/titan/DenseTable';
import { cn } from '@/lib/utils';
import { Phase, Severity } from '@/types';
import { Activity, Filter, Radio, Download } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-config';
import { toast } from 'sonner';
import { useTitanWebSocket } from '@/context/WebSocketContext';

const latencySteps = [
  { name: 'Signal', duration: 2 },
  { name: 'Validate', duration: 4 },
  { name: 'Prepare', duration: 3 },
  { name: 'Confirm', duration: 2 },
  { name: 'Exchange ACK', duration: 1 },
];

interface LiveOpsEvent {
  id: string; // Changed to string for TimelineEvent compatibility
  timestamp: number;
  type: 'alert' | 'system' | 'trade' | 'risk';
  severity: Severity;
  symbol: string;
  message: string;
  phase: Phase | null;
}

interface LiveOpsOrder {
  id: number;
  symbol: string;
  side: string;
  size: number;
  price: number;
  latency: number;
}

interface LiveOpsService {
  name: string;
  status: 'healthy' | 'degraded' | 'down'; // Matching ServiceHealthCard props if possible
  lastRestart?: number;
  uptime?: number;
  errorRate?: number;
}

interface LiveOpsData {
  events: LiveOpsEvent[];
  orders: LiveOpsOrder[];
  services: LiveOpsService[];
}





export default function LiveOps() {
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('all');
  const [data, setData] = useState<LiveOpsData>({ events: [], orders: [], services: [] });
  const [isExporting, setIsExporting] = useState(false);
  const { lastMessage } = useTitanWebSocket();

  const handleMessage = useCallback((msg: any) => {
    // Map Backend types to Frontend expected structure
    if (msg?.type === 'ALERT' || msg?.type === 'SIGNAL') {
      const event: any = {
        // Using any cast internally to simplify TimelineEvent compatibility for now until types are strictly shared
        // Using Cast to match interface, assuming logic handles it
        // id: String(msg.timestamp), // Already doing this, interface just needs to match
        timestamp: msg.timestamp,
        type: msg.type === 'ALERT' ? 'alert' : 'system',
        severity: (msg.data.level as any) || 'info', // TODO: Strictly map 'level' to Severity type
        message: msg.data.message || JSON.stringify(msg.data),
        symbol: msg.data.symbol || 'System',
        phase: null, // Backend doesn't send phase on generic alerts yet
      };
      setData((prev) => ({ ...prev, events: [event, ...prev.events].slice(0, 50) }));
    } else if (msg?.type === 'TRADE') {
      const order = {
        id: msg.timestamp,
        symbol: msg.data.symbol,
        side: msg.data.side,
        size: msg.data.size,
        price: msg.data.price,
        latency: 0, // Not currently sent
      };
      setData((prev) => ({ ...prev, orders: [order, ...prev.orders].slice(0, 20) }));
    } else if (msg?.type === 'SERVICE_STATUS') {
      // Keep this if we decide to implement explicit service status broadcast later
      setData((prev) => ({ ...prev, services: msg.services }));
    }
  }, []);

  useEffect(() => {
    if (lastMessage) {
      handleMessage(lastMessage);
    }
  }, [lastMessage, handleMessage]);

  const filteredEvents = data.events.filter((event) => {
    if (selectedSeverity !== 'all' && event.severity !== selectedSeverity) return false;
    if (selectedSymbol !== 'all' && event.symbol !== selectedSymbol) return false;
    return true;
  });

  const symbols = [...new Set(data.events.filter((e) => e.symbol).map((e) => e.symbol))];


  const handleExportEvidence = async () => {
    try {
      setIsExporting(true);
      const token = localStorage.getItem('titan_jwt');
      const response = await fetch(`${getApiBaseUrl()}/ops/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type: 'export_evidence',
          target: 'all',
          meta: { initiator_id: 'console-user', reason: 'manual_export' }
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success('Evidence Pack Generated', {
          description: `Download ready at: ${result.result?.url || 'Simulated URL'}`,
          action: {
            label: 'Download',
            onClick: () => window.open(result.result?.url, '_blank')
          }
        });
      } else {
        toast.error('Export Failed');
      }
    } catch (err) {
      toast.error('Export Failed', { description: String(err) });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary pulse-healthy" />
            Live Ops
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time event stream and system monitoring
          </p>
        </div>
        <button
            onClick={handleExportEvidence}
            disabled={isExporting}
            className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
        >
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export Evidence'}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Event Stream */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground"
            >
              <option value="all">All Severity</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground"
            >
              <option value="all">All Symbols</option>
              {symbols.map((sym: any) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </select>
          </div>

          {/* Timeline */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Event Stream</h2>
              <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xxs font-medium text-primary">
                {filteredEvents.length} events
              </span>
            </div>
            <EventTimeline events={filteredEvents} maxItems={15} />
          </div>

          {/* Latency Waterfall */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Latency Waterfall (Last Trade)
            </h2>
            <LatencyWaterfall steps={latencySteps} />
          </div>
        </div>

        {/* Service Status */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Service Status</h2>

          <div className="space-y-3">
            {data.services.map((service: any) => (
              <ServiceHealthCard
                key={service.name}
                name={service.name}
                status={service.status}
                lastHeartbeat={service.lastRestart}
                uptime={service.uptime}
                eventRate={service.errorRate} // Assuming errorRate mapped to eventRate for card prop
              />
            ))}
          </div>

          {/* Recent Orders Summary */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Recent Orders</h3>
            <DenseTable
              columns={[
                { key: 'symbol', header: 'Symbol' },
                {
                  key: 'side',
                  header: 'Side',
                  render: (order: any) => (
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
                {
                  key: 'latency',
                  header: 'Latency',
                  align: 'right',
                  render: (order: any) => (
                    <span className="text-muted-foreground">
                      {order.latency ? `${order.latency}ms` : '—'}
                    </span>
                  ),
                },
              ]}
              data={data.orders.slice(0, 5)}
              keyExtractor={(order: any) => order.id}
              maxHeight="200px"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
