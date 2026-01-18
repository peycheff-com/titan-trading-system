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
  type: "HIGH" | "LOW";
  price: number;
  barIndex: number;
  timestamp: number;
  confirmed: boolean;
}

export interface BOS {
  direction: "BULLISH" | "BEARISH";
  price: number;
  barIndex: number;
  timestamp: number;
  fractalsBreached: Fractal[];
}

export interface MSS {
  direction: "BULLISH" | "BEARISH";
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

export type TrendState = "BULL" | "BEAR" | "RANGE";

// Hologram Types
export interface TimeframeState {
  timeframe: "1D" | "4H" | "15m";
  trend: TrendState;
  dealingRange: DealingRange;
  currentPrice: number;
  location: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM";
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
  flowScore?: number; // Added for Phase 4
  flowAnalysis?: FlowClassificationResult; // Added for Phase 4
  realizedExpectancy?: number; // 2026: Feedback loop
  direction: "LONG" | "SHORT" | null; // Explicit direction derived from state
}

export type HologramStatus = "A+" | "B" | "CONFLICT" | "NO_PLAY";

export interface VetoResult {
  vetoed: boolean;
  reason: string | null;
  direction: "LONG" | "SHORT" | null;
}

// Session Types
export type SessionType = "ASIAN" | "LONDON" | "NY" | "DEAD_ZONE";

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
  type: "SWEEP_HIGH" | "SWEEP_LOW";
  sweptPrice: number;
  reversalPrice: number;
  direction: "LONG" | "SHORT";
  confidence: number; // 0-100
}

// POI Types
export interface FVG {
  type: "BULLISH" | "BEARISH";
  top: number;
  bottom: number;
  midpoint: number;
  barIndex: number;
  timestamp: number;
  mitigated: boolean;
  fillPercent: number; // 0-100
  invalidationCondition?: string; // e.g. "Price > 100"
}

export interface OrderBlock {
  type: "BULLISH" | "BEARISH";
  high: number;
  low: number;
  barIndex: number;
  timestamp: number;
  mitigated: boolean;
  confidence: number; // 0-100
  invalidationCondition?: string;
}

export interface LiquidityPool {
  type: "HIGH" | "LOW";
  price: number;
  strength: number; // 0-100
  barIndex: number;
  timestamp: number;
  swept: boolean;
  invalidationCondition?: string;
}

export type POI = FVG | OrderBlock | LiquidityPool;

