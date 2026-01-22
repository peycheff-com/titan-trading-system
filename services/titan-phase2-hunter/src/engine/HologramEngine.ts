/**
 * HologramEngine - Multi-Timeframe State Machine
 *
 * Combines Daily (Bias), 4H (Narrative), and 15m (Trigger) into a single state vector
 * with weighted scoring and veto logic. This is the core of the Holographic Market
 * Structure Engine that filters out noise and identifies high-probability setups.
 *
 * Core Philosophy: "We don't trade trends. We trade the Manipulation Phase of the AMD
 * (Accumulation-Manipulation-Distribution) cycle. We identify where institutional
 * algorithms are forced to inject liquidity, and we position ourselves to capture
 * the subsequent distribution."
 *
 * Requirements: 1.1-1.7 (Holographic State Engine), 2.1-2.7 (Alignment Logic), 6.1-6.7 (RS Filtering)
 */

import {
  BOS,
  DealingRange,
  Fractal,
  HologramState,
  HologramStatus,
  MSS,
  OHLCV,
  TimeframeState,
  TrendState,
  VetoResult,
} from '../types';
import { FractalMath } from './FractalMath';
import { BybitPerpsClient } from '../exchanges/BybitPerpsClient';
import { InstitutionalFlowClassifier } from '../flow/InstitutionalFlowClassifier';

