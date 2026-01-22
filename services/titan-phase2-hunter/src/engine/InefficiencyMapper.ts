/**
 * InefficiencyMapper - POI Detection Engine
 *
 * Identifies Fair Value Gaps, Order Blocks, and Liquidity Pools
 * as high-probability entry zones for institutional rebalancing.
 *
 * Requirements: 3.1-3.7 (Inefficiency Mapper), 10.1-10.7 (Liquidity Pool Detection)
 */

import { BOS, Fractal, FVG, LiquidityPool, OHLCV, OrderBlock, POI } from '../types';

export class InefficiencyMapper {
  /**
   * Detect Fair Value Gaps (3-candle imbalance)
   *
   * A Fair Value Gap occurs when there's a price gap between candles,
   * leaving unfilled orders that act as price magnets.
   *
   * @param candles OHLCV data array
   * @returns Array of detected FVGs
   */
  detectFVG(candles: OHLCV[]): FVG[] {
    const fvgs: FVG[] = [];

    // Need at least 3 candles for FVG detection
    if (candles.length < 3) return fvgs;

    // eslint-disable-next-line functional/no-let
    for (let i = 0; i < candles.length - 2; i++) {
      const candle1 = candles[i];
      const candle2 = candles[i + 1];
      const candle3 = candles[i + 2];

      // Bullish FVG: Candle 1 high < Candle 3 low (gap up)
      if (candle1.high < candle3.low) {
        const top = candle3.low;
        const bottom = candle1.high;
        const midpoint = (top + bottom) / 2;

        // eslint-disable-next-line functional/immutable-data
        fvgs.push({
          type: 'BULLISH',
          top,
          bottom,
          midpoint,
          barIndex: i + 2,
          timestamp: candle3.timestamp,
          mitigated: false,
          fillPercent: 0,
        });
      }

      // Bearish FVG: Candle 1 low > Candle 3 high (gap down)
      if (candle1.low > candle3.high) {
        const top = candle1.low;
        const bottom = candle3.high;
        const midpoint = (top + bottom) / 2;

        // eslint-disable-next-line functional/immutable-data
        fvgs.push({
          type: 'BEARISH',
          top,
          bottom,
          midpoint,
          barIndex: i + 2,
          timestamp: candle3.timestamp,
          mitigated: false,
          fillPercent: 0,
        });
      }
    }

    return fvgs;
  }

  /**
   * Detect Order Blocks (last opposite candle before BOS)
   *
   * Order Blocks represent institutional accumulation/distribution zones
   * where large orders were placed before a Break of Structure.
   *
   * @param candles OHLCV data array
   * @param bos Array of Break of Structure events
   * @returns Array of detected Order Blocks
   */
  detectOrderBlock(candles: OHLCV[], bos: BOS[]): OrderBlock[] {
    const orderBlocks: OrderBlock[] = [];

    for (const bosEvent of bos) {
      // Find the candle just before BOS
      const bosBarIndex = bosEvent.barIndex;

      if (bosBarIndex < 1) continue;

      // For Bullish BOS, find last down-candle (red candle)
      if (bosEvent.direction === 'BULLISH') {
        // eslint-disable-next-line functional/no-let
        for (let i = bosBarIndex - 1; i >= 0; i--) {
          const candle = candles[i];
          if (!candle) continue;
          const isDownCandle = candle.close < candle.open;

          if (isDownCandle) {
            // Calculate initial confidence based on candle size and volume
            const candleSize = Math.abs(candle.close - candle.open);
            const avgVolume = this.calculateAverageVolume(candles, i, 20);
            const volumeRatio = candle.volume / avgVolume;
            const baseConfidence = Math.min(90, 60 + volumeRatio * 15);

            // eslint-disable-next-line functional/immutable-data
            orderBlocks.push({
              type: 'BULLISH',
              high: candle.high,
              low: candle.low,
              barIndex: i,
              timestamp: candle.timestamp,
              mitigated: false,
              confidence: baseConfidence,
            });
            break; // Only take the last one
          }
        }
      }

      // For Bearish BOS, find last up-candle (green candle)
      if (bosEvent.direction === 'BEARISH') {
        // eslint-disable-next-line functional/no-let
        for (let i = bosBarIndex - 1; i >= 0; i--) {
          const candle = candles[i];
          if (!candle) continue;
          const isUpCandle = candle.close > candle.open;

          if (isUpCandle) {
            // Calculate initial confidence based on candle size and volume
            const candleSize = Math.abs(candle.close - candle.open);
            const avgVolume = this.calculateAverageVolume(candles, i, 20);
            const volumeRatio = candle.volume / avgVolume;
            const baseConfidence = Math.min(90, 60 + volumeRatio * 15);

            // eslint-disable-next-line functional/immutable-data
            orderBlocks.push({
              type: 'BEARISH',
              high: candle.high,
              low: candle.low,
              barIndex: i,
              timestamp: candle.timestamp,
              mitigated: false,
              confidence: baseConfidence,
            });
            break; // Only take the last one
          }
        }
      }
    }

    return orderBlocks;
  }

