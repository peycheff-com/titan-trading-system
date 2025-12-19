/**
 * Titan AI Quant - Type Definitions
 */

export interface Trade {
  id: string;
  timestamp: number;
  symbol: string;
  trapType: 'oi_wipeout' | 'funding_spike' | 'liquidity_sweep' | 'volatility_spike';
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: number;
  pnl: number;
  pnlPercent: number;
  duration: number;
  slippage: number;
  fees: number;
  exitReason: 'take_profit' | 'stop_loss' | 'trailing_stop' | 'timeout' | 'manual';
}

export interface RegimeSnapshot {
  timestamp: number;
  symbol: string;
  trendState: -1 | 0 | 1;
  volState: 0 | 1 | 2;
  liquidityState: 0 | 1 | 2;
  regimeState: -1 | 0 | 1;
  hurstExponent?: number;
  fdi?: number;
  efficiencyRatio?: number;
  vpinApprox?: number;
  absorptionState?: boolean;
  shannonEntropy?: number;
}

export interface Insight {
  id?: number;
  timestamp?: number;
  topic: string;
  text: string;
  confidence: number;
  affectedSymbols?: string[];
  affectedTraps?: string[];
  regimeContext?: string;
  metadata?: {
    sampleSize: number;
    timeRange: { start: number; end: number };
    correlationStrength?: number;
  };
}

export interface OptimizationProposal {
  id?: number;
  createdAt?: number;
  insightId?: number;
  targetKey: string;
  currentValue: unknown;
  suggestedValue: unknown;
  reasoning: string;
  expectedImpact: {
    pnlImprovement: number;
    riskChange: number;
    confidenceScore: number;
  };
  validationReport?: ValidationReport;
  status?: 'pending' | 'approved' | 'rejected' | 'applied';
}

export interface ValidationReport {
  passed: boolean;
  timestamp: number;
  backtestPeriod: {
    start: number;
    end: number;
  };
  baselineMetrics: BacktestResult;
  proposedMetrics: BacktestResult;
  deltas: {
    pnlDelta: number;
    pnlDeltaPercent: number;
    drawdownDelta: number;
    drawdownDeltaPercent: number;
    winRateDelta: number;
  };
  confidenceScore: number;
  rejectionReason?: string;
  recommendation: 'approve' | 'reject' | 'review';
}

export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  avgSlippage: number;
  avgDuration: number;
  profitFactor: number;
}

export interface MorningBriefing {
  date: string;
  summary: string;
  topInsights: Insight[];
  pendingProposals: Array<{
    proposal: OptimizationProposal;
    validation: ValidationReport;
  }>;
  performanceSummary: {
    totalTrades: number;
    winRate: number;
    pnl: number;
  };
}

export interface TrapConfig {
  enabled: boolean;
  stop_loss: number;
  take_profit: number;
  trailing_stop?: number;
  risk_per_trade: number;
  max_leverage: number;
  min_confidence: number;
  cooldown_period: number;
}

export interface RiskConfig {
  max_daily_loss: number;
  max_position_size: number;
  max_open_positions: number;
  emergency_flatten_threshold: number;
}

export interface ExecutionConfig {
  latency_penalty: number;
  slippage_model: 'conservative' | 'realistic' | 'optimistic';
  limit_chaser_enabled: boolean;
  max_fill_time: number;
}

export interface Config {
  traps: {
    [trapName: string]: TrapConfig;
  };
  risk: RiskConfig;
  execution: ExecutionConfig;
}

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MetricData {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  timestamp?: number;
}
