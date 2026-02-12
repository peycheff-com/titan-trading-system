import { RiskState, PhaseStatus, BudgetState } from "@titan/shared";

export type SystemStatus = "healthy" | "degraded" | "critical" | "offline";
export type Severity = "info" | "warning" | "critical";
export type Phase = "scavenger" | "hunter" | "sentinel";

export interface TimelineEvent {
  id: string;
  type: "trade" | "alert" | "system" | "risk";
  severity: Severity;
  message: string;
  symbol: string | null;
  phase: Phase | null;
  timestamp: number;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function formatCurrency(amount: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export interface TreasuryState {
  balance: number;
  currency: string;
  pnl_24h: number;
}

export interface CircuitBreakerState {
  status: RiskState;
  triggered_at?: number;
  reset_at?: number;
}

export interface ManualOverride {
  active: boolean;
  operator_id?: string;
  reason?: string;
}

export interface OptimizationProposal {
    id: string;
    changes: Record<string, unknown>;
    impact_score: number;
}

export interface DashboardData {
  nav: number;
  allocation: Record<string, number>;
  phaseEquity: Record<string, number>;
  riskMetrics: {
    globalLeverage: number;
    netDelta: number;
    correlationScore: number;
    portfolioBeta: number;
  };
  treasury: TreasuryState;
  circuitBreaker: CircuitBreakerState;
  recentDecisions: BrainDecision[];
  lastUpdated: number;
  manualOverride?: ManualOverride;
  warningBannerActive?: boolean;
  aiState?: {
    cortisol: number;
    regime: string;
    lastOptimizationProposal?: {
      timestamp: number;
      proposal: OptimizationProposal;
    };
  };
}

// Brain Types (Mirrored from titan-brain service)

export interface AllocationVector {
  scavenger: number;
  hunter: number;
  sentinel: number;
  cash: number;
}

export interface RiskMetrics {
  currentLeverage: number;
  projectedLeverage: number;
  portfolioDelta: number;
  portfolioBeta: number;
  correlation: number;
  concentration: number;
  dailyDrawdown: number;
}

export interface RiskDecision {
  approved: boolean;
  reason: string;
  adjustedSize?: number;
  riskMetrics: RiskMetrics;
}

export interface IntentSignal {
  signalId: string;
  phaseId: string;
  symbol: string;
  side: "BUY" | "SELL" | "LONG" | "SHORT";
  requestedSize: number;
  limitPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  timeHorizon?: number;
  confidence?: number;
  volatility?: number;
  timestamp: number;
  latencyProfile?: {
    transit: number;
    processing: number;
    endToEnd: number;
  };
}

export interface BrainDecision {
  signalId: string;
  approved: boolean;
  authorizedSize: number;
  reason: string;
  allocation: AllocationVector;
  performance: {
    pnl: number;
    drawdown: number;
  };
  risk: RiskDecision;
  context?: {
    signal: IntentSignal;
    marketState: {
      price?: number;
      volatility?: number;
      regime: string;
    };
    riskState: RiskMetrics;
    governance: {
      defcon: string;
    };
  };
  timestamp: number;
}
