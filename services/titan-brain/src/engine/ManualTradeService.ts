/**
 * Manual Trade Service
 * Handles manual trade execution and emergency controls
 */

import type { ExecutionEngineClient } from '../types/index.js';
import { ManualTradeRequestBody } from '../schemas/apiSchemas.js';
import { IntentSignal } from '../types/index.js';
import { randomUUID } from 'crypto';

export class ManualTradeService {
  private readonly getExecutionClient: () => ExecutionEngineClient | null;

  constructor(getExecutionClient: () => ExecutionEngineClient | null) {
    this.getExecutionClient = getExecutionClient;
  }

  /**
   * Execute a manual trade
   * Creates an IntentSignal with 'manual' phase priority and forwards to Execution Engine
   */
  async executeManualTrade(request: ManualTradeRequestBody): Promise<string> {
    const client = this.getExecutionClient();
    if (!client) {
      throw new Error('Execution Engine not connected - cannot execute manual trade');
    }

    const signalId = `manual-${randomUUID()}`;

    // Create signal with manual phase priority
    const signal: IntentSignal = {
      signalId: signalId,
      phaseId: 'manual',
      symbol: request.symbol,
      side: request.side,
      requestedSize: request.size,
      leverage: request.leverage || 1,
      timestamp: request.timestamp || Date.now(),
      exchange: request.exchange,
      // Manual trades don't have expected edge or stop loss by default
    };

    console.log(
      `[ManualTradeService] Executing manual trade: ${signal.signalId} ${signal.side} ${signal.symbol} size=${signal.requestedSize}`,
    );

    try {
      await client.forwardSignal(signal, request.size);
      return signalId;
    } catch (error) {
      console.error(`[ManualTradeService] Failed to execute trade:`, error);
      throw error;
    }
  }

  /**
   * Cancel all open positions (Panic Button)
   */
  async cancelAllTrades(): Promise<void> {
    console.warn(`[ManualTradeService] PANIC BUTTON TRIGGERED: Closing all positions`);
    const client = this.getExecutionClient();
    if (!client) {
      throw new Error('Execution Engine not connected - cannot close positions');
    }

    try {
      await client.closeAllPositions();
      console.log(`[ManualTradeService] Successfully requested close all positions`);
    } catch (error) {
      console.error(`[ManualTradeService] Failed to close all positions:`, error);
      throw error;
    }
  }
}
