/**
 * Scavenger Handler
 * Handles PREPARE/CONFIRM/ABORT signals from Phase 1 (Scavenger)
 * 
 * Signal Flow:
 * 1. PREPARE: Pre-fetch L2 data, calculate position size, store prepared intent
 * 2. CONFIRM: Execute order via BrokerGateway, update Shadow State
 * 3. ABORT: Discard prepared order
 */

import { ResponseFactory } from '../utils/responseFactory.js';

export class ScavengerHandler {
  constructor({
    brokerGateway,
    shadowState,
    l2Validator,
    orderManager,
    safetyGates,
    phaseManager,
    configManager,
    logger,
    wsStatus,
  }) {
    this.brokerGateway = brokerGateway;
    this.shadowState = shadowState;
    this.l2Validator = l2Validator;
    this.orderManager = orderManager;
    this.safetyGates = safetyGates;
    this.phaseManager = phaseManager;
    this.configManager = configManager;
    this.logger = logger;
    this.wsStatus = wsStatus;
    
    // Store prepared intents with 10-second TTL
    this.preparedIntents = new Map();
    
    // Clean up stale intents every 5 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleIntents();
    }, 5000);
  }
  
  /**
   * Main handler - routes to appropriate method based on signal_type
   */
  async handle(signal) {
    const { signal_type, signal_id } = signal;
    
    this.logger.info({
      signal_id,
      signal_type,
      symbol: signal.symbol,
    }, 'ScavengerHandler - Processing signal');
    
    switch (signal_type) {
      case 'PREPARE':
        return await this.handlePrepare(signal);
      case 'CONFIRM':
        return await this.handleConfirm(signal);
      case 'ABORT':
        return await this.handleAbort(signal);
      default:
        this.logger.warn({ signal_id, signal_type }, 'Unknown signal type');
        return ResponseFactory.rejected(signal_id, 'UNKNOWN_SIGNAL_TYPE', {
          signal_type,
        });
    }
  }
  
  /**
   * Handle PREPARE signal
   * Pre-fetch L2 data, calculate position size, store prepared intent
   */
  async handlePrepare(signal) {
    const {
      signal_id,
      symbol,
      direction,
      entry_zone,
      stop_loss,
      take_profits,
      confidence,
      leverage,
      velocity,
      trap_type,
    } = signal;
    
    try {
      // Create intent in Shadow State
      const intent = this.shadowState.processIntent({
        signal_id,
        symbol,
        direction,
        entry_zone,
        stop_loss,
        take_profits,
        confidence,
        leverage,
        trap_type,
      });
      
      // Check Safety Gates
      const pipelineSignal = await this.safetyGates.processSignal({
        signal_id,
        symbol,
        direction: direction === 'LONG' ? 'LONG' : 'SHORT',
        size: 0, // Size will be calculated below
      });
      
      if (pipelineSignal.blocked) {
        this.logger.warn({
          signal_id,
          symbol,
          block_reason: pipelineSignal.blockReason,
        }, 'PREPARE blocked by Safety Gates');
        
        return ResponseFactory.blocked(signal_id, pipelineSignal.blockReason, {
          regime_data: pipelineSignal.regimeData,
          resume_at: pipelineSignal.resumeAt,
        });
      }
      
      // Pre-fetch L2 data from cache (zero-IO)
      const marketConditions = this.l2Validator.getMarketConditions(symbol);
      
      if (!marketConditions) {
        this.logger.warn({
          signal_id,
          symbol,
        }, 'PREPARE - No L2 data available');
        
        return ResponseFactory.rejected(signal_id, 'NO_L2_DATA', {
          symbol,
        });
      }
      
      // Get current equity for position sizing
      const equity = this.phaseManager.getLastKnownEquity();
      
      // Calculate position size using Kelly Criterion
      const positionSize = this.calculatePositionSize({
        equity,
        confidence,
        leverage,
        riskPercent: 0.02, // 2% risk per trade
      });
      
      // Determine order type based on velocity
      const orderDecision = this.determineOrderType({
        signal_id,
        symbol,
        side: direction === 'LONG' ? 'BUY' : 'SELL',
        size: positionSize,
        velocity,
        entry_zone,
        marketConditions,
      });
      
      // Store prepared intent
      this.preparedIntents.set(signal_id, {
        signal,
        intent,
        marketConditions,
        orderDecision,
        positionSize,
        preparedAt: Date.now(),
      });
      
      this.logger.info({
        signal_id,
        symbol,
        trap_type,
        position_size: positionSize,
        order_type: orderDecision.order_type,
        has_l2_data: true,
      }, 'PREPARE - Intent prepared successfully');
      
      // Broadcast to Console
      if (this.wsStatus) {
        this.wsStatus.pushEvent({
          type: 'trap_prepared',
          signal_id,
          symbol,
          trap_type,
          position_size: positionSize,
          order_type: orderDecision.order_type,
        });
      }
      
      return ResponseFactory.prepared(signal_id, {
        position_size: positionSize,
        order_type: orderDecision.order_type,
        has_l2_data: true,
      });
      
    } catch (error) {
      this.logger.error({
        signal_id,
        symbol,
        error: error.message,
        stack: error.stack,
      }, 'PREPARE - Error processing signal');
      
      return ResponseFactory.error(error);
    }
  }
  
  /**
   * Handle CONFIRM signal
   * Execute order via BrokerGateway, update Shadow State
   */
  async handleConfirm(signal) {
    const { signal_id, symbol } = signal;
    
    try {
      // Get prepared intent
      const prepared = this.preparedIntents.get(signal_id);
      
      if (!prepared) {
        this.logger.warn({
          signal_id,
          symbol,
        }, 'CONFIRM - Prepared intent not found');
        
        return ResponseFactory.rejected(signal_id, 'PREPARE_NOT_FOUND', {
          message: 'CONFIRM received without prior PREPARE',
        });
      }
      
      // Check if stale (> 10 seconds)
      const age = Date.now() - prepared.preparedAt;
      if (age > 10000) {
        this.preparedIntents.delete(signal_id);
        
        this.logger.warn({
          signal_id,
          symbol,
          age_ms: age,
        }, 'CONFIRM - Signal is stale');
        
        return ResponseFactory.rejected(signal_id, 'STALE_SIGNAL', {
          age_ms: age,
          max_age_ms: 10000,
        });
      }
      
      // Check Master Arm
      const config = this.configManager.getConfig();
      if (!config.masterArm) {
        this.preparedIntents.delete(signal_id);
        
        this.logger.warn({
          signal_id,
          symbol,
        }, 'CONFIRM - Master Arm is OFF');
        
        return ResponseFactory.blocked(signal_id, 'EXECUTION_DISABLED_BY_OPERATOR', {
          master_arm: false,
          message: 'Master Arm is OFF - all order execution is disabled',
        });
      }
      
      // Validate intent still exists in Shadow State
      const intent = this.shadowState.getIntent(signal_id);
      if (!intent) {
        this.preparedIntents.delete(signal_id);
        
        this.logger.warn({
          signal_id,
          symbol,
        }, 'CONFIRM - Intent not found in Shadow State');
        
        return ResponseFactory.rejected(signal_id, 'INTENT_NOT_FOUND', {
          message: 'Intent was removed from Shadow State',
        });
      }
      
      // Re-validate with L2 (market conditions may have changed)
      const validationResult = this.l2Validator.validate({
        symbol,
        side: prepared.signal.direction === 'LONG' ? 'BUY' : 'SELL',
        size: prepared.positionSize,
      });
      
      if (!validationResult.valid) {
        this.shadowState.rejectIntent(signal_id, validationResult.reason);
        this.preparedIntents.delete(signal_id);
        
        this.logger.warn({
          signal_id,
          symbol,
          reason: validationResult.reason,
        }, 'CONFIRM - L2 validation failed');
        
        return ResponseFactory.rejected(signal_id, validationResult.reason, {
          recommendation: validationResult.recommendation,
        });
      }
      
      // Mark intent as validated
      this.shadowState.validateIntent(signal_id);
      
      // Execute order via BrokerGateway
      const orderResult = await this.brokerGateway.placeOrder({
        signal_id,
        symbol,
        side: prepared.signal.direction === 'LONG' ? 'Buy' : 'Sell',
        type: prepared.orderDecision.order_type,
        qty: prepared.positionSize,
        price: prepared.orderDecision.limit_price,
        leverage: prepared.signal.leverage || 20,
        stopLoss: prepared.signal.stop_loss,
        takeProfit: prepared.signal.take_profits?.[0],
      });
      
      // Update Shadow State with position
      if (orderResult.success) {
        await this.shadowState.openPosition({
          signal_id,
          symbol,
          side: prepared.signal.direction,
          size: prepared.positionSize,
          entry: orderResult.fill_price,
          stop: prepared.signal.stop_loss,
          target: prepared.signal.take_profits?.[0],
          leverage: prepared.signal.leverage,
          trap_type: prepared.signal.trap_type,
        });
        
        this.logger.info({
          signal_id,
          symbol,
          trap_type: prepared.signal.trap_type,
          fill_price: orderResult.fill_price,
          position_size: prepared.positionSize,
        }, 'CONFIRM - Order executed successfully');
        
        // Broadcast to Console
        if (this.wsStatus) {
          this.wsStatus.pushEvent({
            type: 'trap_sprung',
            signal_id,
            symbol,
            trap_type: prepared.signal.trap_type,
            fill_price: orderResult.fill_price,
            position_size: prepared.positionSize,
            direction: prepared.signal.direction,
          });
        }
      }
      
      // Clean up prepared intent
      this.preparedIntents.delete(signal_id);
      
      return ResponseFactory.success({
        executed: true,
        signal_id,
        fill_price: orderResult.fill_price,
        order_id: orderResult.order_id,
      });
      
    } catch (error) {
      // Clean up on error
      this.preparedIntents.delete(signal_id);
      
      this.logger.error({
        signal_id,
        symbol,
        error: error.message,
        stack: error.stack,
      }, 'CONFIRM - Error executing order');
      
      return ResponseFactory.error(error);
    }
  }
  
  /**
   * Handle ABORT signal
   * Discard prepared order
   */
  async handleAbort(signal) {
    const { signal_id, symbol } = signal;
    
    try {
      // Get prepared intent
      const prepared = this.preparedIntents.get(signal_id);
      
      // Remove from prepared intents
      this.preparedIntents.delete(signal_id);
      
      // Reject intent in Shadow State
      const intent = this.shadowState.getIntent(signal_id);
      if (intent) {
        this.shadowState.rejectIntent(signal_id, 'Signal aborted by Scavenger');
      }
      
      this.logger.info({
        signal_id,
        symbol,
        trap_type: prepared?.signal?.trap_type,
      }, 'ABORT - Prepared order discarded');
      
      // Broadcast to Console
      if (this.wsStatus) {
        this.wsStatus.pushEvent({
          type: 'trap_aborted',
          signal_id,
          symbol,
          trap_type: prepared?.signal?.trap_type,
        });
      }
      
      return ResponseFactory.aborted(signal_id);
      
    } catch (error) {
      this.logger.error({
        signal_id,
        symbol,
        error: error.message,
      }, 'ABORT - Error processing signal');
      
      return ResponseFactory.error(error);
    }
  }
  
  /**
   * Calculate position size using Kelly Criterion
   * 
   * Kelly Fraction = (confidence / 100) * safety_factor
   * Position Size = (equity * risk_percent * kelly_fraction) / leverage
   */
  calculatePositionSize({ equity, confidence, leverage, riskPercent }) {
    // Apply 25% safety factor to Kelly Criterion
    const kellyFraction = (confidence / 100) * 0.25;
    
    // Calculate position size
    const positionSize = (equity * riskPercent * kellyFraction) / leverage;
    
    // Ensure minimum position size
    const minPositionSize = 10; // $10 minimum
    
    return Math.max(positionSize, minPositionSize);
  }
  
  /**
   * Determine order type based on velocity and market conditions
   * 
   * High velocity (> 0.5%/s): MARKET order
   * Medium velocity (> 0.1%/s): Aggressive LIMIT order
   * Low velocity: POST_ONLY LIMIT order
   */
  determineOrderType({ signal_id, symbol, side, size, velocity, entry_zone, marketConditions }) {
    // High velocity - use MARKET order
    if (velocity && velocity > 0.005) {
      return {
        order_type: 'MARKET',
        limit_price: null,
        reason: 'HIGH_VELOCITY',
      };
    }
    
    // Medium velocity - use aggressive LIMIT order
    if (velocity && velocity > 0.001) {
      const limitPrice = side === 'BUY'
        ? marketConditions.bestAsk
        : marketConditions.bestBid;
      
      return {
        order_type: 'LIMIT',
        limit_price: limitPrice,
        reason: 'MEDIUM_VELOCITY',
      };
    }
    
    // Low velocity - use POST_ONLY LIMIT order
    const limitPrice = entry_zone?.[0] || (side === 'BUY'
      ? marketConditions.bestBid
      : marketConditions.bestAsk);
    
    return {
      order_type: 'POST_ONLY',
      limit_price: limitPrice,
      reason: 'LOW_VELOCITY',
    };
  }
  
  /**
   * Clean up stale prepared intents (> 10 seconds old)
   */
  cleanupStaleIntents() {
    const now = Date.now();
    const staleThreshold = 10000; // 10 seconds
    
    for (const [signal_id, prepared] of this.preparedIntents.entries()) {
      const age = now - prepared.preparedAt;
      
      if (age > staleThreshold) {
        this.preparedIntents.delete(signal_id);
        
        // Reject intent in Shadow State
        const intent = this.shadowState.getIntent(signal_id);
        if (intent) {
          this.shadowState.rejectIntent(signal_id, 'STALE_INTENT_CLEANUP');
        }
        
        this.logger.info({
          signal_id,
          symbol: prepared.signal.symbol,
          age_ms: age,
        }, 'Cleaned up stale prepared intent');
      }
    }
  }
  
  /**
   * Get statistics about prepared intents
   */
  getStats() {
    return {
      prepared_count: this.preparedIntents.size,
      prepared_signals: Array.from(this.preparedIntents.keys()),
    };
  }
  
  /**
   * Cleanup on shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.preparedIntents.clear();
  }
}
