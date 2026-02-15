/**
 * titan-backtesting central types
 */

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
  timeframe: string;
}

export interface SimulationConfig {
  symbol: string;
  initialCapital: number;
  startDate: number;
  endDate: number;
}

export interface RegimeSnapshot {
  timestamp: number;
  symbol: string;
  trendState: -1 | 0 | 1; // Bear, Chop, Bull
  volState: 0 | 1 | 2; // Low, Med, High
  liquidityState: 0 | 1 | 2; // Low, Normal, High
}

export interface Trade {
  id: string;
  timestamp: number;
  symbol: string;
  side: 'long' | 'short' | 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage?: number;
  pnl: number;
  pnlPercent?: number;
  duration?: number;
  slippage?: number;
  fees?: number;
  exitReason?: string;
  size?: number; // unified with quantity
}

export interface BacktestResult {
  metrics: {
    totalReturn: number;
    maxDrawdown: number;
    sharpeRatio: number;
    winRate: number;
    tradesCount: number;
  };
  trades: Trade[];
  equityCurve: { timestamp: number; equity: number }[];
  logs: string[];
}

export interface Signal {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  type: 'MARKET' | 'LIMIT';
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  metadata?: Record<string, unknown>;
}

export interface Strategy {
  name: string;
  onCandle(candle: OHLCV): Promise<Signal | null>;
  onTick?(time: number, price: number): Promise<Signal | null>;
}

export interface ValidationReport {
  passed: boolean;
  rejectionReason?: string;
  metrics: BacktestResult;
  stressTestResults?: {
    scenario: string;
    passed: boolean;
    drawdown: number;
  }[];
}
