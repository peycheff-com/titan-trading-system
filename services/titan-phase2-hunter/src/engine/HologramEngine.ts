/**
 * HologramEngine - Multi-Timeframe State Machine with 2026 Enhancements
 *
 * Combines Daily (Bias), 4H (Narrative), and 15m (Trigger) into a single state vector
 * with weighted scoring and veto logic. This is the core of the Holographic Market
 * Structure Engine that filters out noise and identifies high-probability setups.
 *
 * Integrates all 2026 enhancement layers:
 * - Oracle: Prediction Market Integration
 * - Advanced Flow: Footprint & Sweep Detection
 * - Bot Trap: Pattern Recognition
 * - Global CVD: Liquidity Aggregation
 *
 * Requirements:
 * - 1.1-1.7: Classic Holographic State Engine
 * - 5.1-5.7: Enhanced Integration (Oracle, Flow, BotTrap, Global CVD)
 * - 7.1-7.7: Conviction-based Position Sizing
 */

import { EventEmitter } from 'events';
import {
  BOS,
  BotTrapAnalysis,
  ConvictionSizing,
  DealingRange,
  EnhancedValidationResult,
  FlowClassificationResult,
  FlowValidation,
  Fractal,
  GlobalCVDData,
  HologramState,
  HologramStatus,
  MSS,
  OHLCV,
  OracleScore,
  TechnicalSignal,
  TimeframeState,
  VetoResult,
} from '../types';
import { FractalMath } from './FractalMath';
import { BybitPerpsClient } from '../exchanges/BybitPerpsClient';
import { InstitutionalFlowClassifier } from '../flow/InstitutionalFlowClassifier';
import { Oracle } from '../oracle';
import { AdvancedFlowValidator } from '../flow';
import { BotTrapDetector } from '../bottrap';
import { GlobalLiquidityAggregator } from '../global-liquidity';
import { ScoringBreakdown, ScoringEngine } from './ScoringEngine';
import { SignalValidator } from './SignalValidator';
import { ConvictionSizingEngine } from './ConvictionSizingEngine';
import { getConfigManager, PhaseConfig } from '@titan/shared';
// We import from ConfigManager for specific Hunter types if needed,
// but relying on shared ConfigManager is cleaner for runtime config.
import { Phase2Config } from '../config/ConfigManager';
import { Logger } from '../logging/Logger';

