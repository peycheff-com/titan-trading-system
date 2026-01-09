/**
 * Calculator API Routes
 * 
 * Provides API endpoints for Phase 1 calculators.
 * Results are cached with 60-second TTL for tripwires.
 * 
 * Requirements: 16.3-16.5 - Add calculator API endpoints
 */

import { ResponseFactory } from '../utils/responseFactory.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const TRIPWIRE_CACHE_TTL_MS = 60000; // 60 seconds

/**
 * Register calculator routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} dependencies - Route dependencies
 */
export function registerCalculatorRoutes(fastify, dependencies) {
  const { cvdCalculator, positionSizeCalculator, velocityCalculator, tripwireCalculator, logger } = dependencies;

  // Cache for tripwire results
  const tripwireCache = new Map();

  /**
   * Calculate CVD (Cumulative Volume Delta)
   * POST /calculators/cvd
   * 
   * Body: {
   *   symbol: string,
   *   windowSeconds: number,
   *   offsetSeconds?: number
   * }
   */
  fastify.post('/calculators/cvd', asyncHandler(async (request, reply) => {
    const { symbol, windowSeconds, offsetSeconds = 0 } = request.body || {};

    if (!symbol || typeof symbol !== 'string') {
      return ResponseFactory.error('symbol is required and must be a string', 400);
    }

    if (typeof windowSeconds !== 'number' || windowSeconds <= 0) {
      return ResponseFactory.error('windowSeconds is required and must be a positive number', 400);
    }

    try {
      const cvd = await cvdCalculator.calcCVD(symbol, windowSeconds, offsetSeconds);
      const tradeCount = cvdCalculator.getTradeCount(symbol);

      return ResponseFactory.success({
        symbol,
        cvd,
        windowSeconds,
        offsetSeconds,
        tradeCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ symbol, error: error.message }, 'CVD calculation failed');
      return ResponseFactory.error(`CVD calculation error: ${error.message}`, 500);
    }
  }, logger));

  /**
   * Calculate tripwire levels
   * POST /calculators/tripwires
   * 
   * Body: {
   *   symbol: string,
   *   bbPeriod?: number,
   *   bbStdDev?: number,
   *   useCache?: boolean
   * }
   */
  fastify.post('/calculators/tripwires', asyncHandler(async (request, reply) => {
    const { symbol, bbPeriod = 20, bbStdDev = 2, useCache = true } = request.body || {};

    if (!symbol || typeof symbol !== 'string') {
      return ResponseFactory.error('symbol is required and must be a string', 400);
    }

    // Check cache
    const cacheKey = `${symbol}:${bbPeriod}:${bbStdDev}`;
    if (useCache) {
      const cached = tripwireCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < TRIPWIRE_CACHE_TTL_MS) {
        return ResponseFactory.success({
          ...cached.result,
          cached: true,
        });
      }
    }

    try {
      const result = await tripwireCalculator.calcTripwires(symbol, { bbPeriod, bbStdDev });

      // Cache result
      tripwireCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
      });

      return ResponseFactory.success({
        ...result,
        cached: false,
      });
    } catch (error) {
      logger.error({ symbol, error: error.message }, 'Tripwire calculation failed');
      return ResponseFactory.error(`Tripwire calculation error: ${error.message}`, 500);
    }
  }, logger));

  /**
   * Calculate price velocity
   * POST /calculators/velocity
   * 
   * Body: {
   *   symbol: string,
   *   windowMs: number
   * }
   */
  fastify.post('/calculators/velocity', asyncHandler(async (request, reply) => {
    const { symbol, windowMs } = request.body || {};

    if (!symbol || typeof symbol !== 'string') {
      return ResponseFactory.error('symbol is required and must be a string', 400);
    }

    if (typeof windowMs !== 'number' || windowMs <= 0) {
      return ResponseFactory.error('windowMs is required and must be a positive number', 400);
    }

    try {
      const velocity = velocityCalculator.calcVelocity(symbol, windowMs);
      const priceChangePercent = velocityCalculator.calcPriceChangePercent(symbol, windowMs);
      const lastPrice = velocityCalculator.getLastPrice(symbol);

      return ResponseFactory.success({
        symbol,
        velocity,
        priceChangePercent,
        lastPrice,
        windowMs,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ symbol, error: error.message }, 'Velocity calculation failed');
      return ResponseFactory.error(`Velocity calculation error: ${error.message}`, 500);
    }
  }, logger));

  /**
   * Calculate position size
   * POST /calculators/position-size
   * 
   * Body: {
   *   equity: number,
   *   confidence: number,
   *   leverage: number,
   *   stopLossPercent: number,
   *   targetPercent: number,
   *   maxPositionSizePercent: number,
   *   currentPrice?: number
   * }
   */
  fastify.post('/calculators/position-size', asyncHandler(async (request, reply) => {
    const {
      equity,
      confidence,
      leverage,
      stopLossPercent,
      targetPercent,
      maxPositionSizePercent,
      currentPrice,
    } = request.body || {};

    // Validate required fields
    if (typeof equity !== 'number' || equity <= 0) {
      return ResponseFactory.error('equity is required and must be a positive number', 400);
    }

    if (typeof confidence !== 'number' || confidence <= 0 || confidence > 100) {
      return ResponseFactory.error('confidence is required and must be between 0 and 100', 400);
    }

    if (typeof leverage !== 'number' || leverage <= 0) {
      return ResponseFactory.error('leverage is required and must be a positive number', 400);
    }

    if (typeof stopLossPercent !== 'number' || stopLossPercent <= 0) {
      return ResponseFactory.error('stopLossPercent is required and must be a positive number', 400);
    }

    if (typeof targetPercent !== 'number' || targetPercent <= 0) {
      return ResponseFactory.error('targetPercent is required and must be a positive number', 400);
    }

    if (typeof maxPositionSizePercent !== 'number' || maxPositionSizePercent <= 0) {
      return ResponseFactory.error('maxPositionSizePercent is required and must be a positive number', 400);
    }

    try {
      const params = {
        equity,
        confidence,
        leverage,
        stopLossPercent,
        targetPercent,
        maxPositionSizePercent,
      };

      const positionSize = positionSizeCalculator.calcPositionSize(params);
      const { marginRequired, notionalSize } = positionSizeCalculator.calcPositionSizeWithLeverage(params);
      const kellyPercent = positionSizeCalculator.getKellyPercent(confidence, stopLossPercent, targetPercent);
      const safeKellyPercent = positionSizeCalculator.getSafeKellyPercent(confidence, stopLossPercent, targetPercent);

      const result = {
        positionSize,
        marginRequired,
        notionalSize,
        kellyPercent: Math.round(kellyPercent * 10000) / 100, // Convert to percentage
        safeKellyPercent: Math.round(safeKellyPercent * 10000) / 100,
        rewardToRisk: targetPercent / stopLossPercent,
        timestamp: new Date().toISOString(),
      };

      // Calculate units if current price provided
      if (currentPrice && currentPrice > 0) {
        result.units = positionSizeCalculator.calcPositionSizeInUnits(params, currentPrice);
        result.currentPrice = currentPrice;
      }

      return ResponseFactory.success(result);
    } catch (error) {
      logger.error({ error: error.message }, 'Position size calculation failed');
      return ResponseFactory.error(`Position size calculation error: ${error.message}`, 500);
    }
  }, logger));

  /**
   * Clear tripwire cache
   * POST /calculators/cache/clear
   */
  fastify.post('/calculators/cache/clear', asyncHandler(async (request, reply) => {
    const { symbol } = request.body || {};

    if (symbol) {
      // Clear cache for specific symbol
      for (const key of tripwireCache.keys()) {
        if (key.startsWith(`${symbol}:`)) {
          tripwireCache.delete(key);
        }
      }
    } else {
      tripwireCache.clear();
    }

    logger.info({ symbol: symbol || 'all' }, 'Calculator cache cleared');

    return ResponseFactory.success({
      message: 'Cache cleared',
      symbol: symbol || 'all',
      timestamp: new Date().toISOString(),
    });
  }, logger));
}
