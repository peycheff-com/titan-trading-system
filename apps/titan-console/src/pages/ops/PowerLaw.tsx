/**
 * PowerLaw Control Center
 * Central command for tail-risk metrics, execution constraints, and impact monitoring
 */
import { useState, useEffect, useCallback } from 'react';
import {
  GlobalHealthCard,
  RiskDriversTable,
  ImpactFeed,
  ConstraintsTable,
  PowerLawMetrics,
  ExecutionConstraints,
  ImpactEvent,
} from '@/components/titan/PowerLawComponents';
import { useTitanWebSocket } from '@/context/WebSocketContext';
import { cn } from '@/lib/utils';
import {
  Activity,
  Play,
  Pause,
  AlertOctagon,
  Settings2,
  RefreshCw,
} from 'lucide-react';

type PolicyMode = 'shadow' | 'advisory' | 'enforcement';

export default function PowerLaw() {
  const [metrics, setMetrics] = useState<PowerLawMetrics[]>([]);
  const [constraints, setConstraints] = useState<ExecutionConstraints[]>([]);
  const [impacts, setImpacts] = useState<ImpactEvent[]>([]);
  const [globalMode, setGlobalMode] = useState<PolicyMode>('shadow');
  const { lastMessage } = useTitanWebSocket();

  // Handle incoming WebSocket messages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMessage = useCallback((msg: { type?: string; data?: any; timestamp?: number }) => {
    if (!msg?.type) return;

    if (msg.type === 'POWERLAW_METRICS') {
      const data = msg.data as PowerLawMetrics;
      setMetrics((prev) => {
        // Update or add metric for this symbol
        const existing = prev.findIndex((m) => m.symbol === data.symbol);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = data;
          return updated;
        }
        return [...prev, data];
      });
    } else if (msg.type === 'EXECUTION_CONSTRAINTS') {
      const data = msg.data as ExecutionConstraints;
      setConstraints((prev) => {
        const existing = prev.findIndex((c) => c.symbol === data.symbol);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = data;
          return updated;
        }
        return [...prev, data];
      });
    } else if (msg.type === 'POWERLAW_IMPACT') {
      const data = msg.data as Partial<ImpactEvent>;
      setImpacts((prev) => [
        {
          id: data.id || String(msg.timestamp),
          timestamp: data.timestamp || msg.timestamp || Date.now(),
          symbol: data.symbol || 'unknown',
          action: data.action || '',
          constraint_field: data.constraint_field || '',
          before_value: data.before_value || '',
          after_value: data.after_value || '',
          reason: data.reason || '',
        },
        ...prev,
      ].slice(0, 100));
    }
  }, []);

  useEffect(() => {
    if (lastMessage) {
      handleMessage(lastMessage);
    }
  }, [lastMessage, handleMessage]);

  // Mode button component
  const ModeButton = ({
    mode,
    label,
    icon: Icon,
    color,
  }: {
    mode: PolicyMode;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }) => (
    <button
      onClick={() => setGlobalMode(mode)}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-colors',
        globalMode === mode
          ? `${color} ring-2 ring-offset-2 ring-offset-background`
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            PowerLaw Control Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Tail-risk metrics, execution constraints, and impact monitoring
          </p>
        </div>
        <button
          onClick={() => {
            // Refresh - would send request to Brain BFF
            console.log('Refreshing PowerLaw data...');
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-xs text-muted-foreground hover:bg-muted/80"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Mode Controls */}
      <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
        <Settings2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Global Mode:
        </span>
        <div className="flex items-center gap-2">
          <ModeButton
            mode="shadow"
            label="Shadow"
            icon={Pause}
            color="bg-gray-500/10 text-gray-500 ring-gray-500"
          />
          <ModeButton
            mode="advisory"
            label="Advisory"
            icon={AlertOctagon}
            color="bg-yellow-500/10 text-yellow-500 ring-yellow-500"
          />
          <ModeButton
            mode="enforcement"
            label="Enforcement"
            icon={Play}
            color="bg-green-500/10 text-green-500 ring-green-500"
          />
        </div>
        <span className="ml-auto text-xxs text-muted-foreground">
          Mode controls require ARM state
        </span>
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Health & Constraints */}
        <div className="space-y-4">
          <GlobalHealthCard metrics={metrics} constraints={constraints} />
          <ConstraintsTable constraints={constraints} />
        </div>

        {/* Middle Column - Risk Drivers */}
        <div>
          <RiskDriversTable metrics={metrics} />
        </div>

        {/* Right Column - Impact Feed */}
        <div>
          <ImpactFeed impacts={impacts} />
        </div>
      </div>

      {/* Demo Data Notice */}
      {metrics.length === 0 && constraints.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Waiting for PowerLaw metrics stream...
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Metrics are published by the canonical-powerlaw-service to{' '}
            <code className="bg-muted px-1 rounded">
              titan.signal.powerlaw.metrics.v1.*
            </code>
          </p>
        </div>
      )}
    </div>
  );
}
