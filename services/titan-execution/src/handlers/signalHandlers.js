/**
 * Signal Handlers
 * Extracted handlers for different signal types
 */

import { ResponseFactory } from '../utils/responseFactory.js';

/**
 * Handle PREPARE signal
 */
export async function handlePrepareSignal({
  request,
  shadowState,
  l2Validator,
  orderManager,
  preparedIntents,
  logger,
}) {
  const { signal_id, symbol, direction, size, entry_zone, signal_type, expected_profit_pct } = request.body;
  
  const intent = shadowState.processIntent(request.body);
  
  // Pre-fetch L2 data from cache (zero-IO)
  const marketConditions = l2Validator.getMarketConditions(symbol);
  
  // Calculate position size using order manager
  const orderDecision = orderManager.decideOrderType({
    signal_id,
    symbol,
    side: direction === 1 ? 'BUY' : 'SELL',
    size: size || 0,
    limit_price: entry_zone?.[0] || marketConditions?.bestAsk,
    signal_type,
    expected_profit_pct,
  });
  
  // Store prepared intent for CONFIRM (Latent Execution)
  preparedIntents.set(signal_id, {
    intent,
    marketConditions,
    orderDecision,
    prepared_at: Date.now(),
  });
  
  logger.info({
    signal_id,
    symbol,
    has_l2_data: !!marketConditions,
    order_type: orderDecision.order_type,
  }, 'PREPARE - Intent prepared with L2 data');
  
  return ResponseFactory.prepared(signal_id, {
    intent_status: intent.status,
    has_l2_data: !!marketConditions,
    order_type: orderDecision.order_type,
  });
}

/**
 * Handle CONFIRM signal
 */