  /**
   * Detect Liquidity Pools using volume profile at fractals
   *
   * Liquidity Pools are estimated clusters of stop losses at old swing points,
   * calculated using volume profile and time decay.
   *
   * @param candles OHLCV data array
   * @param fractals Array of fractal swing points
   * @returns Array of detected Liquidity Pools
   */
  detectLiquidityPools(candles: OHLCV[], fractals: Fractal[]): LiquidityPool[] {
    const pools: LiquidityPool[] = [];

    for (const fractal of fractals) {
      // Get the candle at fractal bar index
      const candle = candles[fractal.barIndex];
      if (!candle) continue;

      // Calculate pool strength based on volume and age
      const age = Date.now() - fractal.timestamp;
      const ageHours = age / (1000 * 60 * 60);

      // Age factor: Decay over 72 hours (3 days)
      const ageFactor = Math.max(0, 100 - (ageHours / 72) * 50);

      // Volume factor: Compare to average volume
      const avgVolume = this.calculateAverageVolume(candles, fractal.barIndex, 50);
      const volumeFactor = Math.min(100, (candle.volume / avgVolume) * 50);

      // Combine factors with weights: age 60%, volume 40%
      const strength = ageFactor * 0.6 + volumeFactor * 0.4;

      // Only create pools with meaningful strength (> 20)
      if (strength > 20) {
        // eslint-disable-next-line functional/immutable-data
        pools.push({
          type: fractal.type === 'HIGH' ? 'HIGH' : 'LOW',
          price: fractal.price,
          strength,
          barIndex: fractal.barIndex,
          timestamp: fractal.timestamp,
          swept: false,
        });
      }
    }

    // Merge nearby pools (within 1% price range)
    return this.mergeLiquidityPools(pools);
  }