// CVD Types
export interface Trade {
  price: number;
  quantity: number;
  side: "BUY" | "SELL";
  timestamp: number;
  isBuyerMaker: boolean; // true = sell order hit buy limit, false = buy order hit sell limit
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
  phase: "phase2";
  symbol: string;
  side: "Buy" | "Sell";
  type: "MARKET" | "LIMIT" | "POST_ONLY";
  price?: number;
  qty: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface OrderResult {
  orderId: string;
  symbol: string;
  side: "Buy" | "Sell";
  qty: number;
  price: number;
  status: OrderStatus;
  timestamp: number;
}

export type OrderStatus =
  | "NEW"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED";

// Signal Types
export interface SignalData {
  symbol: string;
  direction: "LONG" | "SHORT";
  hologramStatus: HologramStatus;
  alignmentScore: number;
  rsScore: number;
  sessionType: SessionType;
  poiType: "FVG" | "ORDER_BLOCK" | "LIQUIDITY_POOL";
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
  side: "Buy" | "Sell";
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
  side: "LONG" | "SHORT";
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  unrealizedPnL: number;
  realizedPnL: number;
  entryTime: number;
  status: "OPEN" | "CLOSED";
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
// Event Types (re-exported from events module)
// export type {
//   CVDAbsorptionEvent,
//   CVDDistributionEvent,
//   ErrorEvent,
//   EventMap,
//   ExecutionCompleteEvent,
//   HologramUpdatedEvent,
//   JudasSwingEvent,
//   POIDetectedEvent,
//   RiskWarningEvent,
//   ScanCompleteEvent,
//   SessionChangeEvent,
//   SignalGeneratedEvent,
// } from "../events";

// 2026 Enhancement Types (re-exported from enhanced-2026 module)
// 2026 Enhancement Types (merged from enhanced-2026 module)
/**
 * Enhanced Type Definitions for Titan Phase 2 - 2026 Modernization
 *
 * This module defines all TypeScript interfaces for the four enhancement layers:
 * 1. Oracle - Prediction Market Integration
 * 2. Advanced Flow Validator - Footprint & Sweep Detection
 * 3. Bot Trap Pattern Recognition
 * 4. Global Liquidity Aggregator
 *
 * Requirements: 16.1-16.7 (Configuration Management for Enhanced Features)
 */

// ============================================================================
// ORACLE - PREDICTION MARKET INTEGRATION (Layer 1)
// ============================================================================

/**
 * Event categories for prediction market events
 */
export enum EventCategory {
  CRYPTO_PRICE = "crypto_price",
  FED_POLICY = "fed_policy",
  REGULATORY = "regulatory",
  MACRO_ECONOMIC = "macro_economic",
  GEOPOLITICAL = "geopolitical",
}

/**
 * Impact level for prediction market events
 */
export enum ImpactLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  EXTREME = "extreme",
}

/**
 * Prediction market event data structure
 * Requirement 1.1: Connect to Polymarket API and fetch active prediction markets
 */
export interface PredictionMarketEvent {
  id: string;
  title: string;
  description: string;
  probability: number; // 0-100
  volume: number;
  liquidity: number;
  category: EventCategory;
  impact: ImpactLevel;
  resolution: Date;
  lastUpdate: Date;
  source: "polymarket" | "augur" | "gnosis";
}

/**
 * Oracle sentiment score result
 * Requirement 1.2: Compute weighted sentiment score between -100 and +100
 */
export interface OracleScore {
  sentiment: number; // -100 to +100
  confidence: number; // 0-100
  events: PredictionMarketEvent[];
  veto: boolean;
  vetoReason: string | null;
  convictionMultiplier: number; // 0.5-2.0
  timestamp: Date;
}

/**
 * Event Alert definitions
 * Requirement 11.1: Event Monitoring and Alerting
 */
export interface EventAlert {
  type:
    | "probability_change"
    | "threshold_crossing"
    | "new_event"
    | "resolution";
  severity: "info" | "warning" | "critical";
  event: PredictionMarketEvent;
  details: string;
  timestamp: Date;
  previousProbability?: number;
  newProbability?: number;
}

/**
 * Monitoring specific configuration
 */
export interface MonitoringConfig {
  probabilityChangeThreshold: number; // Percentage (e.g., 10 for 10%)
  monitoringInterval: number; // Milliseconds
  criticalThresholds: number[]; // e.g., [20, 50, 80]
}

// ============================================================================
// ADVANCED FLOW VALIDATOR - FOOTPRINT & SWEEP DETECTION (Layer 2)
// ============================================================================

/**
 * Footprint data for intra-candle analysis
 * Requirement 2.1: Implement intra-candle footprinting
 */
export interface FootprintData {
  priceLevel: number;
  bidVolume: number;
  askVolume: number;
  trades: number;
  aggressiveVolume: number;
  passiveVolume: number;
  delta: number; // bidVolume - askVolume
}

/**
 * Sweep pattern detection result
 * Requirement 2.2: Identify Sweep Patterns where single aggressive order clears 5+ levels
 */
export interface SweepPattern {
  startPrice: number;
  endPrice: number;
  levelsCleared: number;
  volume: number;
  timestamp: Date;
  direction: "up" | "down";
  urgency: "low" | "medium" | "high";
}

/**
 * Iceberg order analysis result
 * Requirement 2.3: Measure Iceberg Density by tracking liquidity refill
 */
export interface IcebergAnalysis {
  priceLevel: number;
  initialLiquidity: number;
  refillRate: number; // volume/second
  refillCount: number;
  density: number; // 0-100
  isIceberg: boolean;
}

/**
 * Flow validation result
 * Requirement 2.6: Distinguish between Passive Absorption and Aggressive Pushing
 */
export interface FlowValidation {
  isValid: boolean;
  confidence: number; // 0-100
  flowType: "passive_absorption" | "aggressive_pushing" | "neutral";
  sweepCount: number;
  icebergDensity: number;
  institutionalProbability: number;
  timestamp: Date;
}

/**
 * Trade footprint for detailed analysis
 */
export interface TradeFootprint {
  timestamp: Date;
  price: number;
  volume: number;
  side: "buy" | "sell";
  aggressor: "buyer" | "seller";
  orderType: "market" | "limit";
  exchange: string;
}

// ============================================================================
// BOT TRAP PATTERN RECOGNITION (Layer 3)
// ============================================================================

/**
 * Pattern precision analysis
 * Requirement 3.1: Flag patterns with exact tick precision as SUSPECT_TRAP
 */
export interface PatternPrecision {
  type: "equal_highs" | "equal_lows" | "fvg" | "order_block" | "liquidity_pool";
  precision: number; // 0-100 (100 = exact tick precision)
  suspicionLevel: "low" | "medium" | "high" | "extreme";
  characteristics: string[];
}

/**
 * Bot trap analysis result
 * Requirement 3.4: Require Passive Absorption signature before entry on SUSPECT_TRAP
 */
export interface BotTrapAnalysis {
  isSuspect: boolean;
  suspicionScore: number; // 0-100
  patterns: PatternPrecision[];
  recommendations: TrapRecommendation[];
  timestamp: Date;
}

/**
 * Trap recommendation for risk adjustment
 * Requirement 3.5: Reduce position size by 50% and tighten stop loss to 1%
 */
export interface TrapRecommendation {
  action:
    | "avoid"
    | "reduce_size"
    | "require_confirmation"
    | "proceed_cautiously";
  reasoning: string;
  adjustments: {
    positionSizeMultiplier: number;
    stopLossAdjustment: number;
    confirmationThreshold: number;
  };
}

/**
 * Trap indicators for pattern analysis
 */
export interface TrapIndicators {
  exactTickPrecision: boolean;
  perfectTiming: boolean;
  unusualVolume: boolean;
  textbookPattern: boolean;
  suspiciousFrequency: boolean;
}

/**
 * Pattern characteristics for trap detection
 */
export interface PatternCharacteristics {
  precision: number; // 0-100
  timing: number; // 0-100 (100 = perfect timing)
  volume: number; // relative volume during pattern formation
  complexity: number; // pattern complexity score
  frequency: number; // how often this pattern appears
}

// ============================================================================
// GLOBAL LIQUIDITY AGGREGATOR (Layer 4)
// ============================================================================

/**
 * Exchange connection status
 */
export enum ConnectionStatus {
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  RECONNECTING = "reconnecting",
  DELAYED = "delayed",
  ERROR = "error",
}

/**
 * Exchange flow data
 * Requirement 4.1: Establish WebSocket connections to Binance, Coinbase, and Kraken
 */
export interface ExchangeFlow {
  exchange: "binance" | "coinbase" | "kraken";
  cvd: number;
  volume: number;
  trades: number;
  weight: number; // 0-1 based on volume
  timestamp: Date;
  status: ConnectionStatus;
}

/**
 * Manipulation analysis result
 * Requirement 4.3: Flag as FAKEOUT if Binance sweeps level but others hold steady
 */
export interface ManipulationAnalysis {
  detected: boolean;
  suspectExchange: string | null;
  divergenceScore: number; // 0-100
  pattern: "single_exchange_outlier" | "coordinated_manipulation" | "none";
}

/**
 * Monitoring and Alerting Types
 */
export interface EventAlert {
  type:
    | "probability_change"
    | "threshold_crossing"
    | "new_event"
    | "resolution";
  severity: "info" | "warning" | "critical";
  event: PredictionMarketEvent;
  details: string;
  timestamp: Date;
  previousProbability?: number;
  newProbability?: number;
}

export interface MonitoringConfig {
  probabilityChangeThreshold: number;
  anomalySensitivity: number;
}

export interface CompositeEventScore {
  score: number; // 0-100
  riskLevel: "low" | "medium" | "high" | "critical";
  contributingEvents: string[];
  timestamp: Date;
}

export interface PredictionAnomaly {
  eventId: string;
  type: "flash_volatility" | "stale_data" | "irregular_volume";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  timestamp: Date;
}

/**
 * Global CVD aggregation result
 * Requirement 4.2: Aggregate buy/sell volume from all three exchanges
 */
export interface GlobalCVDData {
  aggregatedCVD: number;
  exchangeFlows: ExchangeFlow[];
  consensus: "bullish" | "bearish" | "neutral" | "conflicted";
  confidence: number; // 0-100
  manipulation: ManipulationAnalysis;
  timestamp: Date;
}

/**
 * Exchange metrics for weighting
 */
export interface ExchangeMetrics {
  exchange: string;
  volume24h: number;
  marketShare: number;
  latency: number;
  reliability: number;
  lastUpdate: Date;
  status: ConnectionStatus;
}

// ============================================================================
// ENHANCED HOLOGRAPHIC STATE
// ============================================================================

/**
 * Enhanced Holographic State with 2026 enhancements
 * Requirement 5.1: Enhanced scoring formula with Oracle, Flow, BotTrap, and Global CVD
 */
export interface EnhancedHolographicState {
  // Classic Phase 2 components
  classicState: HologramState | null;
  symbol: string;
  dailyBias: "BULL" | "BEAR" | "RANGE";
  fourHourLocation: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM";
  fifteenMinTrigger: "BULLISH" | "BEARISH" | "NEUTRAL";