export class HologramEngine {
  private bybitClient: BybitPerpsClient;
  private flowClassifier: InstitutionalFlowClassifier;
  private cache = new Map<string, { data: OHLCV[]; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(bybitClient: BybitPerpsClient, flowClassifier: InstitutionalFlowClassifier) {
    this.bybitClient = bybitClient;
    this.flowClassifier = flowClassifier;
  }

  /**
   * Analyze symbol across all 3 timeframes to generate hologram state
   * Fetches Daily, 4H, 15m data and combines into single state vector
   *
   * @param symbol - Trading symbol (e.g., 'BTCUSDT')
   * @returns Promise with complete hologram state
   */
  public async analyze(symbol: string): Promise<HologramState> {
    try {
      // Fetch OHLCV data for all 3 timeframes in parallel
      const [dailyCandles, h4Candles, m15Candles] = await Promise.all([
        this.fetchCachedOHLCV(symbol, '1D', 100),
        this.fetchCachedOHLCV(symbol, '4h', 200),
        this.fetchCachedOHLCV(symbol, '15m', 500),
      ]);

      // Validate data
      FractalMath.validateCandles(dailyCandles, 5);
      FractalMath.validateCandles(h4Candles, 5);
      FractalMath.validateCandles(m15Candles, 5);

      // Calculate fractal state for each timeframe
      const daily = this.analyzeTimeframe(dailyCandles, '1D');
      const h4 = this.analyzeTimeframe(h4Candles, '4H');
      const m15 = this.analyzeTimeframe(m15Candles, '15m');

      // Get latest flow classification
      const flowResult = this.flowClassifier.getLatestClassification(symbol);
      const flowScore = flowResult ? flowResult.breakdown.footprintScore : 50; // Default output neutral 50

      // Calculate alignment score including flow
      const alignmentScore = this.calcAlignmentScore(daily, h4, m15, flowScore);

      // Calculate Volatility (ATR-based)
      const volatility = this.calcVolatility(h4Candles);

      // Apply veto logic with Dynamic Thresholds & Flow Checks
      const veto = this.applyVetoLogic(daily, h4, volatility, flowResult);

      // Determine hologram status based on score and veto
      const status = this.getHologramStatus(alignmentScore, veto);

      // Calculate Relative Strength vs BTC over 4 hours
      const rsScore = await this.calcRelativeStrength(symbol);

      // Calculate Realized Expectancy (2026 Feedback Loop)
      const realizedExpectancy = await this.calcRealizedExpectancy(symbol);

      return {
        symbol,
        timestamp: Date.now(),
        daily,
        h4,
        m15,
        alignmentScore,
        status,
        veto,
        rsScore,
        flowScore: flowScore,
        flowAnalysis: flowResult || undefined,
        realizedExpectancy,
        direction:
          veto.direction ||
          (daily.trend === 'BULL' ? 'LONG' : daily.trend === 'BEAR' ? 'SHORT' : null),
      };
    } catch (error) {
      throw new Error(
        `Failed to analyze hologram for ${symbol}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Analyze single timeframe to generate timeframe state
   * Runs fractal detection, BOS/MSS analysis, and dealing range calculation
   *
   * @param candles - OHLCV data for timeframe
   * @param timeframe - Timeframe identifier
   * @returns TimeframeState with all analysis results
   */
  private analyzeTimeframe(candles: OHLCV[], timeframe: '1D' | '4H' | '15m'): TimeframeState {
    // Detect fractals using Bill Williams definition
    const fractals = FractalMath.detectFractals(candles);

    // Detect Break of Structure events
    const bos = FractalMath.detectBOS(candles, fractals);

    // Determine current trend state
    const trend = FractalMath.getTrendState(bos);

    // Detect Market Structure Shift (only for 15m timeframe as trigger)
    // eslint-disable-next-line functional/no-let
    let mss: MSS | null = null;
    if (timeframe === '15m' && bos.length > 0) {
      mss = FractalMath.detectMSS(candles, fractals, trend);
    }

    // Calculate dealing range and Premium/Discount zones
    const dealingRange = FractalMath.calcDealingRange(fractals);

    // Get current price (last close)
    const currentPrice = candles[candles.length - 1].close;

    // Determine price location within dealing range
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

  /**
   * Calculate alignment score using weighted formula with Flow Integration
   * Daily 40%, 4H 25%, 15m 15%, Flow 20%
   *
   * @param daily - Daily timeframe state
   * @param h4 - 4H timeframe state
   * @param m15 - 15m timeframe state
   * @param flowScore - Flow score (0-100)
   * @returns Alignment score (0-100)
   */
  public calcAlignmentScore(
    daily: TimeframeState,
    h4: TimeframeState,
    m15: TimeframeState,
    flowScore: number = 50
  ): number {
    // eslint-disable-next-line functional/no-let
    let score = 0;

    // Daily-4H agreement (40 points)
    if (daily.trend === h4.trend && daily.trend !== 'RANGE') {
      score += 40;
    } else if (daily.trend !== 'RANGE') {
      // Partial credit if daily is strong but 4H correction
      score += 10;
    }

    // 4H-15m agreement (25 points)
    if (h4.trend === m15.trend && h4.trend !== 'RANGE') {
      score += 25;
    }

    // 15m MSS confirmation (15 points)
    if (m15.mss !== null) {
      score += 15;
    }

    // Flow Confirmation (20 points)
    // Flow Score > 60 is bullish, < 40 is bearish
    // We map flow score to alignment based on trend direction
    const trendDirection = daily.trend;

    if (trendDirection === 'BULL') {
      if (flowScore > 60)
        score += 20; // Bullish flow confirms Bull trend
      else if (flowScore > 45) score += 10; // Neutral flow
      // Bearish flow adds 0
    } else if (trendDirection === 'BEAR') {
      if (flowScore < 40)
        score += 20; // Bearish flow confirms Bear trend
      else if (flowScore < 55) score += 10; // Neutral flow
    } else {
      // Range conditions, flow score less impactful or requires specific range logic
      score += 5;
    }

    return Math.min(100, score);
  }

  /**
   * Apply veto logic including Flow Veto
   *
   * @param daily - Daily timeframe state
   * @param h4 - 4H timeframe state
   * @param volatility - ATR-based volatility
   * @param flowResult - Flow classification result
   * @returns VetoResult
   */
  public applyVetoLogic(
    daily: TimeframeState,
    h4: TimeframeState,
    volatility: number = 0,
    flowResult?: any // Typed as any to avoid import issues if not available, but effectively FlowClassificationResult
  ): VetoResult {
    // Dynamic Threshold Adjustment
    // If High Volatility (>50), we widen the "Equilibrium" no-trade zone

    // VETO: Daily BULLISH but 4H in PREMIUM → Don't buy expensive
    if (daily.trend === 'BULL' && h4.location === 'PREMIUM') {
      return {
        vetoed: true,
        reason: 'Daily BULLISH but 4H in PREMIUM (too expensive to buy)',
        direction: 'LONG',
      };
    }

    // VETO: Daily BEARISH but 4H in DISCOUNT → Don't sell cheap
    if (daily.trend === 'BEAR' && h4.location === 'DISCOUNT') {
      return {
        vetoed: true,
        reason: 'Daily BEARISH but 4H in DISCOUNT (too cheap to sell)',
        direction: 'SHORT',
      };
    }

    // 2026: Dynamic Veto for High Volatility
    if (volatility > 80 && h4.location === 'EQUILIBRIUM') {
      return {
        vetoed: true,
        reason: `Extreme Volatility (${volatility.toFixed(0)}) requires Premium/Discount location`,
        direction: null,
      };
    }

    // FLOW VETO: Aggressive Pushing against Trend
    if (flowResult && flowResult.flowType === 'aggressive_pushing') {
      const isBullishFlow =
        flowResult.breakdown.cvdScore > 60 || flowResult.breakdown.footprintScore > 60;
      const isBearishFlow =
        flowResult.breakdown.cvdScore < 40 || flowResult.breakdown.footprintScore < 40;

      if (daily.trend === 'BULL' && isBearishFlow && flowResult.confidence > 70) {
        return {
          vetoed: true,
          reason: 'Heavy Institutional Selling detected against Bull Trend',
          direction: 'LONG',
        };
      }

      if (daily.trend === 'BEAR' && isBullishFlow && flowResult.confidence > 70) {
        return {
          vetoed: true,
          reason: 'Heavy Institutional Buying detected against Bear Trend',
          direction: 'SHORT',
        };
      }
    }

    // No veto - alignment is valid
    return {
      vetoed: false,
      reason: null,
      direction: null,
    };
  }

  /**
   * Determine hologram status based on alignment score and veto logic
   * A+ = Score >= 80 and no veto
   * B = Score 60-79 and no veto
   * NO_PLAY = Vetoed
   * CONFLICT = Score < 60
   *
   * @param score - Alignment score (0-100)
   * @param veto - Veto result
   * @returns HologramStatus classification
   */
  public getHologramStatus(score: number, veto: VetoResult): HologramStatus {
    // If vetoed, return NO_PLAY regardless of score
    if (veto.vetoed) {
      return 'NO_PLAY';
    }

    // A+ Alignment: Score >= 80 (full confluence)
    if (score >= 80) {
      return 'A+';
    }

    // B Alignment: Score 60-79 (partial confluence)
    if (score >= 60) {
      return 'B';
    }

    // Conflict: Score < 60 (timeframes disagree)
    return 'CONFLICT';
  }

  /**
   * Calculate Relative Strength vs BTC over 4 hours
   * RS > 0 = Asset stronger than BTC (trade long)
   * RS < 0 = Asset weaker than BTC (trade short)
   *
   * @param symbol - Asset symbol to compare
   * @returns Promise with RS score (-1 to +1)
   */
  public async calcRelativeStrength(symbol: string): Promise<number> {
    try {
      // Skip RS calculation for BTC itself
      if (symbol.toUpperCase() === 'BTCUSDT') {
        return 0;
      }

      // Fetch 4-hour data for both asset and BTC (last 2 candles)
      const [assetCandles, btcCandles] = await Promise.all([
        this.fetchCachedOHLCV(symbol, '4h', 2),
        this.fetchCachedOHLCV('BTCUSDT', '4h', 2),
      ]);

      // Validate we have enough data
      if (assetCandles.length < 2 || btcCandles.length < 2) {
        console.warn(`⚠️ Insufficient data for RS calculation: ${symbol}`);
        return 0;
      }

      // Calculate % change over 4 hours (current vs previous)
      const assetChange = (assetCandles[1].close - assetCandles[0].close) / assetCandles[0].close;
      const btcChange = (btcCandles[1].close - btcCandles[0].close) / btcCandles[0].close;

      // RS Score = Asset % change - BTC % change
      const rsScore = assetChange - btcChange;

      // Clamp to reasonable range (-1 to +1)
      return Math.max(-1, Math.min(1, rsScore));
    } catch (error) {
      console.warn(
        `⚠️ Failed to calculate RS for ${symbol}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      return 0; // Return neutral RS on error
    }
  }

  /**
   * Fetch OHLCV data with caching to minimize API calls
   * Cache TTL is 5 minutes to balance freshness with API efficiency
   *
   * @param symbol - Trading symbol
   * @param interval - Timeframe interval
   * @param limit - Number of candles
   * @returns Promise with cached or fresh OHLCV data
   */
  private async fetchCachedOHLCV(
    symbol: string,
    interval: string,
    limit: number
  ): Promise<OHLCV[]> {
    const cacheKey = `${symbol}-${interval}-${limit}`;
    const cached = this.cache.get(cacheKey);

    // Return cached data if valid
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    // Fetch fresh data from exchange
    const data = await this.bybitClient.fetchOHLCV(symbol, interval, limit);

    // Cache the data
    // eslint-disable-next-line functional/immutable-data
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });

    return data;
  }

