/**
 * Database API Routes
 * Trade history, positions, performance
 */

import { ResponseFactory } from '../utils/responseFactory.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validators } from '../utils/validators.js';
import { CONSTANTS } from '../utils/constants.js';

export function registerDatabaseRoutes(fastify, dependencies) {
  const { databaseManager, logger } = dependencies;

  /**
   * GET /api/trades - Trade History API
   */
  fastify.get('/api/trades', asyncHandler(async (request) => {
    const { start_date, end_date, symbol, phase, limit } = request.query;

    // Build filters object
    const filters = {
      start_date: validators.parseDate(start_date, 'start_date'),
      end_date: validators.parseDate(end_date, 'end_date'),
      symbol: validators.parseSymbol(symbol),
      phase: validators.parsePhase(phase),
      limit: validators.parseLimit(limit, CONSTANTS.DEFAULT_TRADE_LIMIT, 
        CONSTANTS.MIN_TRADE_LIMIT, CONSTANTS.MAX_TRADE_LIMIT),
    };

    // Query database
    const trades = await databaseManager.getTrades(filters);

    return ResponseFactory.success({
      count: trades.length,
      filters: {
        start_date: start_date || null,
        end_date: end_date || null,
        symbol: symbol || null,
        phase: phase || null,
        limit: filters.limit,
      },
      trades: trades,
    });
  }, logger));

  /**
   * GET /api/positions/active - Active Positions API
   */
  fastify.get('/api/positions/active', asyncHandler(async () => {
    const activePositions = await databaseManager.getActivePositions();

    return ResponseFactory.success({
      count: activePositions.length,
      positions: activePositions,
    });
  }, logger));

  /**
   * GET /api/positions/history - Position History API
   */
  fastify.get('/api/positions/history', asyncHandler(async (request) => {
    const { symbol, limit, offset } = request.query;

    // Build filters object
    const filters = {
      active_only: false,
      symbol: validators.parseSymbol(symbol),
      limit: validators.parseLimit(limit, CONSTANTS.DEFAULT_TRADE_LIMIT,
        CONSTANTS.MIN_TRADE_LIMIT, CONSTANTS.MAX_TRADE_LIMIT),
      offset: validators.parseOffset(offset, CONSTANTS.DEFAULT_OFFSET),
    };

    // Query database
    const positions = await databaseManager.getPositions(filters);

    return ResponseFactory.success({
      count: positions.length,
      filters: {
        symbol: symbol || null,
        limit: filters.limit,
        offset: filters.offset,
      },
      positions: positions,
    });
  }, logger));

  /**
   * GET /api/performance/summary - Performance Summary API
   */
  fastify.get('/api/performance/summary', asyncHandler(async () => {
    const summary = await databaseManager.getPerformanceSummary();

    // Calculate additional metrics
    const positions = await databaseManager.getPositions({ active_only: false });
    const closedPositions = positions.filter(p => p.closed_at !== null);
    
    // Sort positions once for performance
    const sortedPositions = closedPositions.sort((a, b) => 
      new Date(a.closed_at) - new Date(b.closed_at)
    );
    
    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = 0;
    let runningPnl = 0;
    
    for (const position of sortedPositions) {
      runningPnl += parseFloat(position.realized_pnl || 0);
      if (runningPnl > peak) {
        peak = runningPnl;
      }
      const drawdown = peak - runningPnl;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Calculate Sharpe ratio (simplified)
    let sharpeRatio = 0;
    if (closedPositions.length > 1) {
      const returns = closedPositions.map(p => parseFloat(p.realized_pnl || 0));
      const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      
      if (stdDev > 0) {
        sharpeRatio = meanReturn / stdDev;
      }
    }

    return ResponseFactory.success({
      summary: {
        ...summary,
        sharpe_ratio: sharpeRatio.toFixed(4),
        max_drawdown: maxDrawdown.toFixed(2),
        closed_positions: closedPositions.length,
      },
    });
  }, logger));
}
