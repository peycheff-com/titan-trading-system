/**
 * PowerLaw Control Center Components
 * Displays tail-risk metrics, execution constraints, and impact events
 */
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useTitanWebSocket } from '@/context/WebSocketContext';
import {
  Activity,
  AlertTriangle,
  TrendingDown,
  Shield,
  Gauge,
  Zap,
  Target,
  Clock,
} from 'lucide-react';

// Types for PowerLaw data
interface PowerLawMetrics {
  symbol: string;
  venue: string;
  tail_alpha: number;
  tail_alpha_se: number;
  expected_shortfall_95: number;
  volatility_state: 'normal' | 'elevated' | 'crisis';
  sample_size: number;
  health_status: 'ok' | 'stale' | 'low_sample' | 'fit_failed';
  issued_ts: number;
}

interface ExecutionConstraints {
  symbol: string;
  risk_mode: 'normal' | 'caution' | 'defensive' | 'halt';
  mode: 'shadow' | 'advisory' | 'enforcement';
  max_order_notional: number;
  max_leverage: number;
  reduce_only: boolean;
  issued_ts: number;
}

interface ImpactEvent {
  id: string;
  timestamp: number;
  symbol: string;
  action: string;
  constraint_field: string;
  before_value: string | number;
  after_value: string | number;
  reason: string;
}

// Color mapping for risk levels
const getRiskColor = (mode: string) => {
  switch (mode) {
    case 'halt':
      return 'text-red-500 bg-red-500/10';
    case 'defensive':
      return 'text-orange-500 bg-orange-500/10';
    case 'caution':
      return 'text-yellow-500 bg-yellow-500/10';
    default:
      return 'text-green-500 bg-green-500/10';
  }
};

const getHealthColor = (status: string) => {
  switch (status) {
    case 'ok':
      return 'text-green-500';
    case 'stale':
      return 'text-orange-500';
    case 'low_sample':
      return 'text-yellow-500';
    case 'fit_failed':
      return 'text-red-500';
    default:
      return 'text-muted-foreground';
  }
};

const getVolatilityColor = (state: string) => {
  switch (state) {
    case 'crisis':
      return 'text-red-500 bg-red-500/10';
    case 'elevated':
      return 'text-yellow-500 bg-yellow-500/10';
    default:
      return 'text-green-500 bg-green-500/10';
  }
};

/**
 * Global Health Card - Shows overall tail risk system health
 */
