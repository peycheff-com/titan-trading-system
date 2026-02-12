import { useState } from 'react';
import { KpiTile } from '@/components/titan/KpiTile';
import { StatusPill } from '@/components/titan/StatusPill';
import { CorrelationHeatmap } from '@/components/titan/CorrelationHeatmap';
import { formatCurrency, formatPercent } from '@/types';
import { cn } from '@/lib/utils';
import { Brain, Shield, AlertTriangle, Activity } from 'lucide-react';

const phaseColors: Record<string, string> = {
  scavenger: 'bg-phase-scavenger',
  hunter: 'bg-phase-hunter',
  sentinel: 'bg-phase-sentinel',
};

interface CircuitBreakerConfigItem {
  color: string;
  bg: string;
  label: string;
}

const circuitBreakerConfig: Record<string, CircuitBreakerConfigItem> = {
  OK: { color: 'text-status-healthy', bg: 'bg-status-healthy/10', label: 'Normal' },
  Armed: { color: 'text-warning', bg: 'bg-warning/10', label: 'Armed' },
  Tripped: { color: 'text-status-critical', bg: 'bg-status-critical/10', label: 'Tripped' },
  Cooldown: { color: 'text-primary', bg: 'bg-primary/10', label: 'Cooldown' },
};

interface PhaseAllocation {
  phase: string;
  current: number;
  target: number;
  allocated: number;
}

export default function BrainPage() {
  // Default empty state until backend integration
  const brainAllocation = {
    phases: [] as PhaseAllocation[],
    riskMetrics: { portfolioBeta: 0, correlationBTC: 0, valueAtRisk: 0, expectedShortfall: 0 },
    circuitBreaker: { state: 'OK', currentDrawdown: 0, drawdownThreshold: 5, lastTripped: null as string | null },
  };
  const correlationMatrix = { assets: [], data: [] };

  const { phases, riskMetrics, circuitBreaker } = brainAllocation;
  const cbConfig = circuitBreakerConfig[circuitBreaker.state || 'OK'];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Brain</h1>
            <p className="text-sm text-muted-foreground">
              Orchestration, allocation & risk policy management
            </p>
          </div>
        </div>
        <StatusPill status="healthy" label="Operational" size="md" />
      </div>

      {/* Allocation View */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-4">Capital Allocation</h2>

        {/* Allocation Bar */}
        <div className="mb-4">
          <div className="flex h-8 overflow-hidden rounded-lg">
            {phases.map((phase) => (
              <div
                key={phase.phase}
                className={cn('flex items-center justify-center', phaseColors[phase.phase])}
                style={{ width: `${phase.current}%` }}
              >
                <span className="text-xs font-semibold text-white capitalize">{phase.phase}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Allocation Details */}
        <div className="grid gap-4 sm:grid-cols-3">
          {phases.map((phase) => (
            <div key={phase.phase} className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize text-foreground">
                  {phase.phase}
                </span>
                <span className={cn('h-2 w-2 rounded-full', phaseColors[phase.phase])} />
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Allocated</span>
                  <span className="font-mono text-foreground">
                    {formatCurrency(phase.allocated)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Weight</span>
                  <span className="font-mono text-foreground">
                    {phase.current}% / {phase.target}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Risk Guardian */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Risk Guardian</h2>
          </div>

          {/* Risk Metrics KPIs */}
          <div className="grid gap-3 sm:grid-cols-2">
            <KpiTile
              label="Portfolio Beta (vs BTC)"
              value={riskMetrics.portfolioBeta.toFixed(2)}
              variant={riskMetrics.portfolioBeta > 0.5 ? 'warning' : 'default'}
            />
            <KpiTile
              label="BTC Correlation"
              value={riskMetrics.correlationBTC.toFixed(2)}
              variant={riskMetrics.correlationBTC > 0.8 ? 'warning' : 'default'}
            />
            <KpiTile label="Value at Risk (95%)" value={formatCurrency(riskMetrics.valueAtRisk)} />
            <KpiTile
              label="Expected Shortfall"
              value={formatCurrency(riskMetrics.expectedShortfall)}
            />
          </div>

          {/* Drawdown Tracker */}
          <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Drawdown Limit</span>
              <span className="font-mono text-xs text-foreground">
                {circuitBreaker.currentDrawdown.toFixed(1)}% / {circuitBreaker.drawdownThreshold}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  circuitBreaker.currentDrawdown / circuitBreaker.drawdownThreshold > 0.8
                    ? 'bg-status-critical'
                    : circuitBreaker.currentDrawdown / circuitBreaker.drawdownThreshold > 0.5
                      ? 'bg-warning'
                      : 'bg-status-healthy',
                )}
                style={{
                  width: `${(circuitBreaker.currentDrawdown / circuitBreaker.drawdownThreshold) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Correlation Heatmap */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Correlation Matrix</h2>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <CorrelationHeatmap assets={correlationMatrix.assets} data={correlationMatrix.data} />
          </div>
        </div>
      </div>

      {/* Circuit Breaker */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-semibold text-foreground">Circuit Breaker</h2>
          </div>
          <div className={cn('flex items-center gap-2 rounded-full px-3 py-1', cbConfig.bg)}>
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                circuitBreaker.state === 'OK' && 'bg-status-healthy pulse-healthy',
                circuitBreaker.state === 'Armed' && 'bg-warning pulse-warning',
                circuitBreaker.state === 'Tripped' && 'bg-status-critical pulse-critical',
                circuitBreaker.state === 'Cooldown' && 'bg-primary',
              )}
            />
            <span className={cn('text-xs font-medium', cbConfig.color)}>{cbConfig.label}</span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
            <span className="text-xs text-muted-foreground">State</span>
            <span className={cn('text-xs font-medium', cbConfig.color)}>
              {circuitBreaker.state}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
            <span className="text-xs text-muted-foreground">Threshold</span>
            <span className="font-mono text-xs text-foreground">
              {circuitBreaker.drawdownThreshold}%
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
            <span className="text-xs text-muted-foreground">Last Tripped</span>
            <span className="font-mono text-xs text-foreground">
              {circuitBreaker.lastTripped
                ? new Date(circuitBreaker.lastTripped).toLocaleDateString()
                : 'Never'}
            </span>
          </div>
        </div>

        <p className="mt-4 text-xxs text-muted-foreground">
          Circuit breaker status is display-only. Manual override requires backend integration.
        </p>
      </div>
    </div>
  );
}
