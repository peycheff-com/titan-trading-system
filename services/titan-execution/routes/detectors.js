/**
 * Detector API Routes
 * 
 * Provides API endpoints for running Phase 1 detectors.
 * Results are cached with 60-second TTL.
 * 
 * Requirements: 15.4-15.7 - Add detector API endpoint
 */

import { ResponseFactory } from '../utils/responseFactory.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Register detector routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} dependencies - Route dependencies
 */
export function registerDetectorRoutes(fastify, dependencies) {
  const { detectorRegistry, logger } = dependencies;

  /**
   * Get list of available detectors
   * GET /detectors
   */
  fastify.get('/detectors', asyncHandler(async (request, reply) => {
    const detectors = detectorRegistry.getRegisteredDetectors();
    const cacheStats = detectorRegistry.getCacheStats();

    return ResponseFactory.success({
      detectors,
      count: detectors.length,
      cache: cacheStats,
      timestamp: new Date().toISOString(),
    });
  }, logger));

  /**
   * Run a specific detector
   * POST /detectors/run
   * 
   * Body: {
   *   detector: string,  // Detector name
   *   symbol: string,    // Trading symbol
   *   useCache?: boolean // Whether to use cached results (default: true)
   * }
   * 
   * Requirements: 15.4-15.7
   */
  fastify.post('/detectors/run', asyncHandler(async (request, reply) => {
    const { detector, symbol, useCache = true } = request.body || {};

    // Validate required fields
    if (!detector || typeof detector !== 'string') {
      return ResponseFactory.error('detector is required and must be a string', 400);
    }

    if (!symbol || typeof symbol !== 'string') {
      return ResponseFactory.error('symbol is required and must be a string', 400);
    }

    // Validate detector exists
    const availableDetectors = detectorRegistry.getRegisteredDetectors();
    if (!availableDetectors.includes(detector)) {
      return ResponseFactory.error(
        `Unknown detector '${detector}'. Available: ${availableDetectors.join(', ')}`,
        400
      );
    }

    logger.info({
      detector,
      symbol,
      useCache,
    }, 'Running detector');

    try {
      const result = await detectorRegistry.run(detector, symbol, useCache);

      return ResponseFactory.success({
        detector: result.detector,
        symbol: result.symbol,
        tripwire: result.tripwire,
        detected: result.tripwire !== null,
        cached: result.cached,
        timestamp: new Date(result.timestamp).toISOString(),
      });
    } catch (error) {
      logger.error({ detector, symbol, error: error.message }, 'Detector run failed');
      return ResponseFactory.error(`Detector error: ${error.message}`, 500);
    }
  }, logger));

  /**
   * Run all detectors for a symbol
   * POST /detectors/run-all
   * 
   * Body: {
   *   symbol: string,    // Trading symbol
   *   useCache?: boolean // Whether to use cached results (default: true)
   * }
   */
  fastify.post('/detectors/run-all', asyncHandler(async (request, reply) => {
    const { symbol, useCache = true } = request.body || {};

    if (!symbol || typeof symbol !== 'string') {
      return ResponseFactory.error('symbol is required and must be a string', 400);
    }

    logger.info({
      symbol,
      useCache,
    }, 'Running all detectors');

    try {
      const results = await detectorRegistry.runAll(symbol, useCache);

      // Filter to only detected tripwires
      const detected = results.filter(r => r.tripwire !== null);

      return ResponseFactory.success({
        symbol,
        results,
        detected_count: detected.length,
        total_count: results.length,
        tripwires: detected.map(r => r.tripwire),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ symbol, error: error.message }, 'Run all detectors failed');
      return ResponseFactory.error(`Detector error: ${error.message}`, 500);
    }
  }, logger));

  /**
   * Clear detector cache
   * POST /detectors/cache/clear
   * 
   * Body: {
   *   detector?: string, // Optional: specific detector
   *   symbol?: string    // Optional: specific symbol
   * }
   */
  fastify.post('/detectors/cache/clear', asyncHandler(async (request, reply) => {
    const { detector, symbol } = request.body || {};

    detectorRegistry.clearCache(detector, symbol);

    logger.info({
      detector: detector || 'all',
      symbol: symbol || 'all',
    }, 'Detector cache cleared');

    return ResponseFactory.success({
      message: 'Cache cleared',
      detector: detector || 'all',
      symbol: symbol || 'all',
      timestamp: new Date().toISOString(),
    });
  }, logger));

  /**
   * Get cache statistics
   * GET /detectors/cache/stats
   */
  fastify.get('/detectors/cache/stats', asyncHandler(async (request, reply) => {
    const stats = detectorRegistry.getCacheStats();

    return ResponseFactory.success({
      ...stats,
      timestamp: new Date().toISOString(),
    });
  }, logger));
}
