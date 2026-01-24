/**
 * ExecutionEngineClient - Integration with Titan Execution Engine
 *
 * Implements signal forwarding to the Execution Engine via NATS.
 * Handles position state synchronization via NATS request-reply (simulated/future).
 *
 * Requirements: 1.7, 7.5
 */

import { EventEmitter } from 'events';
import {
  ExchangeBalance,
  ExecutionEngineConfig,
  ExecutionPosition,
  FillConfirmation,
  IntentSignal,
  PhaseId,
  Position,
} from '../types/index.js';
import { ExecutionEngineClient as IExecutionEngineClient } from '../types/execution.js';
import { getNatsClient, NatsClient, TitanSubject, validateIntentPayload } from '@titan/shared';

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
    const tSignal = signal.timestamp ?? Date.now();
    const entryZone = signal.entryPrice !== undefined ? [signal.entryPrice] : [];
    const stopLoss = signal.stopLossPrice ?? 0;
    const takeProfits = Array.isArray((signal as { takeProfits?: number[] }).takeProfits)
      ? (signal as { takeProfits?: number[] }).takeProfits!
      : [];

    // Map to Rust Intent structure
    const source = this.mapPhaseIdToSource(signal.phaseId);
    const symbolToken = signal.symbol.replace('/', '_');
    const venue = signal.exchange?.toLowerCase() ?? 'auto';
    const account = 'main';
    const subject = `${TitanSubject.CMD_EXEC_PLACE}.${venue}.${account}.${symbolToken}`;

    const payload = {
      schema_version: '1.0.0',
      signal_id: signal.signalId,
      source,
      symbol: signal.symbol,
      t_signal: tSignal,
      timestamp: tSignal,
      direction: signal.side === 'BUY' ? 1 : -1,
      type: signal.side === 'BUY' ? 'BUY_SETUP' : 'SELL_SETUP',
      entry_zone: entryZone,
      stop_loss: stopLoss,
      take_profits: takeProfits,
      size: authorizedSize,
      status: 'VALIDATED' as const,
      exchange: signal.exchange,
      position_mode: signal.positionMode,
      metadata: {
        source,
        brain_authorized: true,
        correlation_id: signal.signalId,
        intent_schema_version: '1.0.0',
        original_timestamp: tSignal,
      },
    };

    try {
      // Validate payload before sending (using the shared schema which wraps validation)
      const validation = validateIntentPayload(payload);
      if (!validation.valid) {
        await this.publishDlq(payload, validation.errors.join('; '));
        throw new Error('Invalid intent payload');
      }

      await this.nats.publishEnvelope(subject, payload, {
        type: 'titan.cmd.exec.place.v1',
        version: 1,
        producer: 'titan-brain',
        correlation_id: signal.signalId,
        idempotency_key: signal.signalId, // Using signal_id as idempotency key
      });

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
   * Publish Risk Policy Update to Execution Engine
   * @param policy - New risk policy configuration
   */
  async publishRiskPolicy(policy: any): Promise<void> {
    if (!this.connected) {
      console.warn('⚠️ Execution Engine not connected, cannot push risk policy');
      // We might still want to proceed if NATS is temporarily down, but better to warn
    }

    const subject = TitanSubject.CMD_RISK_POLICY; // Ensure this subject exists or use string literal
    // If TitanSubject doesn't have CMD_RISK_POLICY, we define it here or use string
    // Assuming titan.cmd.risk.policy based on Audit
    const actualSubject = 'titan.cmd.risk.policy';

    try {
      await this.nats.publishEnvelope(
        actualSubject,
        {
          timestamp: Date.now(),
          policy,
          source: 'brain',
        },
        {
          type: 'titan.cmd.risk.policy.v1',
          version: 1,
          producer: 'titan-brain',
          idempotency_key: `risk-update-${Date.now()}`,
        },
      );
      console.log('✅ Risk policy update published to NATS');
    } catch (error) {
      console.error('❌ Failed to publish risk policy:', error);
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
      const subject = `${TitanSubject.CMD_EXEC_PLACE}.auto.main.ALL`;
      const tSignal = Date.now();
      const signalId = `flatten-${tSignal}`;
      const payload = {
        schema_version: '1.0.0',
        signal_id: signalId,
        source: 'brain',
        symbol: 'ALL',
        t_signal: tSignal,
        timestamp: tSignal,
        direction: 0,
        type: 'CLOSE',
        entry_zone: [],
        stop_loss: 0,
        take_profits: [],
        size: 0,
        status: 'VALIDATED' as const,
        metadata: {
          command: 'FLATTEN_ALL',
          reason: 'BRAIN_CIRCUIT_BREAKER',
          correlation_id: signalId,
          intent_schema_version: '1.0.0',
        },
      };

      // Since payload is essentially "fake" to satisfy the schema for the "ALL" symbol special case,
      // we might need to be careful with schema validation if "ALL" isn't a valid symbol in strict mode.
      // But assuming the schema allows string, it should be fine. Validating...
      const validation = validateIntentPayload(payload);
      if (!validation.valid) {
        await this.publishDlq(payload, validation.errors.join('; '));
        throw new Error('Invalid intent payload');
      }

      await this.nats.publishEnvelope(subject, payload, {
        type: 'titan.cmd.exec.place.v1',
        version: 1,
        producer: 'titan-brain',
        correlation_id: signalId,
        idempotency_key: signalId,
      });

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
    try {
      const balances = await this.fetchExchangeBalances('main');
      const usdt = balances.find((b) => b.currency === 'USDT');
      return usdt ? usdt.total : 0;
    } catch (error) {
      console.error('❌ Failed to fetch equity via NATS:', error);
      return 0;
    }
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

  private async publishDlq(payload: unknown, reason: string): Promise<void> {
    const dlqPayload = {
      reason,
      payload,
      t_ingress: Date.now(),
    };

    try {
      await this.nats.publish('titan.dlq.execution.core', dlqPayload);
      await this.nats.publish('titan.execution.dlq', dlqPayload);
    } catch (error) {
      console.error('❌ Failed to publish to DLQ:', error);
    }
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
      case 'manual':
        return 'manual';
      default:
        return 'unknown';
    }
  }

  async fetchExchangeBalances(exchange: string): Promise<ExchangeBalance[]> {
    if (!this.connected) {
      throw new Error('Execution Engine not connected');
    }

    const subject = `titan.execution.get_balances.${exchange.toLowerCase()}`;
    try {
      // Request with 5s timeout

      const response = await this.nats.request(subject, {}, { timeout: 5000 });
      return (response as { balances: ExchangeBalance[] }).balances || [];
    } catch (error) {
      console.error(
        `❌ Failed to fetch balances for ${exchange}:`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Fetch exchange positions from Execution Engine
   * @param exchange Exchange identifier
   */
  async fetchExchangePositions(exchange: string): Promise<ExecutionPosition[]> {
    if (!this.connected) {
      throw new Error('Execution Engine not connected');
    }

    const subject = `titan.execution.get_positions.${exchange.toLowerCase()}`;
    try {
      // Request with 5s timeout

      const response = await this.nats.request(subject, {}, { timeout: 5000 });
      return (response as { positions: ExecutionPosition[] }).positions || [];
      // console.warn(
      //   "⚠️ fetchExchangePositions not implemented for NATS yet (simulated)",
      // );
      // return [];
    } catch (error) {
      console.error(
        `❌ Failed to fetch positions for ${exchange}:`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}