export async function handleConfirmSignal({
  request,
  reply,
  signal_id,
  shadowState,
  preparedIntents,
  phaseManager,
  safetyGates,
  l2Validator,
  configManager,
  masterArm,
  wsStatus,
  executionStrategies,
  logger,
}) {
  const { symbol, direction } = request.body;
  
  // Check Live Equity from broker API and determine phase
  const currentPhase = await phaseManager.determinePhase();
  const currentEquity = phaseManager.getLastKnownEquity();
  const phaseConfig = phaseManager.getPhaseConfig();
  
  const intent = shadowState.getIntent(signal_id);
  const prepared = preparedIntents.get(signal_id);
  
  if (!intent) {
    return reply.code(404).send({
      error: 'Intent not found',
      signal_id,
      message: 'CONFIRM received without prior PREPARE',
    });
  }
  
  // Check for zombie signals
  if ((intent.type === 'CLOSE_LONG' || intent.type === 'CLOSE_SHORT') &&
    shadowState.isZombieSignal(symbol, signal_id)) {
    preparedIntents.delete(signal_id);
    return ResponseFactory.success({
      status: 'ignored',
      signal_id,
      reason: 'ZOMBIE_SIGNAL',
    });
  }
  
  // Validate signal type against phase's signal_filter
  const signalType = request.body.signal_type || intent.type || 'UNKNOWN';
  const pinePhase = request.body.pine_phase;
  
  // Safety Gates - Derivatives regime, liquidation, circuit breaker
  const pipelineSignal = await safetyGates.processSignal({
    signal_id,
    symbol,
    direction: direction === 1 ? 'LONG' : 'SHORT',
    size: intent.size || request.body.size || 0,
  });
  
  if (pipelineSignal.blocked) {
    preparedIntents.delete(signal_id);
    logger.warn({
      signal_id,
      symbol,
      block_reason: pipelineSignal.blockReason,
      regime_data: pipelineSignal.regimeData,
    }, 'Signal blocked by Safety Gates');
    
    return ResponseFactory.blocked(signal_id, pipelineSignal.blockReason, {
      regime_data: pipelineSignal.regimeData,
      resume_at: pipelineSignal.resumeAt,
    });
  }
  
  // Apply size multiplier from regime
  const adjustedSize = (intent.size || request.body.size || 0) * (pipelineSignal.sizeMultiplier || 1);
  
  if (!phaseManager.validateSignal(signalType)) {
    preparedIntents.delete(signal_id);
    
    logger.warn({
      signal_id,
      pine_phase: pinePhase,
      actual_phase: currentPhase,
      phase_label: phaseConfig.label,
      equity: currentEquity,
      signal_type: signalType,
      allowed_signals: phaseConfig.signalFilter,
      action_taken: 'REJECTED',
    }, 'Signal rejected - Phase signal mismatch');
    
    return ResponseFactory.rejected(signal_id, 'PHASE_SIGNAL_MISMATCH', {
      current_phase: currentPhase,
      phase_label: phaseConfig.label,
      signal_type: signalType,
      allowed_signals: phaseConfig.signalFilter,
    });
  }
  
  // Validate with L2Validator (zero-IO from cache)
  const validationResult = l2Validator.validate({
    symbol,
    side: intent.direction === 1 ? 'BUY' : 'SELL',
    size: intent.size || request.body.size || 0,
    market_structure_score: request.body.regime_vector?.market_structure_score,
    momentum_score: request.body.regime_vector?.momentum_score,
  });
  
  if (!validationResult.valid) {
    shadowState.rejectIntent(signal_id, validationResult.reason);
    preparedIntents.delete(signal_id);
    
    logger.warn({
      signal_id,
      symbol,
      reason: validationResult.reason,
      recommendation: validationResult.recommendation,
    }, 'CONFIRM rejected - L2 validation failed');
    
    if (wsStatus) {
      wsStatus.pushOrderRejection({
        signal_id,
        symbol,
        reason: validationResult.reason,
        recommendation: validationResult.recommendation,
      });
    }
    
    return ResponseFactory.rejected(signal_id, validationResult.reason, {
      recommendation: validationResult.recommendation,
    });
  }
  
  // Mark intent as validated
  shadowState.validateIntent(signal_id);
  
  // Check Master Arm
  if (!masterArm) {
    preparedIntents.delete(signal_id);
    
    logger.warn({
      signal_id,
      symbol,
      master_arm: false,
    }, 'EXECUTION_DISABLED_BY_OPERATOR - Master Arm is OFF');
    
    return ResponseFactory.blocked(signal_id, 'EXECUTION_DISABLED_BY_OPERATOR', {
      master_arm: false,
      message: 'Master Arm is OFF - all order execution is disabled',
    });
  }
  
  // Get order decision
  const orderDecision = prepared?.orderDecision || orderManager.decideOrderType({
    signal_id,
    symbol,
    side: intent.direction === 1 ? 'BUY' : 'SELL',
    size: intent.size || request.body.size || 0,
    limit_price: intent.entry_zone?.[0],
    signal_type: intent.type,
  });
  
  // Apply phase-specific execution
  const executionMode = phaseConfig.executionMode;
  
  logger.info({
    signal_id,
    phase: currentPhase,
    phase_label: phaseConfig.label,
    execution_mode: executionMode,
    signal_type: signalType,
    equity: currentEquity,
  }, 'Executing with phase-specific logic');
  
  try {
    const strategy = executionStrategies[executionMode];
    if (!strategy) {
      throw new Error(`Unknown execution mode: ${executionMode}`);
    }
    
    const result = await strategy.execute({
      signal_id,
      symbol,
      intent,
      validationResult,
      orderDecision,
      request,
    });
    
    preparedIntents.delete(signal_id);
    return result;
  } catch (error) {
    preparedIntents.delete(signal_id);
    logger.error({
      signal_id,
      symbol,
      phase: currentPhase,
      error: error.message
    }, 'CONFIRM - Execution error');
    
    return reply.code(500).send(ResponseFactory.error(error));
  }
}

/**
 * Handle ABORT signal
 */
export async function handleAbortSignal({
  signal_id,
  shadowState,
  preparedIntents,
  limitChaser,
  logger,
}) {
  const intent = shadowState.getIntent(signal_id);
  if (intent) {
    shadowState.rejectIntent(signal_id, 'Signal aborted by Pine');
  }
  
  // Remove prepared intent
  preparedIntents.delete(signal_id);
  
  // Cancel any active chase
  limitChaser.cancelChase(signal_id);
  
  logger.info({ signal_id }, 'ABORT - Prepared order discarded');
  
  return ResponseFactory.aborted(signal_id);
}

/**
 * Handle HEARTBEAT signal
 */
export async function handleHeartbeatSignal() {
  return ResponseFactory.success({
    status: 'heartbeat_received',
  });
}

/**
 * Handle unknown signal type
 */
export async function handleUnknownSignal({ signal_id, request, shadowState }) {
  const intent = shadowState.processIntent(request.body);
  return ResponseFactory.success({
    status: 'received',
    signal_id,
    intent_status: intent.status,
  });
}