export class HologramEngine extends EventEmitter {
  private bybitClient: BybitPerpsClient;
  private flowClassifier: InstitutionalFlowClassifier;
  private cache = new Map<string, { data: OHLCV[]; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private logger: Logger;

  // Enhanced Components
  private oracle: Oracle | null = null;
  private flowValidator: AdvancedFlowValidator | null = null;
  private botTrapDetector: BotTrapDetector | null = null;
  private globalAggregator: GlobalLiquidityAggregator | null = null;

  // Enhancement Engines
  private scoringEngine: ScoringEngine;
  private sizingEngine: ConvictionSizingEngine;
  private signalValidator: SignalValidator;

  // Market Regime Tracking
  private currentRegime: string = 'STABLE';
  private currentAlpha: number = 3.0;

  constructor(
    bybitClient: BybitPerpsClient,
    flowClassifier: InstitutionalFlowClassifier,
    logger?: Logger
  ) {
    super();
    this.bybitClient = bybitClient;
    this.flowClassifier = flowClassifier;
    this.logger = logger || new Logger({ enableConsoleOutput: true });

    // Initialize Enhancement Engines
    this.scoringEngine = new ScoringEngine();
    this.sizingEngine = new ConvictionSizingEngine();
    this.signalValidator = new SignalValidator();

    this.setupEventForwarding();
  }

  // ============================================================================
  // COMPONENT INJECTION
  // ============================================================================

  public setOracle(oracle: Oracle): void {
    // eslint-disable-next-line functional/immutable-data
    this.oracle = oracle;
    this.setupOracleEvents();
  }

  public setFlowValidator(validator: AdvancedFlowValidator): void {
    // eslint-disable-next-line functional/immutable-data
    this.flowValidator = validator;
    this.setupFlowValidatorEvents();
  }

  public setBotTrapDetector(detector: BotTrapDetector): void {
    // eslint-disable-next-line functional/immutable-data
    this.botTrapDetector = detector;
    this.setupBotTrapEvents();
  }

  public setGlobalAggregator(aggregator: GlobalLiquidityAggregator): void {
    // eslint-disable-next-line functional/immutable-data
    this.globalAggregator = aggregator;
    this.setupGlobalAggregatorEvents();
  }

  public updateMarketRegime(regime: string, alpha: number): void {
    // eslint-disable-next-line functional/immutable-data
    this.currentRegime = regime;
    // eslint-disable-next-line functional/immutable-data
    this.currentAlpha = alpha;
  }

  // ============================================================================
  // MAIN ANALYSIS LOGIC
  // ============================================================================

  /**
   * Analyze symbol using unified Phase 2 Engine
   * Combines Classic logic (Fractals) with Enhanced logic (Oracle/Flow/etc.)
   */
  public async analyze(symbol: string): Promise<HologramState> {
    try {
      // 1. Fetch Basic Market Data (Candles)
      const [dailyCandles, h4Candles, m15Candles] = await Promise.all([
        this.fetchCachedOHLCV(symbol, '1D', 100),
        this.fetchCachedOHLCV(symbol, '4h', 200),
        this.fetchCachedOHLCV(symbol, '15m', 500),
      ]);

      FractalMath.validateCandles(dailyCandles, 5);
      FractalMath.validateCandles(h4Candles, 5);
      FractalMath.validateCandles(m15Candles, 5);

      // 2. Perform Classic Analysis
      const daily = this.analyzeTimeframe(dailyCandles, '1D');
      const h4 = this.analyzeTimeframe(h4Candles, '4H');
      const m15 = this.analyzeTimeframe(m15Candles, '15m');
      const volatility = this.calcVolatility(h4Candles);

      // 3. Classic Flow Classifier (Backward Compatibility)
      const flowResult = this.flowClassifier.getLatestClassification(symbol);
      const flowScore = flowResult ? flowResult.breakdown.footprintScore : 50;

      // 4. Gather Enhancement Data (if components active)
      const oracleScore = await this.getOracleScore(symbol);
      const flowValidation = await this.getFlowValidation(symbol);
      const botTrapAnalysis = await this.getBotTrapAnalysis(symbol);
      const globalCVD = await this.getGlobalCVD(symbol);

      const enhancementsActive = this.areEnhancementsActive();

      // 5. Calculate Score & Veto
      // Construct an interim HologramState for scoring engine
      const baseState: HologramState = {
        symbol,
        timestamp: Date.now(),
        daily,
        h4,
        m15,
        alignmentScore: 0, // Will be calculated by ScoringEngine
        status: 'CONFLICT', // Interim
        veto: { vetoed: false, reason: null, direction: null },
        rsScore: 0,
        flowScore,
        flowAnalysis: flowResult || undefined,
        direction: null,
      };

      // Use Enhanced Scoring Engine
      // It handles classic weightings + enhancements
      const scoring = this.scoringEngine.calculateEnhancedScore(
        baseState,
        oracleScore,
        flowValidation,
        botTrapAnalysis,
        globalCVD,
        this.currentRegime,
        this.currentAlpha
      );

      // Determine Alignment & Conviction
      const alignment = this.scoringEngine.determineAlignment(
        scoring.adjustedScore,
        oracleScore,
        botTrapAnalysis,
        globalCVD,
        flowValidation,
        this.currentRegime,
        this.currentAlpha
      );

      const convictionLevel = this.scoringEngine.determineConvictionLevel(
        scoring.adjustedScore,
        oracleScore,
        globalCVD
      );

      // 6. Apply Veto Logic (Unified)
      // We map Alignment 'VETO' to VetoResult
      const veto: VetoResult = {
        vetoed: alignment === 'VETO',
        reason: alignment === 'VETO' ? 'Enhanced Veto Triggered (Score/Oracle/Flow/CVD)' : null,
        direction: null, // Specific direction veto logic handled in scoring engine implicitly
      };

      // Apply classic logic specific vetoes if needed (e.g. Daily Bull/4H Premium)
      // This is now integrated into Scoring/Alignment thresholds, but let's re-verify specific rules
      const classicVeto = this.applyClassicVeto(daily, h4, volatility);
      if (classicVeto.vetoed) {
        // eslint-disable-next-line functional/immutable-data
        veto.vetoed = true;
        // eslint-disable-next-line functional/immutable-data
        veto.reason = veto.reason ? `${veto.reason} | ${classicVeto.reason}` : classicVeto.reason;
        // eslint-disable-next-line functional/immutable-data
        veto.direction = classicVeto.direction;
      }

      // 7. Calculate Status
      const status: HologramStatus = veto.vetoed
        ? 'NO_PLAY'
        : alignment === 'A+'
          ? 'A+'
          : alignment === 'A' || alignment === 'B' // Map A/B to B for classic compatibility? Or strictly A+ -> A+, others -> B?
            ? 'B'
            : 'CONFLICT';

      // 8. RS Score & Expectancy
      const rsScore = await this.calcRelativeStrength(symbol);
      const realizedExpectancy = await this.calcRealizedExpectancy(symbol);

      // 9. Construct Final Hologram State
      const finalState: HologramState = {
        ...baseState,
        alignmentScore: scoring.adjustedScore,
        status,
        veto,
        rsScore,
        realizedExpectancy: 0,
        direction:
          veto.direction ||
          (daily.trend === 'BULL' ? 'LONG' : daily.trend === 'BEAR' ? 'SHORT' : null),
        enhancedScore: scoring.adjustedScore,
        convictionLevel,
        enhancementsActive,
      };

      // Validate the final state (as it contains all HologramState fields)
      HologramEngine.validateHologramState(finalState);

      return finalState;
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes('Insufficient candles') || msg.includes('Insufficient fractals')) {
        this.logger.warn(`Skipping ${symbol}: ${msg}`);
      } else {
        this.logger.error(`Failed to analyze hologram for ${symbol}`, error as Error);
      }
      throw new Error(`Failed to analyze hologram for ${symbol}: ${msg}`);
    }
  }

