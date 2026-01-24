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

export interface DashboardData {
  nav: number;
  allocation: any; // Using any for brevity or specific types if available
  phaseEquity: any;
  riskMetrics: {
    globalLeverage: number;
    netDelta: number;
    correlationScore: number;
    portfolioBeta: number;
  };
  treasury: any;
  circuitBreaker: any;
  recentDecisions: any[];
  lastUpdated: number;
  manualOverride?: any;
  warningBannerActive?: boolean;
  aiState?: {
    cortisol: number;
    regime: string;
    lastOptimizationProposal?: {
      timestamp: number;
      proposal: any;
    };
  };
}
