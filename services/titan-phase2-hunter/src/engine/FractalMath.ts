/**
 * FractalMath Engine - Pure Calculation Functions
 * 
 * Implements Bill Williams fractal detection and market structure analysis
 * using Float64Array for performance optimization.
 * 
 * Core Functions:
 * - detectFractals(): 5-candle pattern detection
 * - detectBOS(): Break of Structure detection
 * - detectMSS(): Market Structure Shift detection
 * - calcDealingRange(): Premium/Discount zone calculation
 * - getTrendState(): BULL/BEAR/RANGE classification
 */

import { OHLCV, Fractal, BOS, MSS, DealingRange, TrendState } from '../types';

export class FractalMath {
  /**
   * Detect Bill Williams fractals using 5-candle pattern
   * A fractal high requires the middle candle's high to be higher than 2 candles on each side
   * A fractal low requires the middle candle's low to be lower than 2 candles on each side
   * 
   * @param candles - OHLCV array (minimum 5 candles required)
   * @returns Array of detected fractals
   */
  static detectFractals(candles: OHLCV[]): Fractal[] {
    const fractals: Fractal[] = [];
    
    // Need at least 5 candles for fractal detection
    if (candles.length < 5) {
      return fractals;
    }
    
    // Use Float64Array for performance optimization
    const highs = new Float64Array(candles.map(c => c.high));
    const lows = new Float64Array(candles.map(c => c.low));
    
    // Start from index 2 (need 2 bars on each side)
    for (let i = 2; i < candles.length - 2; i++) {
      const current = candles[i];
      
      // Check for Swing High (fractal high)
      const isSwingHigh = 
        highs[i] > highs[i - 1] &&
        highs[i] > highs[i - 2] &&
        highs[i] > highs[i + 1] &&
        highs[i] > highs[i + 2];
      
      if (isSwingHigh) {
        fractals.push({
          type: 'HIGH',
          price: highs[i],
          barIndex: i,
          timestamp: current.timestamp,
          confirmed: true
        });
      }
      
      // Check for Swing Low (fractal low)
      const isSwingLow = 
        lows[i] < lows[i - 1] &&
        lows[i] < lows[i - 2] &&
        lows[i] < lows[i + 1] &&
        lows[i] < lows[i + 2];
      
      if (isSwingLow) {
        fractals.push({
          type: 'LOW',
          price: lows[i],
          barIndex: i,
          timestamp: current.timestamp,
          confirmed: true
        });
      }
    }
    
    return fractals;
  }
  
  /**
   * Detect Break of Structure (BOS)
   * BOS occurs when price closes beyond a previous fractal swing point
   * Bullish BOS: Close above last swing high
   * Bearish BOS: Close below last swing low
   * 
   * @param candles - OHLCV array
   * @param fractals - Previously detected fractals
   * @returns Array of BOS events
   */
  static detectBOS(candles: OHLCV[], fractals: Fractal[]): BOS[] {
    const bosEvents: BOS[] = [];
    
    if (candles.length === 0 || fractals.length === 0) {
      return bosEvents;
    }
    
    // Get most recent swing highs and lows
    const recentHighs = fractals.filter(f => f.type === 'HIGH');
    const recentLows = fractals.filter(f => f.type === 'LOW');
    
    if (recentHighs.length === 0 && recentLows.length === 0) {
      return bosEvents;
    }
    
    // Use Float64Array for performance
    const closes = new Float64Array(candles.map(c => c.close));
    
    // Track which fractals have been breached to avoid duplicate BOS events
    const breachedHighs = new Set<number>();
    const breachedLows = new Set<number>();
    
    // Check each candle for BOS
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      
      // Check for bullish BOS against all swing highs
      for (const swingHigh of recentHighs) {
        if (i > swingHigh.barIndex && 
            closes[i] > swingHigh.price && 
            !breachedHighs.has(swingHigh.barIndex)) {
          
          bosEvents.push({
            direction: 'BULLISH',
            price: closes[i],
            barIndex: i,
            timestamp: candle.timestamp,
            fractalsBreached: [swingHigh]
          });
          
          breachedHighs.add(swingHigh.barIndex);
        }
      }
      
      // Check for bearish BOS against all swing lows
      for (const swingLow of recentLows) {
        if (i > swingLow.barIndex && 
            closes[i] < swingLow.price && 
            !breachedLows.has(swingLow.barIndex)) {
          
          bosEvents.push({
            direction: 'BEARISH',
            price: closes[i],
            barIndex: i,
            timestamp: candle.timestamp,
            fractalsBreached: [swingLow]
          });
          
          breachedLows.add(swingLow.barIndex);
        }
      }
    }
    