  public async validateSignal(signal: TechnicalSignal): Promise<EnhancedValidationResult> {
    const oracleScore = await this.getOracleScore(signal.symbol);
    const flowValidation = await this.getFlowValidation(signal.symbol);
    const botTrapAnalysis = await this.getBotTrapAnalysis(signal.symbol);
    const globalCVD = await this.getGlobalCVD(signal.symbol);

    return this.signalValidator.validateSignal(
      signal,
      oracleScore,
      flowValidation,
      botTrapAnalysis,
      globalCVD
    );
  }

  public async calculatePositionSize(baseSize: number, symbol: string): Promise<ConvictionSizing> {
    const oracleScore = await this.getOracleScore(symbol);
    const flowValidation = await this.getFlowValidation(symbol);
    const botTrapAnalysis = await this.getBotTrapAnalysis(symbol);
    const globalCVD = await this.getGlobalCVD(symbol);

    return this.sizingEngine.calculatePositionSize(
      baseSize,
      oracleScore,
      flowValidation,
      botTrapAnalysis,
      globalCVD
    );
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  private analyzeTimeframe(candles: OHLCV[], timeframe: '1D' | '4H' | '15m'): TimeframeState {
    const fractals = FractalMath.detectFractals(candles);
    const bos = FractalMath.detectBOS(candles, fractals);
    const trend = FractalMath.getTrendState(bos);
    // eslint-disable-next-line functional/no-let
    let mss: MSS | null = null;
    if (timeframe === '15m' && bos.length > 0) {
      mss = FractalMath.detectMSS(candles, fractals, trend);
    }
    const dealingRange = FractalMath.calcDealingRange(fractals);
    const currentPrice = candles[candles.length - 1].close;
    const location = FractalMath.getPriceLocation(currentPrice, dealingRange);

    return {
      timeframe,
      trend,
      dealingRange,
      currentPrice,
      location,
      fractals,
      bos,
      mss,
    };
  }

  private applyClassicVeto(
    daily: TimeframeState,
    h4: TimeframeState,
    volatility: number
  ): VetoResult {
    if (daily.trend === 'BULL' && h4.location === 'PREMIUM') {
      return {
        vetoed: true,
        reason: 'Daily BULL/4H PREMIUM',
        direction: 'LONG',
      };
    }
    if (daily.trend === 'BEAR' && h4.location === 'DISCOUNT') {
      return {
        vetoed: true,
        reason: 'Daily BEAR/4H DISCOUNT',
        direction: 'SHORT',
      };
    }
    if (volatility > 80 && h4.location === 'EQUILIBRIUM') {
      return {
        vetoed: true,
        reason: `Extreme Volatility (${volatility.toFixed(0)}) requires Premium/Discount`,
        direction: null,
      };
    }
    return { vetoed: false, reason: null, direction: null };
  }

  private async fetchCachedOHLCV(
    symbol: string,
    interval: string,
    limit: number
  ): Promise<OHLCV[]> {
    const cacheKey = `${symbol}-${interval}-${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    const data = await this.bybitClient.fetchOHLCV(symbol, interval, limit);
    // eslint-disable-next-line functional/immutable-data
    this.cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  }

  private calcVolatility(candles: OHLCV[]): number {
    if (candles.length < 15) return 0;
    // eslint-disable-next-line functional/no-let
    let sumTr = 0;
    const period = 14;
    // eslint-disable-next-line functional/no-let -- loop counter is mutated
    for (let i = 1; i < period + 1; i++) {
      const idx = candles.length - i;
      const tr = Math.max(
        candles[idx].high - candles[idx].low,
        Math.abs(candles[idx].high - candles[idx - 1].close),
        Math.abs(candles[idx].low - candles[idx - 1].close)
      );
      sumTr += tr;
    }
    const atr = sumTr / period;
    const currentPrice = candles[candles.length - 1].close;
    return Math.min((atr / currentPrice) * 100 * 20, 100);
  }

  public async calcRelativeStrength(symbol: string): Promise<number> {
    if (symbol.toUpperCase() === 'BTCUSDT') return 0;
    try {
      const [asset, btc] = await Promise.all([
        this.fetchCachedOHLCV(symbol, '4h', 2),
        this.fetchCachedOHLCV('BTCUSDT', '4h', 2),
      ]);
      if (asset.length < 2 || btc.length < 2) return 0;
      const assetChg = (asset[1].close - asset[0].close) / asset[0].close;
      const btcChg = (btc[1].close - btc[0].close) / btc[0].close;
      return Math.max(-1, Math.min(1, assetChg - btcChg));
    } catch {
      return 0;
    }
  }

  private async calcRealizedExpectancy(_symbol: string): Promise<number> {
    return 0; // TODO: Connect to Accounting/Metrics
  }

  // Enhancement Data Fetchers
  private async getOracleScore(symbol: string): Promise<OracleScore | null> {
    if (!this.oracle) return null;
    try {
      return await this.oracle.evaluateSignal({
        symbol,
        direction: 'LONG',
        confidence: 50,
        entryPrice: 0,
        stopLoss: 0,
        takeProfit: 0,
        timestamp: new Date(),
        source: 'hologram',
      });
    } catch {
      return null;
    }
  }

  private async getFlowValidation(symbol: string): Promise<FlowValidation | null> {
    if (!this.flowValidator) return null;
    try {
      const state = this.flowValidator.getState();
      if (state.lastValidation) {
        return {
          isValid: true,
          confidence: state.avgConfidence,
          flowType: 'neutral',
          sweepCount: 0,
          icebergDensity: 0,
          institutionalProbability: 0,
          timestamp: state.lastValidation,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async getBotTrapAnalysis(_symbol: string): Promise<BotTrapAnalysis | null> {
    if (!this.botTrapDetector) return null;
    try {
      const rate = this.botTrapDetector.getTrapDetectionRate();
      return {
        isSuspect: rate > 0.5,
        suspicionScore: rate * 100,
        patterns: [],
        recommendations: [],
        timestamp: new Date(),
      };
    } catch {
      return null;
    }
  }

  private async getGlobalCVD(symbol: string): Promise<GlobalCVDData | null> {
    if (!this.globalAggregator) return null;
    try {
      return this.globalAggregator.getGlobalCVD(symbol);
    } catch {
      return null;
    }
  }

  private areEnhancementsActive(): boolean {
    return !!(this.oracle || this.flowValidator || this.botTrapDetector || this.globalAggregator);
  }

  // Event Setup
  private setupEventForwarding(): void {
    this.scoringEngine.on('configUpdated', c => this.emit('scoringConfigUpdated', c));
    this.sizingEngine.on('sizingCalculated', s => this.emit('sizingCalculated', s));
    this.signalValidator.on('signalValidated', r => this.emit('validationComplete', r));
  }

  private setupOracleEvents(): void {
    this.oracle?.on('signalEvaluated', d => this.emit('oracleEvaluation', d));
    this.oracle?.on('connectionError', e => this.logger.error('Oracle connection error', e));
  }

  private setupFlowValidatorEvents(): void {
    this.flowValidator?.on('flowValidated', d => this.emit('flowValidation', d));
  }

  private setupBotTrapEvents(): void {
    this.botTrapDetector?.on('trapDetected', d => this.emit('botTrapDetected', d));
  }

  private setupGlobalAggregatorEvents(): void {
    this.globalAggregator?.on('globalCVDUpdate', d => this.emit('globalCVDUpdate', d));
    this.globalAggregator?.on('manipulationDetected', d => this.emit('manipulationDetected', d));
  }

  public clearCache(): void {
    // eslint-disable-next-line functional/immutable-data
    this.cache.clear();
  }

  public getCacheStats() {
    return { size: this.cache.size, keys: Array.from(this.cache.keys()) };
  }

  /**
   * Validate hologram state for completeness
   */
  public static validateHologramState(hologram: HologramState): boolean {
    if (!hologram.symbol || typeof hologram.symbol !== 'string') {
      throw new Error('Invalid symbol');
    }
    if (!hologram.timestamp) throw new Error('Invalid timestamp');
    if (hologram.alignmentScore < 0 || hologram.alignmentScore > 100) {
      throw new Error('alignment score must be 0-100');
    }
    const validStatuses: HologramStatus[] = ['A+', 'A', 'B', 'C', 'CONFLICT', 'NO_PLAY', 'VETO'];
    if (!validStatuses.includes(hologram.status)) {
      throw new Error('invalid status');
    }
    return true;
  }

  /**
   * Get human-readable hologram summary
   */
  public static getHologramSummary(hologram: HologramState): string {
    const { symbol, status, alignmentScore, rsScore, daily, h4, m15 } = hologram;
    const emoji = status === 'A+' || status === 'A' ? '🟢' : status === 'B' ? '🟡' : '🔴';
    const rsEmoji = rsScore >= 0 ? '📈' : '📉';

    const dailyStr = `Daily: ${daily.trend}/${daily.location}`;
    const h4Str = `4H: ${h4.trend}/${h4.location}`;
    const m15Suffix = m15.mss ? '/MSS' : `/${m15.location}`;
    const m15Str = `15m: ${m15.trend}${m15Suffix}`;

    return `${emoji} ${symbol} | ${status} | Score: ${alignmentScore} | RS: ${(
      rsScore * 100
    ).toFixed(1)}% ${rsEmoji} | ${dailyStr} | ${h4Str} | ${m15Str}`;
  }
}
