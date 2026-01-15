/**
 * Tripwire Calculators - Structural Level Detection
 *
 * Pure math functions for calculating tripwire levels using TypedArrays
 * for optimal performance. These calculators identify structural breakout
 * levels (liquidation clusters, daily levels, Bollinger breakouts).
 */

import { OHLCV, TrapType, Tripwire } from "../types/index.js";

interface VolumeProfileNode {
  price: number;
  volume: number;
}

export class TripwireCalculators {
  /**
   * Calculate liquidation cluster tripwire using volume profile analysis
   *
   * Finds high-volume nodes (liquidation clusters) and sets triggers
   * at cluster price ± 0.2%
   *
   * @param ohlcv - OHLCV data (minimum 50 bars recommended)
   * @param symbol - Ticker symbol
   * @returns Tripwire or null if no valid cluster found
   */
  static calcLiquidationCluster(
    ohlcv: OHLCV[],
    symbol: string = "",
  ): Tripwire | null {
    if (ohlcv.length < 50) {
      return null; // Insufficient data
    }

    // Build volume profile with 50 bins
    const volumeProfile = TripwireCalculators.buildVolumeProfile(ohlcv, 50);

    // Find top 3 volume peaks (liquidation clusters)
    const peaks = volumeProfile
      .map((node, idx) => ({ price: node.price, volume: node.volume, idx }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 3); // Top 3 clusters

    if (peaks.length === 0) {
      return null;
    }

    // Select cluster above current price for LONG, below for SHORT
    const currentPrice = ohlcv[ohlcv.length - 1].close;
    const longCluster = peaks.find((p) => p.price > currentPrice);
    const shortCluster = peaks.find((p) => p.price < currentPrice);

    if (!longCluster && !shortCluster) {
      return null;
    }

    // Prefer direction with stronger cluster
    const trap =
      longCluster && (!shortCluster || longCluster.volume > shortCluster.volume)
        ? {
          symbol, // Set by caller or default
          triggerPrice: longCluster.price * 1.002, // +0.2% above cluster
          direction: "LONG" as const,
          trapType: "LIQUIDATION" as const,
          confidence: 95,
          leverage: 20,
          estimatedCascadeSize: 0.05, // 5% expected move
          activated: false,
        }
        : {
          symbol,
          triggerPrice: shortCluster!.price * 0.998, // -0.2% below cluster
          direction: "SHORT" as const,
          trapType: "LIQUIDATION" as const,
          confidence: 95,
          leverage: 20,
          estimatedCascadeSize: 0.05,
          activated: false,
        };

    return trap;
  }

  /**
   * Build volume profile by distributing volume across price bins
   *
   * Creates a histogram of volume at different price levels to identify
   * high-volume nodes (potential liquidation clusters)
   *
   * @param ohlcv - OHLCV data
   * @param bins - Number of price bins (default 50)
   * @returns Array of price/volume nodes
   */
  static buildVolumeProfile(ohlcv: OHLCV[], bins: number): VolumeProfileNode[] {
    if (ohlcv.length === 0 || bins <= 0) {
      return [];
    }

    // Find price range
    const highs = ohlcv.map((bar) => bar.high);
    const lows = ohlcv.map((bar) => bar.low);
    const maxPrice = Math.max(...highs);
    const minPrice = Math.min(...lows);

    // Handle no price range - put all volume in single bin
    if (maxPrice === minPrice) {
      return [{
        price: maxPrice,
        volume: ohlcv.reduce((sum, bar) => sum + bar.volume, 0),
      }];
    }

    const priceStep = (maxPrice - minPrice) / bins;

    // Initialize bins
    const profile: VolumeProfileNode[] = Array.from(
      { length: bins },
      (_, i) => ({
        price: minPrice + (i * priceStep) + (priceStep / 2), // Center of bin
        volume: 0,
      }),
    );

    // Accumulate volume in bins
    for (const bar of ohlcv) {
      const binIdx = Math.floor((bar.close - minPrice) / priceStep);
      // Handle edge case where close === maxPrice
      const safeBinIdx = Math.min(binIdx, bins - 1);
      if (safeBinIdx >= 0 && safeBinIdx < bins) {
        profile[safeBinIdx].volume += bar.volume;
      }
    }

    return profile;
  }

  /**
   * Calculate daily level tripwire (PDH/PDL breakout)
   *
   * Identifies Previous Day High (PDH) and Previous Day Low (PDL)
   * and sets breakout triggers at these key psychological levels
   *
   * @param ohlcv - OHLCV data (1h bars, minimum 48 bars)
   * @param symbol - Ticker symbol
   * @returns Tripwire or null if not close to any daily level
   */
  static calcDailyLevel(ohlcv: OHLCV[], symbol: string = ""): Tripwire | null {
    // Need at least 48 bars (2 days of 1h data)
    if (ohlcv.length < 48) {
      return null;
    }

    // Get previous day high/low (assuming 1h bars, last 24 bars = 1 day)
    const previousDay = ohlcv.slice(-48, -24); // 24 bars before last 24

    if (previousDay.length < 24) {
      return null;
    }

    const pdh = Math.max(...previousDay.map((bar) => bar.high));
    const pdl = Math.min(...previousDay.map((bar) => bar.low));
    const currentPrice = ohlcv[ohlcv.length - 1].close;

    // Determine which level is closer
    const distanceToHigh = Math.abs(currentPrice - pdh) / currentPrice;
    const distanceToLow = Math.abs(currentPrice - pdl) / currentPrice;

    // Only set trap if within 2% of a level
    if (distanceToHigh < 0.02 && distanceToHigh < distanceToLow) {
      // Close to PDH, set breakout trap
      return {
        symbol,
        triggerPrice: pdh * 1.001, // +0.1% above PDH
        direction: "LONG",
        trapType: "DAILY_LEVEL",
        confidence: 85,
        leverage: 12,
        estimatedCascadeSize: 0.03,
        activated: false,
      };
    } else if (distanceToLow < 0.02) {
      // Close to PDL, set breakdown trap
      return {
        symbol,
        triggerPrice: pdl * 0.999, // -0.1% below PDL
        direction: "SHORT",
        trapType: "DAILY_LEVEL",
        confidence: 85,
        leverage: 12,
        estimatedCascadeSize: 0.03,
        activated: false,
      };
    }

    return null; // Not close to any daily level
  }

  /**
   * Calculate Bollinger Breakout tripwire
   *
   * Identifies Bollinger Band squeeze (compression) and sets breakout
   * triggers at upper/lower bands
   *
   * @param ohlcv - OHLCV data (minimum 92 bars for 72-hour history)
   * @param symbol - Ticker symbol
   * @returns Tripwire or null if no squeeze detected
   */
  static calcBollingerBreakout(
    ohlcv: OHLCV[],
    symbol: string = "",
  ): Tripwire | null {
    const period = 20;

    // Need at least 92 bars (20 for calculation + 72 for historical comparison)
    if (ohlcv.length < 92) {
      return null;
    }

    const closes = new Float64Array(ohlcv.map((bar) => bar.close));

    // Calculate current SMA and standard deviation
    const sma = TripwireCalculators.calcSMA(closes, period);
    const stdDev = TripwireCalculators.calcStdDev(closes, period);

    // Calculate Bollinger Bands
    const upperBand = sma + (stdDev * 2);
    const lowerBand = sma - (stdDev * 2);

    // Calculate BB width
    const bbWidth = (upperBand - lowerBand) / sma;

    // Calculate historical BB widths (72 hours = 72 bars for 1h)
    const historicalWidths = new Float64Array(72);
    for (let i = 0; i < 72; i++) {
      const startIdx = ohlcv.length - 92 + i;
      const slice = closes.slice(startIdx, startIdx + period);
      const sliceSMA = TripwireCalculators.calcSMA(slice, period);
      const sliceStdDev = TripwireCalculators.calcStdDev(slice, period);
      historicalWidths[i] = (sliceStdDev * 2 * 2) / sliceSMA;
    }

    // Check if current BB width is in bottom 10%
    const sortedWidths = Array.from(historicalWidths).sort((a, b) => a - b);
    const bottom10Pct = sortedWidths[Math.floor(sortedWidths.length * 0.1)];

    if (bbWidth > bottom10Pct) {
      return null; // Not compressed enough
    }

    // Determine direction based on price position relative to SMA
    const currentPrice = closes[closes.length - 1];
    const direction = currentPrice > sma ? "LONG" : "SHORT";

    return {
      symbol,
      triggerPrice: direction === "LONG"
        ? upperBand * 1.001
        : lowerBand * 0.999,
      direction,
      trapType: "BOLLINGER",
      confidence: 90,
      leverage: 15,
      estimatedCascadeSize: 0.04,
      activated: false,
    };
  }

  /**
   * Calculate Simple Moving Average using Float64Array
   *
   * @param data - Price data as Float64Array
   * @param period - SMA period
   * @returns SMA value
   */
  static calcSMA(data: Float64Array, period: number): number {
    if (data.length < period) {
      return 0;
    }

    const slice = data.slice(-period);
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += slice[i];
    }
    return sum / period;
  }

