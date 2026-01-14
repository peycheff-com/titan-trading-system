/**
 * Positions API Routes
 * 
 * Handles position queries and emergency flatten.
 * Requirements: 13.1-13.5 (Position Management UI)
 */

import { ResponseFactory } from '../utils/responseFactory.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Position validation utilities
 */
class PositionValidator {
  /**
   * Validate stop loss price for a position
   * @param {Object} position - Position object
   * @param {number} stopLoss - Stop loss price
   * @returns {Object} Validation result
   */
  static validateStopLoss(position, stopLoss) {
    if (typeof stopLoss !== 'number' || stopLoss <= 0) {
      return { valid: false, error: 'Stop loss must be a positive number' };
    }

    if (position.side === 'Buy' && stopLoss >= position.entry_price) {
      return {
        valid: false,
        error: `Stop loss (${stopLoss}) must be below entry price (${position.entry_price}) for long position`
      };
    }

    if (position.side === 'Sell' && stopLoss <= position.entry_price) {
      return {
        valid: false,
        error: `Stop loss (${stopLoss}) must be above entry price (${position.entry_price}) for short position`
      };
    }

    return { valid: true };
  }

  /**
   * Validate take profit price for a position
   * @param {Object} position - Position object
   * @param {number} takeProfit - Take profit price
   * @returns {Object} Validation result
   */
  static validateTakeProfit(position, takeProfit) {
    if (typeof takeProfit !== 'number' || takeProfit <= 0) {
      return { valid: false, error: 'Take profit must be a positive number' };
    }

    if (position.side === 'Buy' && takeProfit <= position.entry_price) {
      return {
        valid: false,
        error: `Take profit (${takeProfit}) must be above entry price (${position.entry_price}) for long position`
      };
    }

    if (position.side === 'Sell' && takeProfit >= position.entry_price) {
      return {
        valid: false,
        error: `Take profit (${takeProfit}) must be below entry price (${position.entry_price}) for short position`
      };
    }

    return { valid: true };
  }

  /**
   * Validate symbol parameter
   * @param {string} symbol - Trading symbol
   * @returns {Object} Validation result
   */
  static validateSymbol(symbol) {
    if (!symbol || typeof symbol !== 'string' || symbol.trim().length === 0) {
      return { valid: false, error: 'Symbol is required and must be a non-empty string' };
    }

    // Basic symbol format validation (alphanumeric + common separators)
    if (!/^[A-Z0-9/_-]+$/i.test(symbol)) {
      return { valid: false, error: 'Symbol contains invalid characters' };
    }

    return { valid: true };
  }
}

/**
 * Register position routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} options - Route options
 */