  // 2026 enhancements
  oracleScore: OracleScore | null;
  flowValidation: FlowValidation | null;
  botTrapAnalysis: BotTrapAnalysis | null;
  globalCVD: GlobalCVDData | null;

  // Enhanced scoring
  classicScore: number; // 0-100 (original Phase 2 score)
  enhancedScore: number; // 0-100 (with 2026 enhancements)
  convictionLevel: "low" | "medium" | "high" | "extreme";
  alignment: "A+" | "A" | "B" | "C" | "VETO";
  rsScore: number;

  // Metadata
  timestamp: Date;
  enhancementsActive: boolean;
  regime: string; // 2026: Power Law Regime
  alpha: number; // 2026: Power Law Alpha
}

/**
 * Conviction-based position sizing
 * Requirement 7.1-7.7: Position sizing with conviction multipliers
 */
export interface ConvictionSizing {
  baseSize: number;
  oracleMultiplier: number;
  flowMultiplier: number;
  trapReduction: number;
  globalCVDMultiplier: number;
  eventRiskMultiplier: number;
  finalSize: number;
  cappedAt: number; // Maximum multiplier cap (2.0x)
  reasoning: string[];
}

// ============================================================================
// EMERGENCY PROTOCOLS
// ============================================================================

/**
 * Emergency types for enhanced system
 * Requirement 14.1-14.7: Emergency protocols for enhanced system
 */
export enum EmergencyType {
  PREDICTION_EMERGENCY = "prediction_emergency",
  LIQUIDITY_EMERGENCY = "liquidity_emergency",
  FLOW_EMERGENCY = "flow_emergency",
  TRAP_SATURATION = "trap_saturation",
  SYSTEM_DEGRADATION = "system_degradation",
}

/**
 * Emergency protocol state
 */
export interface EmergencyState {
  active: boolean;
  type: EmergencyType | null;
  triggeredAt: Date | null;
  reason: string | null;
  actions: string[];
}

/**
 * Degradation level for graceful degradation
 * Requirement 14.6: Fall back to classic Phase 2 logic
 */
export interface DegradationLevel {
  level: "none" | "partial" | "significant" | "emergency";
  affectedComponents: string[];
  fallbackStrategy: string;
  performanceImpact: number; // 0-100%
}

// ============================================================================
// ENHANCED ERROR TYPES
// ============================================================================

/**
 * Enhanced error types for 2026 system
 */
export enum EnhancedErrorType {
  // Oracle Errors
  ORACLE_CONNECTION_FAILED = "oracle_connection_failed",
  PREDICTION_DATA_STALE = "prediction_data_stale",
  ORACLE_API_RATE_LIMIT = "oracle_api_rate_limit",

