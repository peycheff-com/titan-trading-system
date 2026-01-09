/**
 * Status and Monitoring Routes
 */

import { ResponseFactory } from '../utils/responseFactory.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function registerStatusRoutes(fastify, dependencies) {
  const {
    replayGuard,
    limitChaser,
    orderManager,
    partialFillHandler,
    l2Validator,
    phaseManager,
    safetyGates,
    wsStatus,
    logger,
  } = dependencies;

  /**
   * Get Replay Guard status
   */
  fastify.get('/replay-guard/status', asyncHandler(async () => {
    return ResponseFactory.success(replayGuard.getStatus());
  }, logger));

  /**
   * Get Limit Chaser status
   */
  fastify.get('/limit-chaser/status', asyncHandler(async () => {
    return ResponseFactory.success({
      ...limitChaser.getStatus(),
      active_chases: Array.from(limitChaser.getActiveChases().entries()).map(([id, chase]) => ({
        signal_id: id,
        ...chase,
      })),
    });
  }, logger));

  /**
   * Get Order Manager fee configuration
   */
  fastify.get('/order-manager/config', asyncHandler(async () => {
    return ResponseFactory.success(orderManager.getFeeConfig());
  }, logger));

  /**
   * Get Partial Fill Handler status
   */
  fastify.get('/partial-fill/status', asyncHandler(async () => {
    return ResponseFactory.success({
      ...partialFillHandler.getStatus(),
      active_orders: Array.from(partialFillHandler.getActiveOrders().entries()).map(([id, order]) => ({
        signal_id: id,
        ...order,
      })),
    });
  }, logger));

  /**
   * Get L2 Validator market conditions for a symbol
   */
  fastify.get('/l2/:symbol', asyncHandler(async (request, reply) => {
    const { symbol } = request.params;
    const conditions = l2Validator.getMarketConditions(symbol);

    if (!conditions) {
      return reply.code(404).send({
        error: 'No L2 data available',
        symbol,
        cache_valid: l2Validator.isCacheValid(symbol),
      });
    }

    return ResponseFactory.success(conditions);
  }, logger));

  /**
   * Get Phase Manager status
   */
  fastify.get('/phase', asyncHandler(async () => {
    const currentPhase = phaseManager.getCurrentPhase();
    const equity = phaseManager.getLastKnownEquity();
    const config = phaseManager.getPhaseConfig();

    return ResponseFactory.success({
      current_phase: currentPhase,
      phase_label: config?.label || null,
      equity: equity,
      phase_config: config,
      transition_history: phaseManager.getTransitionHistory(),
    });
  }, logger));

  /**
   * Get WebSocket status channel info
   */
  fastify.get('/ws/status/info', asyncHandler(async () => {
    if (!wsStatus) {
      return ResponseFactory.success({
        status: 'not_initialized',
        message: 'WebSocket status channel not yet initialized',
      });
    }

    return ResponseFactory.success({
      ...wsStatus.getStatus(),
      clients: wsStatus.getConnectedClients(),
    });
  }, logger));

  /**
   * Get Safety Gates status
   */
  fastify.get('/safety-gates/status', asyncHandler(async () => {
    return ResponseFactory.success(safetyGates.getStatus());
  }, logger));
}