    return bosEvents;
  }
  
  /**
   * Detect Market Structure Shift (MSS)
   * MSS occurs when BOS happens in the opposite direction of the prevailing trend
   * This signals a potential trend reversal
   * 
   * @param candles - OHLCV array
   * @param fractals - Previously detected fractals
   * @param prevTrend - Previous trend state
   * @returns MSS event or null
   */
  static detectMSS(candles: OHLCV[], fractals: Fractal[], prevTrend: TrendState): MSS | null {
    const bosEvents = this.detectBOS(candles, fractals);
    
    if (bosEvents.length === 0) {
      return null;
    }
    
    // Get the most recent BOS
    const lastBOS = bosEvents[bosEvents.length - 1];
    
    // MSS occurs when BOS direction opposes prevailing trend
    if (prevTrend === 'BULL' && lastBOS.direction === 'BEARISH') {
      return {
        direction: 'BEARISH',
        price: lastBOS.price,
        barIndex: lastBOS.barIndex,
        timestamp: lastBOS.timestamp,
        significance: 80 // High significance for trend reversal
      };
    }
    
    if (prevTrend === 'BEAR' && lastBOS.direction === 'BULLISH') {
      return {
        direction: 'BULLISH',
        price: lastBOS.price,
        barIndex: lastBOS.barIndex,
        timestamp: lastBOS.timestamp,
        significance: 80 // High significance for trend reversal
      };
    }
    
    return null;
  }
  
  /**
   * Calculate Dealing Range with Premium/Discount zones
   * Dealing Range is the current trading range between swing high and swing low
   * Premium Zone: Above 0.5 Fibonacci (expensive, sell zone for shorts)
   * Discount Zone: Below 0.5 Fibonacci (cheap, buy zone for longs)
   * 
   * @param fractals - Array of fractals
   * @returns DealingRange with premium/discount thresholds
   */
  static calcDealingRange(fractals: Fractal[]): DealingRange {
    // Get most recent swing high and low
    const recentHighs = fractals.filter(f => f.type === 'HIGH');
    const recentLows = fractals.filter(f => f.type === 'LOW');
    
    if (recentHighs.length === 0 || recentLows.length === 0) {
      throw new Error('Insufficient fractals to calculate dealing range');
    }
    
    // Use Float64Array for calculations
    const highPrices = new Float64Array(recentHighs.map(f => f.price));
    const lowPrices = new Float64Array(recentLows.map(f => f.price));
    
    // Find the highest high and lowest low
    let high = highPrices[0];
    let low = lowPrices[0];
    
    for (let i = 1; i < highPrices.length; i++) {
      if (highPrices[i] > high) high = highPrices[i];
    }
    
    for (let i = 1; i < lowPrices.length; i++) {
      if (lowPrices[i] < low) low = lowPrices[i];
    }
    
    const range = high - low;
    const midpoint = low + (range * 0.5); // 0.5 Fibonacci level (Equilibrium)
    
    return {
      high,
      low,
      midpoint,
      premiumThreshold: midpoint, // Above 0.5 = Premium
      discountThreshold: midpoint, // Below 0.5 = Discount
      range
    };
  }
  
  /**
   * Determine trend state based on BOS pattern
   * BULL: Consistent bullish BOS (Higher Highs, Higher Lows)
   * BEAR: Consistent bearish BOS (Lower Highs, Lower Lows)
   * RANGE: Mixed BOS or insufficient data
   * 
   * @param bos - Array of BOS events
   * @returns Current trend state
   */
  static getTrendState(bos: BOS[]): TrendState {
    if (bos.length < 2) {
      return 'RANGE';
    }
    
    // Get last 3 BOS events for trend analysis
    const recentBOS = bos.slice(-3);
    
    // Check for consistent bullish BOS
    const bullishCount = recentBOS.filter(b => b.direction === 'BULLISH').length;
    const bearishCount = recentBOS.filter(b => b.direction === 'BEARISH').length;
    
    // Strong bullish trend: majority bullish BOS
    if (bullishCount >= 2 && bullishCount > bearishCount) {
      return 'BULL';
    }
    
    // Strong bearish trend: majority bearish BOS
    if (bearishCount >= 2 && bearishCount > bullishCount) {
      return 'BEAR';
    }
    
    // Mixed signals or equal counts = Range
    return 'RANGE';
  }
  
  /**
   * Helper method to validate input data
   * Ensures OHLCV data is properly formatted and sufficient
   * 
   * @param candles - OHLCV array to validate
   * @param minLength - Minimum required length
   * @returns true if valid, throws error if invalid
   */
  static validateCandles(candles: OHLCV[], minLength: number = 5): boolean {
    if (!Array.isArray(candles)) {
      throw new Error('Candles must be an array');
    }
    
    if (candles.length < minLength) {
      throw new Error(`Insufficient candles: need at least ${minLength}, got ${candles.length}`);
    }
    
    // Validate each candle has required properties
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      if (!candle || typeof candle.high !== 'number' || typeof candle.low !== 'number' || 
          typeof candle.close !== 'number' || typeof candle.timestamp !== 'number') {
        throw new Error(`Invalid candle at index ${i}: missing required properties`);
      }
      
      // Validate OHLC relationships
      if (candle.high < candle.low) {
        throw new Error(`Invalid candle at index ${i}: high (${candle.high}) < low (${candle.low})`);
      }
      
      if (candle.close > candle.high || candle.close < candle.low) {
        throw new Error(`Invalid candle at index ${i}: close (${candle.close}) outside high-low range`);
      }
    }
    
    return true;
  }
  
  /**
   * Helper method to get the most recent fractal of a specific type
   * 
   * @param fractals - Array of fractals
   * @param type - 'HIGH' or 'LOW'
   * @returns Most recent fractal of specified type or null
   */
  static getLastFractal(fractals: Fractal[], type: 'HIGH' | 'LOW'): Fractal | null {
    const filtered = fractals.filter(f => f.type === type);
    return filtered.length > 0 ? filtered[filtered.length - 1] : null;
  }
  
  /**
   * Helper method to calculate price location within dealing range
   * 
   * @param price - Current price
   * @param dealingRange - Dealing range object
   * @returns 'PREMIUM', 'DISCOUNT', or 'EQUILIBRIUM'
   */
  static getPriceLocation(price: number, dealingRange: DealingRange): 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM' {
    const tolerance = dealingRange.range * 0.05; // 5% tolerance around midpoint
    
    if (price > dealingRange.premiumThreshold + tolerance) {
      return 'PREMIUM';
    } else if (price < dealingRange.discountThreshold - tolerance) {
      return 'DISCOUNT';
    } else {
      return 'EQUILIBRIUM';
    }
  }
}