  // Flow Validator Errors
  FOOTPRINT_ANALYSIS_FAILED = "footprint_analysis_failed",
  SWEEP_DETECTION_ERROR = "sweep_detection_error",
  ICEBERG_ANALYSIS_TIMEOUT = "iceberg_analysis_timeout",

  // Bot Trap Errors
  PATTERN_ANALYSIS_FAILED = "pattern_analysis_failed",
  LEARNING_MODEL_ERROR = "learning_model_error",
  TRAP_DETECTION_TIMEOUT = "trap_detection_timeout",

  // Global Aggregator Errors
  EXCHANGE_CONNECTION_LOST = "exchange_connection_lost",
  CVD_AGGREGATION_FAILED = "cvd_aggregation_failed",
  MANIPULATION_DETECTION_ERROR = "manipulation_detection_error",

  // System Integration Errors
  ENHANCEMENT_LAYER_CONFLICT = "enhancement_layer_conflict",
  FALLBACK_MODE_ACTIVATED = "fallback_mode_activated",
  EMERGENCY_PROTOCOL_TRIGGERED = "emergency_protocol_triggered",
}

// ============================================================================
// TECHNICAL SIGNAL TYPES
// ============================================================================

/**
 * Technical signal for Oracle integration
 */
export interface TechnicalSignal {
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence: number; // 0-100
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  timestamp: Date;
  source: "hologram" | "poi" | "cvd" | "session";
}

export type SignalDirection = "bullish" | "bearish" | "neutral";

export interface ExchangeVote {
  exchange: "binance" | "coinbase" | "kraken";
  direction: SignalDirection;
  cvd: number;
  volume: number;
  weight: number;
  confidence: number;
}

export interface ConsensusData {
  isValid: boolean;
  hasConsensus: boolean;
  consensusDirection: SignalDirection;
  confidence: number; // 0-100
  votes: ExchangeVote[];
  agreementRatio: number; // 0-1
  connectedExchanges: number;
  reasoning: string[];
  timestamp: Date;
}

export interface SignalValidationResponse {
  isValid: boolean;
  adjustedConfidence: number;
  consensusResult: ConsensusData;
  recommendation: "proceed" | "reduce_size" | "veto";
  reasoning: string[];
}

// ============================================================================
// ARBITRAGE & MANIPULATION TYPES (Task 12)
// ============================================================================

/**
 * Arbitrage Opportunity
 * Requirement 12.1: Flag arbitrage opportunities
 */
export interface ArbitrageOpportunity {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercentage: number;
  timestamp: Date;
}

/**
 * Price Spread between two exchanges
 */
export interface PriceSpread {
  symbol: string;
  exchangeA: string;
  exchangeB: string;
  priceA: number;
  priceB: number;
  spread: number; // priceA - priceB
  spreadPercentage: number; // (priceA - priceB) / priceB * 100
  timestamp: Date;
}

/**
 * Arbitrage Configuration
 */
export interface ArbitrageConfig {
  minSpreadPercentage: number; // e.g., 0.5 for 0.5%
  minLiquidity: number; // Minimum volume/liquidity required
  persistenceMs: number; // How long spread must persist to be flagged
}

/**
 * Trade outcome for adaptive learning
 */
export interface TradeOutcome {
  signalId: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  duration: number; // milliseconds
  exitReason: "take_profit" | "stop_loss" | "manual" | "emergency";
  timestamp: Date;
}

// ============================================================================
// FLOW CLASSIFIER TYPES
// ============================================================================

/**
 * Configuration for flow classification
 */
export interface FlowClassifierConfig {
  /** Threshold for passive absorption classification (0-1) */
  passiveThreshold: number;
  /** Threshold for aggressive pushing classification (0-1) */
  aggressiveThreshold: number;
  /** Minimum confidence for valid classification */
  minConfidence: number;
  /** Weight for footprint analysis in scoring */
  footprintWeight: number;
  /** Weight for sweep analysis in scoring */
  sweepWeight: number;
  /** Weight for iceberg analysis in scoring */
  icebergWeight: number;
  /** Time window for flow analysis (ms) */
  analysisWindow: number;
}

/**
 * Flow classification result with detailed breakdown
 */
export interface FlowClassificationResult {
  flowType: "passive_absorption" | "aggressive_pushing" | "neutral";
  confidence: number; // 0-100
  institutionalProbability: number; // 0-100
  breakdown: {
    footprintScore: number;
    sweepScore: number;
    icebergScore: number;
    cvdScore: number;
  };
  signals: {
    passiveAbsorption: boolean;
    aggressivePushing: boolean;
    icebergDetected: boolean;
    sweepDetected: boolean;
  };
  recommendation: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
  reasoning: string[];
}

/**
 * CVD integration result
 */
export interface CVDIntegrationResult {
  cvdConfirmed: boolean;
  cvdValue: number;
  cvdDirection: "bullish" | "bearish" | "neutral";
  absorptionDetected: boolean;
  distributionDetected: boolean;
  confidenceAdjustment: number;
}
