/**
 * Core type definitions for Titan Phase 2 - The Hunter
 */

// OHLCV Data Structure
export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Fractal Types
export interface Fractal {
  type: 'HIGH' | 'LOW';
  price: number;
  barIndex: number;
  timestamp: number;
  confirmed: boolean;
}

export interface BOS {
  direction: 'BULLISH' | 'BEARISH';
  price: number;
  barIndex: number;
  timestamp: number;
  fractalsBreached: Fractal[];
}

export interface MSS {
  direction: 'BULLISH' | 'BEARISH';
  price: number;
  barIndex: number;
  timestamp: number;
  significance: number; // 0-100
}

export interface DealingRange {
  high: number;
  low: number;
  midpoint: number;
  premiumThreshold: number;
  discountThreshold: number;
  range: number;
}

export type TrendState = 'BULL' | 'BEAR' | 'RANGE';

// Hologram Types
export interface TimeframeState {
  timeframe: '1D' | '4H' | '15m';
  trend: TrendState;
  dealingRange: DealingRange;
  currentPrice: number;
  location: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
  fractals: Fractal[];
  bos: BOS[];
  mss: MSS | null;
}

export interface HologramState {
  symbol: string;
  timestamp: number;
  daily: TimeframeState;
  h4: TimeframeState;
  m15: TimeframeState;
  alignmentScore: number; // 0-100
  status: HologramStatus;
  veto: VetoResult;
  rsScore: number;
}

export type HologramStatus = 'A+' | 'B' | 'CONFLICT' | 'NO_PLAY';

export interface VetoResult {
  vetoed: boolean;
  reason: string | null;
  direction: 'LONG' | 'SHORT' | null;
}

// Session Types
export type SessionType = 'ASIAN' | 'LONDON' | 'NY' | 'DEAD_ZONE';

export interface SessionState {
  type: SessionType;
  startTime: number;
  endTime: number;
  timeRemaining: number;
}

export interface AsianRange {
  high: number;
  low: number;
  timestamp: number;
}

export interface JudasSwing {
  type: 'SWEEP_HIGH' | 'SWEEP_LOW';
  sweptPrice: number;
  reversalPrice: number;
  direction: 'LONG' | 'SHORT';
  confidence: number; // 0-100
}

// POI Types
export interface FVG {
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  midpoint: number;
  barIndex: number;
  timestamp: number;
  mitigated: boolean;
  fillPercent: number; // 0-100
}

export interface OrderBlock {
  type: 'BULLISH' | 'BEARISH';
  high: number;
  low: number;
  barIndex: number;
  timestamp: number;
  mitigated: boolean;
  confidence: number; // 0-100
}

export interface LiquidityPool {
  type: 'HIGH' | 'LOW';
  price: number;
  strength: number; // 0-100
  barIndex: number;
  timestamp: number;
  swept: boolean;
}

export type POI = FVG | OrderBlock | LiquidityPool;

// CVD Types
export interface Trade {
  price: number;
  quantity: number;
  side: 'BUY' | 'SELL';
  timestamp: number;
}

export interface CVDTrade {
  symbol: string;
  price: number;
  qty: number;
  time: number;
  isBuyerMaker: boolean; // true = sell order hit buy limit, false = buy order hit sell limit
}

export interface Absorption {
  price: number;
  cvdValue: number;
  timestamp: number;
  confidence: number; // 0-100
}

export interface Distribution {
  price: number;
  cvdValue: number;
  timestamp: number;
  confidence: number; // 0-100
}

// Order Types
export interface OrderParams {
  phase: 'phase2';
  symbol: string;
  side: 'Buy' | 'Sell';
  type: 'MARKET' | 'LIMIT' | 'POST_ONLY';
  price?: number;
  qty: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface OrderResult {
  orderId: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  qty: number;
  price: number;
  status: OrderStatus;
  timestamp: number;
}

export type OrderStatus = 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';

// Signal Types
export interface SignalData {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  hologramStatus: HologramStatus;
  alignmentScore: number;
  rsScore: number;
  sessionType: SessionType;
  poiType: 'FVG' | 'ORDER_BLOCK' | 'LIQUIDITY_POOL';
  cvdConfirmation: boolean;
  confidence: number; // 0-100
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  leverage: number;
  timestamp: number;
}

export interface ExecutionData {
  signalId: string;
  orderId: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  qty: number;
  fillPrice: number;
  slippage: number;
  fees: number;
  timestamp: number;
}

// Configuration Types
export interface PhaseConfig {
  maxLeverage: number;
  maxDrawdown: number;
  maxPositionSize: number;
  riskPerTrade: number;
  alignmentWeights: {
    daily: number;
    h4: number;
    m15: number;
  };
  rsThreshold: number;
  correlationThreshold: number;
  maxConcurrentPositions: number;
  maxPortfolioHeat: number;
}

// Metrics Types
export interface Metrics {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

// Risk Management Types
export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  unrealizedPnL: number;
  realizedPnL: number;
  entryTime: number;
  status: 'OPEN' | 'CLOSED';
  rValue: number; // Current R value (profit/loss in R multiples)
  atr: number; // ATR at entry for trailing calculations
}

export interface PositionUpdate {
  id: string;
  currentPrice: number;
  unrealizedPnL: number;
  timestamp: number;
}

export interface TrailingStopConfig {
  enabled: boolean;
  distance: number; // ATR multiplier
  triggerR: number; // R value to start trailing
}

export interface PartialProfitConfig {
  enabled: boolean;
  rLevel: number; // R level to take partial profit
  percentage: number; // Percentage to close
}