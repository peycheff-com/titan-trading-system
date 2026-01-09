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
  CRYPTO_PRICE = 'crypto_price',
  FED_POLICY = 'fed_policy',
  REGULATORY = 'regulatory',
  MACRO_ECONOMIC = 'macro_economic',
  GEOPOLITICAL = 'geopolitical'
}

/**
 * Impact level for prediction market events
 */
export enum ImpactLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  EXTREME = 'extreme'
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
  source: 'polymarket' | 'augur' | 'gnosis';
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
  direction: 'up' | 'down';
  urgency: 'low' | 'medium' | 'high';
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
  flowType: 'passive_absorption' | 'aggressive_pushing' | 'neutral';
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
  side: 'buy' | 'sell';
  aggressor: 'buyer' | 'seller';
  orderType: 'market' | 'limit';
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
  type: 'equal_highs' | 'equal_lows' | 'fvg' | 'order_block' | 'liquidity_pool';
  precision: number; // 0-100 (100 = exact tick precision)
  suspicionLevel: 'low' | 'medium' | 'high' | 'extreme';
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
  action: 'avoid' | 'reduce_size' | 'require_confirmation' | 'proceed_cautiously';
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
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  DELAYED = 'delayed',
  ERROR = 'error'
}

/**
 * Exchange flow data
 * Requirement 4.1: Establish WebSocket connections to Binance, Coinbase, and Kraken
 */
export interface ExchangeFlow {
  exchange: 'binance' | 'coinbase' | 'kraken';
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
  pattern: 'single_exchange_outlier' | 'coordinated_manipulation' | 'none';
}

/**
 * Global CVD aggregation result
 * Requirement 4.2: Aggregate buy/sell volume from all three exchanges
 */
export interface GlobalCVDData {
  aggregatedCVD: number;
  exchangeFlows: ExchangeFlow[];
  consensus: 'bullish' | 'bearish' | 'neutral' | 'conflicted';
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
  symbol: string;
  dailyBias: 'BULL' | 'BEAR' | 'RANGE';
  fourHourLocation: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
  fifteenMinTrigger: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  
  // 2026 enhancements
  oracleScore: OracleScore | null;
  flowValidation: FlowValidation | null;
  botTrapAnalysis: BotTrapAnalysis | null;
  globalCVD: GlobalCVDData | null;
  
  // Enhanced scoring
  classicScore: number; // 0-100 (original Phase 2 score)
  enhancedScore: number; // 0-100 (with 2026 enhancements)
  convictionLevel: 'low' | 'medium' | 'high' | 'extreme';
  alignment: 'A+' | 'A' | 'B' | 'C' | 'VETO';
  
  // Metadata
  timestamp: Date;
  enhancementsActive: boolean;
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
  PREDICTION_EMERGENCY = 'prediction_emergency',
  LIQUIDITY_EMERGENCY = 'liquidity_emergency',
  FLOW_EMERGENCY = 'flow_emergency',
  TRAP_SATURATION = 'trap_saturation',
  SYSTEM_DEGRADATION = 'system_degradation'
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
  level: 'none' | 'partial' | 'significant' | 'emergency';
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
  ORACLE_CONNECTION_FAILED = 'oracle_connection_failed',
  PREDICTION_DATA_STALE = 'prediction_data_stale',
  ORACLE_API_RATE_LIMIT = 'oracle_api_rate_limit',
  
  // Flow Validator Errors
  FOOTPRINT_ANALYSIS_FAILED = 'footprint_analysis_failed',
  SWEEP_DETECTION_ERROR = 'sweep_detection_error',
  ICEBERG_ANALYSIS_TIMEOUT = 'iceberg_analysis_timeout',
  
  // Bot Trap Errors
  PATTERN_ANALYSIS_FAILED = 'pattern_analysis_failed',
  LEARNING_MODEL_ERROR = 'learning_model_error',
  TRAP_DETECTION_TIMEOUT = 'trap_detection_timeout',
  
  // Global Aggregator Errors
  EXCHANGE_CONNECTION_LOST = 'exchange_connection_lost',
  CVD_AGGREGATION_FAILED = 'cvd_aggregation_failed',
  MANIPULATION_DETECTION_ERROR = 'manipulation_detection_error',
  
  // System Integration Errors
  ENHANCEMENT_LAYER_CONFLICT = 'enhancement_layer_conflict',
  FALLBACK_MODE_ACTIVATED = 'fallback_mode_activated',
  EMERGENCY_PROTOCOL_TRIGGERED = 'emergency_protocol_triggered'
}

// ============================================================================
// TECHNICAL SIGNAL TYPES
// ============================================================================

/**
 * Technical signal for Oracle integration
 */
export interface TechnicalSignal {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number; // 0-100
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  timestamp: Date;
  source: 'hologram' | 'poi' | 'cvd' | 'session';
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
  exitReason: 'take_profit' | 'stop_loss' | 'manual' | 'emergency';
  timestamp: Date;
}
