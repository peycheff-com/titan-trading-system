/**
 * Limit Chaser Execution Strategy
 * Phase 2: Aggressive taker execution
 */

import { ExecutionStrategy } from './ExecutionStrategy.js';
import { ResponseFactory } from '../utils/responseFactory.js';

export class LimitChaserStrategy extends ExecutionStrategy {
  constructor(limitChaser, shadowState, wsStatus, logger) {
    super();
    this.limitChaser = limitChaser;
    this.shadowState = shadowState;
    this.wsStatus = wsStatus;
    this.logger = logger;
  }
  
  async execute({ signal_id, symbol, intent, orderDecision, request }) {
    const chaseResult = await this.limitChaser.chase({
      signal_id,
      symbol,
      side: intent.direction === 1 ? 'BUY' : 'SELL',
      size: intent.size || request.body.size || 0.1,
      stop_loss: intent.stop_loss,
      take_profits: intent.take_profits,
      reduce_only: orderDecision.reduce_only,
      post_only: orderDecision.post_only,
    });
    
    if (chaseResult.success) {
      // Confirm execution in Shadow State
      const position = this.shadowState.confirmExecution(signal_id, {
        broker_order_id: chaseResult.broker_order_id,
        fill_price: chaseResult.fill_price,
        fill_size: chaseResult.fill_size,
        filled: true,
      });
      
      this.logger.info({
        signal_id,
        symbol,
        phase: 2,
        execution_mode: 'LIMIT_CHASER',
        fill_price: chaseResult.fill_price,
        fill_size: chaseResult.fill_size,
        chase_time_ms: chaseResult.chase_time_ms,
        chase_ticks: chaseResult.chase_ticks,
      }, 'CONFIRM - Order filled via Limit Chaser (Phase 2)');
      
      // Push status update via WebSocket
      if (this.wsStatus) {
        const requestedSize = intent.size || request.body.size || chaseResult.fill_size;
        const expectedPrice = intent.entry_zone?.[0] || request.body.entry_zone?.[0];
        this.wsStatus.pushOrderFill({
          signal_id,
          broker_order_id: chaseResult.broker_order_id,
          symbol,
          side: intent.direction === 1 ? 'BUY' : 'SELL',
          fill_price: chaseResult.fill_price,
          fill_size: chaseResult.fill_size,
          requested_size: requestedSize,
          expected_price: expectedPrice,
          status: 'FILLED',
        });
      }
      
      return ResponseFactory.executed(signal_id, {
        phase: 2,
        execution_mode: 'LIMIT_CHASER',
        broker_order_id: chaseResult.broker_order_id,
        fill_price: chaseResult.fill_price,
        fill_size: chaseResult.fill_size,
        chase_time_ms: chaseResult.chase_time_ms,
        chase_ticks: chaseResult.chase_ticks,
        position: position ? { 
          symbol: position.symbol, 
          side: position.side, 
          size: position.size 
        } : null,
      });
    } else {
      // Timeout
      this.logger.warn({
        signal_id,
        symbol,
        phase: 2,
        reason: chaseResult.reason,
        chase_time_ms: chaseResult.chase_time_ms,
        market_conditions: chaseResult.market_conditions,
      }, 'CONFIRM - Limit Chaser timeout (Phase 2)');
      
      return {
        status: 'timeout',
        signal_id,
        phase: 2,
        execution_mode: 'LIMIT_CHASER',
        reason: chaseResult.reason,
        chase_time_ms: chaseResult.chase_time_ms,
        chase_ticks: chaseResult.chase_ticks,
        market_conditions: chaseResult.market_conditions,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