  /**
   * Calculate Standard Deviation using Float64Array
   *
   * @param data - Price data as Float64Array
   * @param period - Period for calculation
   * @returns Standard deviation value
   */
  static calcStdDev(data: Float64Array, period: number): number {
    if (data.length < period) {
      return 0;
    }

    const slice = data.slice(-period);
    const mean = TripwireCalculators.calcSMA(data, period);

    let sumSquaredDiffs = 0;
    for (let i = 0; i < slice.length; i++) {
      const diff = slice[i] - mean;
      sumSquaredDiffs += diff * diff;
    }

    const variance = sumSquaredDiffs / period;
    return Math.sqrt(variance);
  }

  /**
   * Calculate ADX (Average Directional Index)
   *
   * Used to filter counter-trend trades.
   * If ADX > 25, the trend is strong.
   * Counter-trend traps should be VETOED in high ADX regimes.
   *
   * @param ohlcv - OHLCV data (need at least 2x period history)
   * @param period - ADX period (default 14)
   * @returns ADX value (0-100)
   */
  static calcADX(ohlcv: OHLCV[], period: number = 14): number {
    if (ohlcv.length < period * 2) return 0;

    const tr = new Float64Array(ohlcv.length);
    const plusDM = new Float64Array(ohlcv.length);
    const minusDM = new Float64Array(ohlcv.length);

    // 1. Calculate TR, +DM, -DM for each bar
    for (let i = 1; i < ohlcv.length; i++) {
      const high = ohlcv[i].high;
      const low = ohlcv[i].low;
      const prevClose = ohlcv[i - 1].close;
      const prevHigh = ohlcv[i - 1].high;
      const prevLow = ohlcv[i - 1].low;

      // True Range
      tr[i] = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose),
      );

