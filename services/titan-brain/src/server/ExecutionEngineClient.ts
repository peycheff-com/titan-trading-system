/**
 * ExecutionEngineClient - Integration with Titan Execution Engine
 *
 * Implements signal forwarding to the Execution Engine via NATS.
 * Handles position state synchronization via NATS request-reply (simulated/future).
 *
 * Requirements: 1.7, 7.5
 */

import { EventEmitter } from 'events';
import { IntentSignal, PhaseId, Position } from '../types/index.js';
import { ExecutionEngineClient as IExecutionEngineClient } from '../engine/TitanBrain.js';
import { getNatsClient, NatsClient } from '@titan/shared';

/**
 * Configuration for Execution Engine Client
 */
export interface ExecutionEngineConfig {
  /** Base URL of the Execution Engine (Deprecated using NATS) */
  baseUrl?: string;
  /** HMAC secret for request signing (Deprecated using NATS) */
  hmacSecret?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * Fill confirmation from Execution Engine
 */
export interface FillConfirmation {
  signalId: string;
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  fillPrice: number;
  fillSize: number;
  requestedSize: number;
  timestamp: number;
  fees?: number;
  slippage?: number;
}

/**
 * ExecutionEngineClient handles communication with the Titan Execution Engine via NATS
 */
export class ExecutionEngineClient extends EventEmitter implements IExecutionEngineClient {
  private readonly config: ExecutionEngineConfig;
  private nats: NatsClient;
  private connected: boolean = false;

  constructor(config: ExecutionEngineConfig) {
    super();
    this.config = config;
    this.nats = getNatsClient();
  }

  /**
   * Initialize the client
   */
  async initialize(): Promise<void> {
    console.log('🔗 Connecting to Execution Engine (NATS)...');

    // We assume NATS is already connected by shared lib or we wait for it
    // The shared getNatsClient() returns a singleton that should be connected by Brain's startup
    try {
      this.connected = this.nats.isConnected();
      if (this.connected) {
        console.log('✅ Execution Engine NATS client ready');
      } else {
        console.warn('⚠️ NATS not connected yet, will retry on use');
      }
    } catch (error) {
      console.error('❌ Failed to initialize NATS client:', error);
    }
  }

  /**
   * Shutdown the client
   */
  async shutdown(): Promise<void> {
    this.connected = false;
    console.log('🔌 Execution Engine client disconnected');
  }

  /**
   * Forward a signal to the Execution Engine via NATS
   * Requirement 7.5: Maximum latency of 100ms
   *
   * @param signal - Intent signal to forward
   * @param authorizedSize - Size authorized by the Brain
   */
  async forwardSignal(signal: IntentSignal, authorizedSize: number): Promise<void> {
    const startTime = Date.now();

    // Map to Rust Intent structure
    const source = this.mapPhaseIdToSource(signal.phaseId);
    const subject = `titan.execution.intent.${source}`;

    const payload = {
      signal_id: signal.signalId,
      symbol: signal.symbol,
      direction: signal.side === 'BUY' ? 1 : -1, // Rust: 1=Long, -1=Short
      type: signal.side === 'BUY' ? 'BUY_SETUP' : 'SELL_SETUP', // Defaulting based on side
      entry_zone: [], // Default empty
      stop_loss: 0, // Default zero
      take_profits: [], // Default empty
      size: authorizedSize,
      status: 'VALIDATED', // Brain has validated this
      received_at: new Date(signal.timestamp).toISOString(),
      rejection_reason: null,
      regime_state: null,
      phase: null,
      metadata: { source, brain_authorized: true },
    };

    try {
      await this.nats.publish(subject, payload);

      const latency = Date.now() - startTime;
      console.log(
        `📤 Signal forwarded to Execution Engine via NATS: ${signal.signalId} (${latency}ms)`,
      );

      // Emit forwarded event
      this.emit('signal:forwarded', {
        signalId: signal.signalId,
        symbol: signal.symbol,
        authorizedSize,
        latency,
      });
    } catch (error) {
      console.error(`❌ Failed to forward signal ${signal.signalId} to NATS:`, error);

      this.emit('signal:forward_failed', {
        signalId: signal.signalId,
        symbol: signal.symbol,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Close all positions via Execution Engine
   * Called by Circuit Breaker for emergency flatten
   */
  async closeAllPositions(): Promise<void> {
    console.log('🚨 Requesting emergency position closure from Execution Engine...');

    try {
      // Send a general CLOSE intent or specific close all command
      // Since Rust implementation is partial, we send a metadata command to the brain channel
      const subject = 'titan.execution.intent.brain';
      const payload = {
        signal_id: `flatten-${Date.now()}`,
        symbol: 'ALL',
        direction: 0,
        type: 'CLOSE',
        entry_zone: [],
        stop_loss: 0,
        take_profits: [],
        size: 0,
        status: 'VALIDATED',
        received_at: new Date().toISOString(),
        metadata: {
          command: 'FLATTEN_ALL',
          reason: 'BRAIN_CIRCUIT_BREAKER',
        },
      };

      await this.nats.publish(subject, payload);
      console.log('✅ Emergency flatten request published');

      this.emit('positions:flattened', {
        closedCount: -1, // Unknown async
        reason: 'BRAIN_CIRCUIT_BREAKER',
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('❌ Failed to publish close all positions:', error);
      throw error;
    }
  }

  /**
   * Get current positions from Execution Engine
   * Used for position state synchronization
   */
  async getPositions(): Promise<Position[]> {
    // TODO: Implement NATS request-reply for positions when supported by Rust
    console.warn('⚠️ getPositions not implemented for NATS yet');
    return [];
  }

  /**
   * Get current equity from Execution Engine
   */
  async getEquity(): Promise<number> {
    // TODO: Implement NATS request-reply for equity when supported by Rust
    return 0;
  }

  /**
   * Perform health check on Execution Engine
   */
  async healthCheck(): Promise<boolean> {
    return this.nats.isConnected();
  }

  /**
   * Check if connected to Execution Engine
   */
  isConnected(): boolean {
    return this.nats.isConnected();
  }

  /**
   * Register a fill confirmation callback
   * Called when Execution Engine confirms an order fill
   */
  onFillConfirmation(callback: (fill: FillConfirmation) => void): void {
    this.on('fill:confirmed', callback);
  }

  /**
   * Handle incoming fill confirmation
   * This is now likely called by NatsConsumer/Brain when a fill arrives
   */
  handleFillConfirmation(fill: FillConfirmation): void {
    console.log(`✅ Fill confirmed: ${fill.signalId} @ ${fill.fillPrice}`);
    this.emit('fill:confirmed', fill);
  }

  /**
   * Map PhaseId to source string for Execution Engine
   */
  private mapPhaseIdToSource(phaseId: PhaseId): string {
    switch (phaseId) {
      case 'phase1':
        return 'scavenger';
      case 'phase2':
        return 'hunter';
      case 'phase3':
        return 'sentinel';
      default:
        return 'unknown';
    }
  }
}

/**
 * Fill confirmation from Execution Engine
 */
export interface FillConfirmation {
  signalId: string;
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  fillPrice: number;
  fillSize: number;
  requestedSize: number;
  timestamp: number;
  fees?: number;
  slippage?: number;
}

/**
 * Position data from Execution Engine
 */
export interface ExecutionPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  unrealizedPnl: number;
  leverage: number;
  timestamp: number;
}
