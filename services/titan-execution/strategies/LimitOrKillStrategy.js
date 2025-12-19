/**
 * Limit-or-Kill Execution Strategy
 * Phase 1: Maker execution at Bid/Ask
 */

import { ExecutionStrategy } from './ExecutionStrategy.js';
import { ResponseFactory } from '../utils/responseFactory.js';

export class LimitOrKillStrategy extends ExecutionStrategy {
  constructor(limitOrKill, shadowState, wsStatus, logger) {
    super();
    this.limitOrKill = limitOrKill;
    this.shadowState = shadowState;
    this.wsStatus = wsStatus;
    this.logger = logger;
  }
  
  async execute({ signal_id, symbol, intent, validationResult, request }) {
    const executionResult = await this.limitOrKill.execute({
      signal_id,
      symbol,
      side: intent.direction === 1 ? 'BUY' : 'SELL',
      size: intent.size || request.body.size || 0.1,
      limit_price: intent.entry_zone?.[0] || validationResult.marketConditions?.bestBid,
      stop_loss: intent.stop_loss,
      take_profits: intent.take_profits,
    });
    
    if (executionResult.success) {
      // Confirm execution in Shadow State
      const position = this.shadowState.confirmExecution(signal_id, {
        broker_order_id: executionResult.broker_order_id,
        fill_price: executionResult.fill_price,
        fill_size: executionResult.fill_size,
        filled: true,
      });
      
      this.logger.info({
        signal_id,
        symbol,
        phase: 1,
        execution_mode: 'LIMIT_OR_KILL',
        fill_price: executionResult.fill_price,
        fill_size: executionResult.fill_size,
        status: executionResult.status,
      }, 'CONFIRM - Order filled via Limit-or-Kill (Phase 1)');
      
      // Push status update via WebSocket
      if (this.wsStatus) {
        this.wsStatus.pushOrderFill({
          signal_id,
          broker_order_id: executionResult.broker_order_id,
          symbol,
          side: intent.direction === 1 ? 'BUY' : 'SELL',
          fill_price: executionResult.fill_price,
          fill_size: executionResult.fill_size,
          requested_size: executionResult.requested_size,
          expected_price: intent.entry_zone?.[0],
          status: executionResult.status,
        });
      }
      
      return ResponseFactory.executed(signal_id, {
        phase: 1,
        execution_mode: 'LIMIT_OR_KILL',
        broker_order_id: executionResult.broker_order_id,
        fill_price: executionResult.fill_price,
        fill_size: executionResult.fill_size,
        fill_status: executionResult.status,
        position: position ? { 
          symbol: position.symbol, 
          side: position.side, 
          size: position.size 
        } : null,
      });
    } else {
      // Missed entry
      this.logger.warn({
        signal_id,
        symbol,
        phase: 1,
        reason: executionResult.reason,
        price_movement: executionResult.price_movement,
      }, 'CONFIRM - Limit-or-Kill missed entry (Phase 1)');
      
      return {
        status: 'missed_entry',
        signal_id,
        phase: 1,
        execution_mode: 'LIMIT_OR_KILL',
        reason: executionResult.reason,
        price_movement: executionResult.price_movement,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