      // Directional Movement
      const upMove = high - prevHigh;
      const downMove = prevLow - low;

      plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
      minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
    }

    // 2. Smoothed TR, +DM, -DM (Wilder's Smoothing)
    // First value is simple sum
    let smoothTR = 0;
    let smoothPlusDM = 0;
    let smoothMinusDM = 0;

    for (let i = 1; i <= period; i++) {
      smoothTR += tr[i];
      smoothPlusDM += plusDM[i];
      smoothMinusDM += minusDM[i];
    }

    // Subsequent values
    const dxValues: number[] = [];

    for (let i = period + 1; i < ohlcv.length; i++) {
      smoothTR = smoothTR - (smoothTR / period) + tr[i];
      smoothPlusDM = smoothPlusDM - (smoothPlusDM / period) + plusDM[i];
      smoothMinusDM = smoothMinusDM - (smoothMinusDM / period) + minusDM[i];

      // 3. Calculate +DI and -DI
      const plusDI = (smoothPlusDM / smoothTR) * 100;
      const minusDI = (smoothMinusDM / smoothTR) * 100;

      // 4. Calculate DX
      const diSum = plusDI + minusDI;
      const dx = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;
      dxValues.push(dx);
    }

    // 5. Calculate ADX (SMA of DX)
    if (dxValues.length < period) return 0;

    // First ADX is simple average of first 'period' DX values
    // But standard ADX is often Wilder's smoothed too.
    // For simplicity and standard usage, simple average of last 'period' DX is often sufficient proxy
    // or we can do wilder's smoothing on DX too. Let's do simple SMA of last 14 DX for stability.

    let sumDX = 0;
    const recentDX = dxValues.slice(-period);
    for (const val of recentDX) sumDX += val;

    return sumDX / recentDX.length;
  }
}
