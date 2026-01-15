import { useState, useCallback } from 'react';
import { EventTimeline } from '@/components/titan/EventTimeline';
import { LatencyWaterfall } from '@/components/titan/LatencyWaterfall';
import { ServiceHealthCard } from '@/components/titan/ServiceHealthCard';
import { DenseTable } from '@/components/titan/DenseTable';
import { cn } from '@/lib/utils';
import { Activity, Filter, Radio } from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';

const latencySteps = [
  { name: 'Signal', duration: 2 },
  { name: 'Validate', duration: 4 },
  { name: 'Prepare', duration: 3 },
  { name: 'Confirm', duration: 2 },
  { name: 'Exchange ACK', duration: 1 },
];

interface LiveOpsData {
  events: any[];
  orders: any[];
  services: any[];
}

export default function LiveOps() {
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('all');
  const [data, setData] = useState<LiveOpsData>({ events: [], orders: [], services: [] });

  const handleMessage = useCallback((msg: any) => {
    if (msg.type === 'EVENT_STREAM') {
      setData(prev => ({ ...prev, events: [msg.event, ...prev.events].slice(0, 50) }));
    } else if (msg.type === 'ORDER_UPDATE') {
      setData(prev => ({ ...prev, orders: [msg.order, ...prev.orders].slice(0, 20) }));
    } else if (msg.type === 'SERVICE_STATUS') {
      setData(prev => ({ ...prev, services: msg.services }));
    }
  }, []);

  useWebSocket({
    onMessage: handleMessage
  });

  const filteredEvents = data.events.filter((event) => {
    if (selectedSeverity !== 'all' && event.severity !== selectedSeverity) return false;
    if (selectedSymbol !== 'all' && event.symbol !== selectedSymbol) return false;
    return true;
  });

  const symbols = [...new Set(data.events.filter((e) => e.symbol).map((e) => e.symbol))];

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
                        order.side === 'BUY' ? 'text-pnl-positive' : 'text-pnl-negative'
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