  /**
   * Validate POI (check if mitigated)
   *
   * Determines if a Point of Interest is still valid or has been mitigated
   * by price action. Once mitigated, POI remains invalid permanently.
   *
   * @param poi Point of Interest to validate
   * @param currentPrice Current market price
   * @returns true if POI is still valid, false if mitigated
   */
  validatePOI(poi: POI, currentPrice: number): boolean {
    // Check if already marked as mitigated/swept
    if ('mitigated' in poi && poi.mitigated) return false;
    if ('swept' in poi && poi.swept) return false;

    // FVG validation
    if ('midpoint' in poi) {
      const fvg = poi as FVG;

      // Bullish FVG is mitigated if price fills the gap (goes below bottom)
      if (fvg.type === 'BULLISH' && currentPrice <= fvg.bottom) {
        // eslint-disable-next-line functional/immutable-data
        (fvg as any).mitigated = true;
        return false;
      }

      // Bearish FVG is mitigated if price fills the gap (goes above top)
      if (fvg.type === 'BEARISH' && currentPrice >= fvg.top) {
        // eslint-disable-next-line functional/immutable-data
        (fvg as any).mitigated = true;
        return false;
      }

      // Update fill percentage for partial mitigation
      if (fvg.type === 'BULLISH') {
        const fillPercent = Math.max(
          0,
          Math.min(100, ((fvg.top - currentPrice) / (fvg.top - fvg.bottom)) * 100)
        );
        // eslint-disable-next-line functional/immutable-data
        (fvg as any).fillPercent = fillPercent;
      } else {
        const fillPercent = Math.max(
          0,
          Math.min(100, ((currentPrice - fvg.bottom) / (fvg.top - fvg.bottom)) * 100)
        );
        // eslint-disable-next-line functional/immutable-data
        (fvg as any).fillPercent = fillPercent;
      }
    }

    // Order Block validation
    if ('high' in poi && 'low' in poi && !('midpoint' in poi)) {
      const ob = poi as OrderBlock;

      // Bullish OB is mitigated if price closes below the low
      if (ob.type === 'BULLISH' && currentPrice < ob.low) {
        // eslint-disable-next-line functional/immutable-data
        (ob as any).mitigated = true;
        return false;
      }

      // Bearish OB is mitigated if price closes above the high
      if (ob.type === 'BEARISH' && currentPrice > ob.high) {
        // eslint-disable-next-line functional/immutable-data
        (ob as any).mitigated = true;
        return false;
      }

      // Apply age decay to confidence
      const age = Date.now() - ob.timestamp;
      const ageHours = age / (1000 * 60 * 60);
      const decayFactor = Math.max(0.3, 1 - ageHours / 168); // Decay over 1 week
      // eslint-disable-next-line functional/immutable-data
      (ob as any).confidence = ob.confidence * decayFactor;
    }

    // Liquidity Pool validation
    if ('strength' in poi && 'price' in poi && !('high' in poi)) {
      const pool = poi as LiquidityPool;

      // Pool is swept if price moves through it significantly
      const sweepThreshold = 0.001; // 0.1% threshold

      if (pool.type === 'HIGH' && currentPrice > pool.price * (1 + sweepThreshold)) {
        // eslint-disable-next-line functional/immutable-data
        (pool as any).swept = true;
        return false;
      }

      if (pool.type === 'LOW' && currentPrice < pool.price * (1 - sweepThreshold)) {
        // eslint-disable-next-line functional/immutable-data
        (pool as any).swept = true;
        return false;
      }

      // Apply age decay to strength
      const age = Date.now() - pool.timestamp;
      const ageHours = age / (1000 * 60 * 60);
      const decayFactor = Math.max(0.2, 1 - ageHours / 72); // Decay over 3 days
      // eslint-disable-next-line functional/immutable-data
      (pool as any).strength = pool.strength * decayFactor;
    }

    return true;
  }

  /**
   * Calculate average volume over a specified period
   *
   * @param candles OHLCV data array
   * @param index Current index
   * @param period Number of periods to average
   * @returns Average volume
   */
  private calculateAverageVolume(candles: OHLCV[], index: number, period: number): number {
    const start = Math.max(0, index - period + 1);
    const end = Math.min(candles.length, index + 1);

    // eslint-disable-next-line functional/no-let
    let totalVolume = 0;
    // eslint-disable-next-line functional/no-let
    let count = 0;

    // eslint-disable-next-line functional/no-let
    for (let i = start; i < end; i++) {
      totalVolume += candles[i].volume;
      count++;
    }

    return count > 0 ? totalVolume / count : 1;
  }

  /**
   * Merge nearby liquidity pools to avoid clustering
   *
   * @param pools Array of liquidity pools
   * @returns Merged array of liquidity pools
   */
  private mergeLiquidityPools(pools: LiquidityPool[]): LiquidityPool[] {
    if (pools.length <= 1) return pools;

    const merged: LiquidityPool[] = [];
    const processed = new Set<number>();

    // eslint-disable-next-line functional/no-let
    for (let i = 0; i < pools.length; i++) {
      if (processed.has(i)) continue;

      const pool = pools[i];
      const nearbyPools: LiquidityPool[] = [pool];
      // eslint-disable-next-line functional/immutable-data
      processed.add(i);

      // Find nearby pools (within 1% price range)
      // eslint-disable-next-line functional/no-let
      for (let j = i + 1; j < pools.length; j++) {
        if (processed.has(j)) continue;

        const otherPool = pools[j];
        const priceDiff = Math.abs(pool.price - otherPool.price) / pool.price;

        if (priceDiff <= 0.01 && pool.type === otherPool.type) {
          // eslint-disable-next-line functional/immutable-data
          nearbyPools.push(otherPool);
          // eslint-disable-next-line functional/immutable-data
          processed.add(j);
        }
      }

      // Merge nearby pools
      if (nearbyPools.length > 1) {
        const totalStrength = nearbyPools.reduce((sum, p) => sum + p.strength, 0);
        const avgPrice = nearbyPools.reduce((sum, p) => sum + p.price, 0) / nearbyPools.length;
        const oldestTimestamp = Math.min(...nearbyPools.map(p => p.timestamp));
        const oldestBarIndex =
          nearbyPools.find(p => p.timestamp === oldestTimestamp)?.barIndex || pool.barIndex;

        // eslint-disable-next-line functional/immutable-data
        merged.push({
          type: pool.type,
          price: avgPrice,
          strength: totalStrength,
          barIndex: oldestBarIndex,
          timestamp: oldestTimestamp,
          swept: false,
        });
      } else {
        // eslint-disable-next-line functional/immutable-data
        merged.push(pool);
      }
    }

    return merged;
  }