export async function registerPositionRoutes(fastify, options) {
  const { brokerGateway, shadowState, logger } = options;

  /**
   * Get current positions
   * GET /positions
   */
  fastify.get('/positions', asyncHandler(async (request, reply) => {
    try {
      const positions = await brokerGateway.getPositions();
      
      // Also get Shadow State positions for comparison
      const shadowPositions = shadowState.getAllPositions();
      
      logger.debug({ 
        broker_count: positions.length,
        shadow_count: shadowPositions.size 
      }, 'Retrieved positions');
      
      return ResponseFactory.success({
        positions,
        shadow_positions: Array.from(shadowPositions.values()),
        count: positions.length,
        shadow_count: shadowPositions.size,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to retrieve positions');
      return ResponseFactory.error('Failed to retrieve positions', 500);
    }
  }, logger));

  /**
   * Emergency flatten all positions
   * POST /positions/flatten
   */
  fastify.post('/positions/flatten', asyncHandler(async (request, reply) => {
    try {
      logger.warn({ 
        user_agent: request.headers['user-agent'],
        ip: request.ip 
      }, 'Emergency flatten requested via API');

      const result = await brokerGateway.closeAllPositions();
      
      // Update Shadow State
      shadowState.clearAllPositions();

      logger.warn({
        closed_count: result.closed_count,
        timestamp: new Date().toISOString()
      }, 'Emergency flatten completed');

      return ResponseFactory.success({
        closed_count: result.closed_count,
        message: `Emergency flatten completed: closed ${result.closed_count} position(s)`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Emergency flatten failed');
      return ResponseFactory.error('Emergency flatten failed', 500);
    }
  }, logger));

  /**
   * Close specific position
   * POST /positions/:symbol/close
   * Requirements: 13.1-13.2
   */
  fastify.post('/positions/:symbol/close', asyncHandler(async (request, reply) => {
    const { symbol } = request.params;

    // Validate symbol parameter
    const symbolValidation = PositionValidator.validateSymbol(symbol);
    if (!symbolValidation.valid) {
      return ResponseFactory.error(symbolValidation.error, 400);
    }

    try {
      logger.info({ 
        symbol,
        user_agent: request.headers['user-agent'],
        ip: request.ip 
      }, 'Close position requested via API');

      const result = await brokerGateway.closePosition(symbol);

      if (result.success) {
        // Update Shadow State
        shadowState.removePosition(symbol);
        
        logger.info({
          symbol,
          closed_size: result.closed_size,
          timestamp: new Date().toISOString()
        }, 'Position closed successfully');

        return ResponseFactory.success({
          symbol,
          closed_size: result.closed_size,
          message: `Position ${symbol} closed successfully`,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.warn({ symbol, reason: result.reason }, 'Failed to close position');
        return ResponseFactory.error(result.reason || 'Failed to close position', 400);
      }
    } catch (error) {
      logger.error({ symbol, error: error.message }, 'Error closing position');
      return ResponseFactory.error('Internal error while closing position', 500);
    }
  }, logger));

  /**
   * Modify stop loss and take profit for a position
   * POST /positions/:symbol/modify
   * 
   * Body: {
   *   stop_loss?: number,
   *   take_profit?: number
   * }
   * 
   * Requirements: 13.3-13.5
   */
  fastify.post('/positions/:symbol/modify', asyncHandler(async (request, reply) => {
    const { symbol } = request.params;
    const { stop_loss, take_profit } = request.body || {};

    // Validate symbol parameter
    const symbolValidation = PositionValidator.validateSymbol(symbol);
    if (!symbolValidation.valid) {
      return ResponseFactory.error(symbolValidation.error, 400);
    }

    // Validate that at least one modification is provided
    if (stop_loss === undefined && take_profit === undefined) {
      return ResponseFactory.error('At least one of stop_loss or take_profit must be provided', 400);
    }

    try {
      logger.info({ 
        symbol, 
        stop_loss, 
        take_profit,
        user_agent: request.headers['user-agent'],
        ip: request.ip
      }, 'Modify position requested via API');

      // Get current position to verify it exists
      const positions = await brokerGateway.getPositions();
      const position = positions.find(p => p.symbol === symbol);

      if (!position) {
        return ResponseFactory.error(`No open position found for ${symbol}`, 404);
      }

      // Validate stop loss if provided
      if (stop_loss !== undefined) {
        const stopValidation = PositionValidator.validateStopLoss(position, stop_loss);
        if (!stopValidation.valid) {
          return ResponseFactory.error(stopValidation.error, 400);
        }
      }

      // Validate take profit if provided
      if (take_profit !== undefined) {
        const tpValidation = PositionValidator.validateTakeProfit(position, take_profit);
        if (!tpValidation.valid) {
          return ResponseFactory.error(tpValidation.error, 400);
        }
      }

      const results = {};

      // Modify stop loss if provided
      if (stop_loss !== undefined) {
        const stopResult = await brokerGateway.setStopLoss(symbol, stop_loss);
        if (!stopResult.success) {
          logger.error({ symbol, stop_loss, reason: stopResult.reason }, 'Failed to set stop loss');
          return ResponseFactory.error(`Failed to set stop loss: ${stopResult.reason}`, 400);
        }
        results.stop_loss_set = true;
      }

      // Modify take profit if provided
      if (take_profit !== undefined) {
        const tpResult = await brokerGateway.setTakeProfit(symbol, take_profit);
        if (!tpResult.success) {
          logger.error({ symbol, take_profit, reason: tpResult.reason }, 'Failed to set take profit');
          return ResponseFactory.error(`Failed to set take profit: ${tpResult.reason}`, 400);
        }
        results.take_profit_set = true;
      }

      // Update Shadow State with new stop/target levels
      shadowState.updatePositionStopTarget(symbol, stop_loss, take_profit);

      logger.info({
        symbol,
        stop_loss,
        take_profit,
        results,
        timestamp: new Date().toISOString()
      }, 'Position modified successfully');

      return ResponseFactory.success({
        symbol,
        stop_loss,
        take_profit,
        results,
        message: 'Position modified successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error({ symbol, error: error.message }, 'Error modifying position');
      return ResponseFactory.error('Internal error while modifying position', 500);
    }
  }, logger));
}

export default registerPositionRoutes;
