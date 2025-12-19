/**
 * State and Position Routes
 */

import { ResponseFactory } from '../utils/responseFactory.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { CONSTANTS } from '../utils/constants.js';

export function registerStateRoutes(fastify, dependencies) {
  const { shadowState, logger } = dependencies;

  /**
   * Get Shadow State status
   */
  fastify.get('/state', asyncHandler(async () => {
    return shadowState.getStateSnapshot();
  }, logger));

  /**
   * Get all open positions
   */
  fastify.get('/positions', asyncHandler(async () => {
    const positions = shadowState.getAllPositions();
    return ResponseFactory.success({
      positions: Object.fromEntries(positions),
      count: positions.size,
    });
  }, logger));

  /**
   * Get position for a specific symbol
   */
  fastify.get('/positions/:symbol', asyncHandler(async (request, reply) => {
    const { symbol } = request.params;
    const position = shadowState.getPosition(symbol);

    if (!position) {
      return reply.code(404).send({
        error: 'Position not found',
        symbol,
        has_position: false,
      });
    }

    return ResponseFactory.success({
      position,
      has_position: true,
    });
  }, logger));

  /**
   * Get PnL statistics from Shadow State
   */
  fastify.get('/pnl', asyncHandler(async (request) => {
    const windowSize = parseInt(request.query.window || CONSTANTS.DEFAULT_WINDOW_SIZE, 10);
    const stats = shadowState.calculatePnLStats(windowSize);

    return ResponseFactory.success({
      ...stats,
      window_size: windowSize,
    });
  }, logger));

  /**
   * Get recent trade history
   */
  fastify.get('/trades', asyncHandler(async (request) => {
    const count = parseInt(request.query.count || CONSTANTS.DEFAULT_TRADE_COUNT, 10);
    const trades = shadowState.getRecentTrades(count);

    return ResponseFactory.success({
      trades,
      count: trades.length,
    });
  }, logger));
}