  /**
   * Get all POIs for a symbol with confidence scoring
   *
   * @param candles OHLCV data array
   * @param bos Array of Break of Structure events
   * @param fractals Array of fractal swing points
   * @param currentPrice Current market price
   * @returns Object containing all POI types
   */
  getAllPOIs(
    candles: OHLCV[],
    bos: BOS[],
    fractals: Fractal[],
    currentPrice: number
  ): {
    fvgs: FVG[];
    orderBlocks: OrderBlock[];
    liquidityPools: LiquidityPool[];
    validPOIs: POI[];
  } {
    // Detect all POI types
    const fvgs = this.detectFVG(candles);
    const orderBlocks = this.detectOrderBlock(candles, bos);
    const liquidityPools = this.detectLiquidityPools(candles, fractals);

    // Combine all POIs
    const allPOIs: POI[] = [...fvgs, ...orderBlocks, ...liquidityPools];

    // Filter for valid POIs only
    const validPOIs = allPOIs.filter(poi => this.validatePOI(poi, currentPrice));

    return {
      fvgs: fvgs.filter(fvg => this.validatePOI(fvg, currentPrice)),
      orderBlocks: orderBlocks.filter(ob => this.validatePOI(ob, currentPrice)),
      liquidityPools: liquidityPools.filter(pool => this.validatePOI(pool, currentPrice)),
      validPOIs,
    };
  }

  /**
   * Check if multiple POIs align within proximity threshold
   *
   * @param pois Array of POIs to check
   * @param proximityThreshold Proximity threshold (default 0.5%)
   * @returns Array of aligned POI groups
   */
  findAlignedPOIs(pois: POI[], proximityThreshold: number = 0.005): POI[][] {
    const alignedGroups: POI[][] = [];
    const processed = new Set<POI>();

    for (const poi of pois) {
      if (processed.has(poi)) continue;

      const group: POI[] = [poi];
      // eslint-disable-next-line functional/immutable-data
      processed.add(poi);

      const poiPrice = this.getPOIPrice(poi);

      // Find other POIs within proximity
      for (const otherPOI of pois) {
        if (processed.has(otherPOI)) continue;

        const otherPrice = this.getPOIPrice(otherPOI);
        const priceDiff = Math.abs(poiPrice - otherPrice) / poiPrice;

        if (priceDiff <= proximityThreshold) {
          // eslint-disable-next-line functional/immutable-data
          group.push(otherPOI);
          // eslint-disable-next-line functional/immutable-data
          processed.add(otherPOI);
        }
      }

      // Only consider groups with multiple POIs as "aligned"
      if (group.length > 1) {
        // eslint-disable-next-line functional/immutable-data
        alignedGroups.push(group);
      }
    }

    return alignedGroups;
  }

  /**
   * Get the representative price of a POI
   *
   * @param poi Point of Interest
   * @returns Representative price
   */
  private getPOIPrice(poi: POI): number {
    if ('midpoint' in poi) {
      return poi.midpoint; // FVG
    } else if ('high' in poi && 'low' in poi) {
      return (poi.high + poi.low) / 2; // Order Block
    } else {
      return poi.price; // Liquidity Pool
    }
  }
}