export function GlobalHealthCard({
  metrics,
  constraints,
}: {
  metrics: PowerLawMetrics[];
  constraints: ExecutionConstraints[];
}) {
  const healthyCount = metrics.filter((m) => m.health_status === 'ok').length;
  const totalCount = metrics.length;
  const enforcingCount = constraints.filter(
    (c) => c.mode === 'enforcement'
  ).length;
  const defensiveCount = constraints.filter(
    (c) => c.risk_mode === 'defensive' || c.risk_mode === 'halt'
  ).length;

  const overallHealth =
    healthyCount === totalCount ? 'healthy' : healthyCount > 0 ? 'degraded' : 'unknown';

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">PowerLaw Health</h2>
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 text-xxs font-medium',
            overallHealth === 'healthy'
              ? 'bg-green-500/10 text-green-500'
              : overallHealth === 'degraded'
              ? 'bg-yellow-500/10 text-yellow-500'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {overallHealth.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Metrics Active</p>
            <p className="text-lg font-semibold text-foreground">
              {healthyCount}/{totalCount}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Enforcing</p>
            <p className="text-lg font-semibold text-foreground">{enforcingCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Defensive/Halt</p>
            <p
              className={cn(
                'text-lg font-semibold',
                defensiveCount > 0 ? 'text-orange-500' : 'text-foreground'
              )}
            >
              {defensiveCount}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Avg ES95</p>
            <p className="text-lg font-semibold text-foreground">
              {metrics.length > 0
                ? (
                    metrics.reduce((sum, m) => sum + m.expected_shortfall_95, 0) /
                    metrics.length
                  ).toFixed(2)
                : '—'}
              %
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Risk Drivers Table - Shows top markets by tail risk
 */
export function RiskDriversTable({ metrics }: { metrics: PowerLawMetrics[] }) {
  // Sort by expected shortfall (highest risk first)
  const sortedMetrics = [...metrics].sort(
    (a, b) => b.expected_shortfall_95 - a.expected_shortfall_95
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Top Risk Drivers</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-2 font-medium">Symbol</th>
              <th className="text-right py-2 font-medium">α (tail)</th>
              <th className="text-right py-2 font-medium">ES95</th>
              <th className="text-center py-2 font-medium">Vol State</th>
              <th className="text-center py-2 font-medium">Health</th>
            </tr>
          </thead>
          <tbody>
            {sortedMetrics.slice(0, 10).map((m) => (
              <tr key={m.symbol} className="border-b border-border/50">
                <td className="py-2 font-medium text-foreground">{m.symbol}</td>
                <td className="py-2 text-right text-foreground">
                  {m.tail_alpha.toFixed(2)}
                  <span className="text-muted-foreground text-xxs ml-1">
                    ±{m.tail_alpha_se.toFixed(2)}
                  </span>
                </td>
                <td className="py-2 text-right text-foreground">
                  {m.expected_shortfall_95.toFixed(2)}%
                </td>
                <td className="py-2 text-center">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xxs font-medium',
                      getVolatilityColor(m.volatility_state)
                    )}
                  >
                    {m.volatility_state}
                  </span>
                </td>
                <td className="py-2 text-center">
                  <span className={cn('text-xxs', getHealthColor(m.health_status))}>
                    ●
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedMetrics.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Waiting for metrics...
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Impact Feed - Shows recent constraint changes and their effects
 */
export function ImpactFeed({ impacts }: { impacts: ImpactEvent[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Decision Impact</h2>
        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xxs font-medium text-primary">
          {impacts.length} events
        </span>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {impacts.slice(0, 20).map((impact) => (
          <div
            key={impact.id}
            className="flex items-start gap-2 p-2 rounded bg-muted/30"
          >
            <Clock className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">
                  {impact.symbol}
                </span>
                <span className="text-xxs text-muted-foreground">
                  {new Date(impact.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-xxs text-muted-foreground mt-0.5 truncate">
                {impact.constraint_field}: {String(impact.before_value)} →{' '}
                {String(impact.after_value)}
              </p>
              <p className="text-xxs text-muted-foreground/70">{impact.reason}</p>
            </div>
          </div>
        ))}
        {impacts.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No recent impacts
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Constraints Table - Shows active execution constraints
 */
export function ConstraintsTable({
  constraints,
}: {
  constraints: ExecutionConstraints[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          Active Constraints
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-2 font-medium">Symbol</th>
              <th className="text-center py-2 font-medium">Risk Mode</th>
              <th className="text-center py-2 font-medium">Mode</th>
              <th className="text-right py-2 font-medium">Max Notional</th>
              <th className="text-right py-2 font-medium">Max Lev</th>
              <th className="text-center py-2 font-medium">Reduce</th>
            </tr>
          </thead>
          <tbody>
            {constraints.map((c) => (
              <tr key={c.symbol} className="border-b border-border/50">
                <td className="py-2 font-medium text-foreground">{c.symbol}</td>
                <td className="py-2 text-center">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xxs font-medium uppercase',
                      getRiskColor(c.risk_mode)
                    )}
                  >
                    {c.risk_mode}
                  </span>
                </td>
                <td className="py-2 text-center">
                  <span
                    className={cn(
                      'text-xxs',
                      c.mode === 'enforcement'
                        ? 'text-primary font-medium'
                        : 'text-muted-foreground'
                    )}
                  >
                    {c.mode}
                  </span>
                </td>
                <td className="py-2 text-right text-foreground">
                  ${c.max_order_notional.toLocaleString()}
                </td>
                <td className="py-2 text-right text-foreground">{c.max_leverage}x</td>
                <td className="py-2 text-center">
                  {c.reduce_only ? (
                    <span className="text-orange-500">●</span>
                  ) : (
                    <span className="text-muted-foreground">○</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {constraints.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No active constraints
          </p>
        )}
      </div>
    </div>
  );
}

export type { PowerLawMetrics, ExecutionConstraints, ImpactEvent };