  /**
   * Calculate Volatility (ATR Normalized)
   * @param candles OHLCV Data
   * @returns Volatility score 0-100
   */
  private calcVolatility(candles: OHLCV[]): number {
    if (candles.length < 15) return 0;

    // eslint-disable-next-line functional/no-let
    let sumTr = 0;
    const period = 14;

    // eslint-disable-next-line functional/no-let
    for (let i = 1; i < period + 1; i++) {
      const idx = candles.length - i;
      const high = candles[idx].high;
      const low = candles[idx].low;
      const prevClose = candles[idx - 1].close;

      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      sumTr += tr;
    }

    const atr = sumTr / period;
    const currentPrice = candles[candles.length - 1].close;
    // Normalize: ATR % of price. 5% daily move is huge.
    // 0.5% is low, 5% is high.
    const atrPercent = (atr / currentPrice) * 100;
    return Math.min(atrPercent * 20, 100); // 1% = 20, 5% = 100
  }

  /**
   * Calculate Realized Expectancy
   * Retrieve historical performance for this symbol/setup
   */
  private async calcRealizedExpectancy(symbol: string): Promise<number> {
    // TODO: Connect to AccountingService or Metrics Service
    // For now returning a placeholder 0 (neutral)
    return 0;
  }

  /**
   * Clear the OHLCV cache
   * Useful for testing or forcing fresh data fetch
   */
  public clearCache(): void {
    // eslint-disable-next-line functional/immutable-data
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring
   * @returns Object with cache size and hit rate info
   */
  public getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Validate hologram state for completeness
   * Ensures all required fields are present and valid
   *
   * @param hologram - Hologram state to validate
   * @returns true if valid, throws error if invalid
   */
  public static validateHologramState(hologram: HologramState): boolean {
    if (!hologram.symbol || typeof hologram.symbol !== 'string') {
      throw new Error('Invalid hologram: missing or invalid symbol');
    }

    if (!hologram.timestamp || typeof hologram.timestamp !== 'number') {
      throw new Error('Invalid hologram: missing or invalid timestamp');
    }

    if (hologram.alignmentScore < 0 || hologram.alignmentScore > 100) {
      throw new Error('Invalid hologram: alignment score must be 0-100');
    }

    if (!['A+', 'B', 'CONFLICT', 'NO_PLAY'].includes(hologram.status)) {
      throw new Error('Invalid hologram: invalid status');
    }

    // Validate timeframe states
    const timeframes = [hologram.daily, hologram.h4, hologram.m15];
    for (const tf of timeframes) {
      if (!tf.fractals || !Array.isArray(tf.fractals)) {
        throw new Error(`Invalid hologram: missing fractals for ${tf.timeframe}`);
      }

      if (!tf.bos || !Array.isArray(tf.bos)) {
        throw new Error(`Invalid hologram: missing BOS for ${tf.timeframe}`);
      }

      if (!['BULL', 'BEAR', 'RANGE'].includes(tf.trend)) {
        throw new Error(`Invalid hologram: invalid trend for ${tf.timeframe}`);
      }

      if (!['PREMIUM', 'DISCOUNT', 'EQUILIBRIUM'].includes(tf.location)) {
        throw new Error(`Invalid hologram: invalid location for ${tf.timeframe}`);
      }
    }

    return true;
  }

  /**
   * Get human-readable hologram summary
   * Useful for logging and debugging
   *
   * @param hologram - Hologram state
   * @returns Formatted summary string
   */
  public static getHologramSummary(hologram: HologramState): string {
    const { symbol, status, alignmentScore, rsScore, daily, h4, m15 } = hologram;

    const statusEmoji = {
      'A+': '🟢',
      B: '🟡',
      CONFLICT: '🔴',
      NO_PLAY: '⚫',
    }[status];

    const rsEmoji = rsScore > 0.02 ? '📈' : rsScore < -0.02 ? '📉' : '➡️';

    return (
      `${statusEmoji} ${symbol} | Score: ${alignmentScore} | RS: ${(rsScore * 100).toFixed(
        1
      )}% ${rsEmoji} | ` +
      `Daily: ${daily.trend}/${daily.location} | 4H: ${h4.trend}/${h4.location} | 15m: ${m15.trend}${
        m15.mss ? '/MSS' : ''
      }`
    );
  }
}
