import { getNatsClient, NatsClient, TitanSubject } from './NatsClient.js';
import {
  AbortResponse,
  ConfirmResponse,
  ConnectionState,
  IntentSignal,
  PrepareResponse,
  SignalSource,
} from '../ipc/index.js';
import { validateIntentPayload } from '../schemas/intentSchema.js';
import { EventEmitter } from 'eventemitter3';

// Rust-compatible definitions
interface RustIntent {
  schema_version?: string;
  signal_id: string;
  source: string;
  symbol: string;
  direction: number; // 1 (Long) or -1 (Short)
  type: string; // "BUY_SETUP", "SELL_SETUP", etc.
  entry_zone: number[];
  stop_loss: number;
  take_profits: number[];
  size: number;
  status: string; // "PENDING"
  received_at: string; // ISO date
  t_signal: number;
  timestamp?: number;
  t_exchange?: number;
  metadata?: any;
}

export class ExecutionClient extends EventEmitter {
  private nats: NatsClient;
  private pendingSignals: Map<string, IntentSignal> = new Map();
  private source: SignalSource;

  constructor(config: { source: SignalSource }) {
    super();
    this.source = config.source;
    this.nats = getNatsClient();
  }

  async connect(): Promise<void> {
    // Assuming NATS client connects via its own config/singleton.
    // We just ensure it's theoretically reachable or proxied.
    if (!this.nats.isConnected()) {
      await this.nats.connect();
    }
  }

  async disconnect(): Promise<void> {
    // We don't necessarily want to close the shared NATS client
    // if others are using it, but for now specific to this lifecycle:
    // implementation usually doesn't close shared instances.
  }

  isConnected(): boolean {
    return this.nats.isConnected();
  }

  // Mimic FastPathClient interface
  getConnectionState(): ConnectionState {
    return this.nats.isConnected() ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED;
  }

  async sendPrepare(signal: IntentSignal): Promise<PrepareResponse> {
    // In NATS fire-and-forget (until we implement Req/Rep in Rust),
    // we simulate the "Prepare" phase by caching valid signals locally.

    if (!this.isConnected()) {
      // Try to auto-connect
      try {
        await this.connect();
      } catch (e) {
        console.error('Auto-connect failed', e);
      }
    }

    // Validation (simplified)
    if (!signal.symbol || !signal.signal_id) {
      return {
        prepared: false,
        signal_id: signal.signal_id,
        reason: 'Invalid signal data',
      };
    }

    // Storage for Confirm phase
    this.pendingSignals.set(signal.signal_id, signal);

    return {
      prepared: true,
      signal_id: signal.signal_id,
    };
  }

  async sendConfirm(signal_id: string): Promise<ConfirmResponse> {
    const signal = this.pendingSignals.get(signal_id);
    if (!signal) {
      return { executed: false, reason: 'Signal not found or expired' };
    }

    // Transform to Rust structure
    const directionInt = signal.direction === 'LONG' ? 1 : -1;
    const intentType = signal.direction === 'LONG' ? 'BUY_SETUP' : 'SELL_SETUP';
    const tSignal = signal.timestamp ?? Date.now();

    const rustPayload: RustIntent = {
      schema_version: '1.0.0',
      signal_id: signal.signal_id,
      source: this.source,
      symbol: signal.symbol,
      direction: directionInt,
      type: intentType,
      entry_zone: [signal.entry_zone.min, signal.entry_zone.max],
      stop_loss: signal.stop_loss,
      take_profits: signal.take_profits,
      size: 0, // Default to 0, let Rust ShadowState calculation handle risk sizing
      status: 'PENDING',
      received_at: new Date().toISOString(),
      t_signal: tSignal,
      timestamp: tSignal,
      t_exchange: signal.t_exchange,
      metadata: {
        confidence: signal.confidence,
        leverage: signal.leverage,
        original_source: this.source,
        correlation_id: signal.signal_id,
        intent_schema_version: '1.0.0',
      },
    };

    const validation = validateIntentPayload(rustPayload);
    if (!validation.valid) {
      await this.publishDlq(rustPayload, validation.errors.join('; '));
      this.pendingSignals.delete(signal_id);
      return { executed: false, reason: 'Invalid intent payload' };
    }

    // Publish to NATS
    // Subject: titan.cmd.exec.place.v1.<venue>.<account>.<symbol>
    // Rust subscribes to `titan.cmd.exec.>`
    const symbolToken = signal.symbol.replace('/', '_');
    const venue = 'auto';
    const account = 'main';
    const subject = `${TitanSubject.CMD_EXEC_PLACE}.${venue}.${account}.${symbolToken}`;

    try {
      await this.nats.publish(subject, rustPayload);

      // Cleanup
      this.pendingSignals.delete(signal_id);

      return {
        executed: true,
        // fill_price is unknown in async NATS flow currently
        fill_price: (signal.entry_zone.min + signal.entry_zone.max) / 2,
      };
    } catch (e: any) {
      return { executed: false, reason: e.message };
    }
  }

  async sendAbort(signal_id: string): Promise<AbortResponse> {
    this.pendingSignals.delete(signal_id);
    return { aborted: true };
  }

  private async publishDlq(payload: RustIntent, reason: string): Promise<void> {
    try {
      const dlqPayload = {
        reason,
        payload,
        t_ingress: Date.now(),
      };
      await this.nats.publish('titan.dlq.execution.core', dlqPayload);
      await this.nats.publish('titan.execution.dlq', dlqPayload);
    } catch (e) {
      console.error('Failed to publish intent to DLQ', e);
    }
  }

  // Compatibility methods
  getMetrics(): any {
    return {
      messagesSent: 0,
      messagesReceived: 0,
      reconnectAttempts: 0,
      // connectionState: this.getConnectionState() // redundant in metrics usually
    };
  }

  getStatus(): any {
    return {
      connectionState: this.getConnectionState(),
      socketPath: 'nats://' + (this.nats.isConnected() ? 'connected' : 'disconnected'),
      source: this.source,
      metrics: this.getMetrics(),
    };
  }

  async forceReconnect(): Promise<void> {
    // await this.nats.close(); // NatsClient might not expose close directly or safely?
    await this.connect();
  }
}
