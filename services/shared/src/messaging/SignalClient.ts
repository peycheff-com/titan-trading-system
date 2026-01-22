import { getNatsClient, NatsClient, TitanSubject } from './NatsClient.js';
import {
  AbortResponse,
  ConfirmResponse,
  ConnectionState,
  IntentSignal,
  PrepareResponse,
  SignalSource,
} from '../ipc/index.js';
import { EventEmitter } from 'eventemitter3';

export class SignalClient extends EventEmitter {
  private nats: NatsClient;
  private pendingSignals: Map<string, IntentSignal> = new Map();
  private source: SignalSource;

  constructor(config: { source: SignalSource }) {
    super();
    this.source = config.source;
    this.nats = getNatsClient();
  }

  async connect(): Promise<void> {
    if (!this.nats.isConnected()) {
      await this.nats.connect();
    }
  }

  async disconnect(): Promise<void> {
    // Shared NATS client usually remains open
  }

  isConnected(): boolean {
    return this.nats.isConnected();
  }

  // Mimic FastPathClient interface
  getConnectionState(): ConnectionState {
    return this.nats.isConnected() ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED;
  }

  async sendPrepare(signal: IntentSignal): Promise<PrepareResponse> {
    if (!this.isConnected()) {
      try {
        await this.connect();
      } catch (e) {
        console.error('Auto-connect failed', e);
      }
    }

    if (!signal.symbol || !signal.signal_id) {
      return {
        prepared: false,
        signal_id: signal.signal_id,
        reason: 'Invalid signal data',
      };
    }

    // Cache locally for Confirm phase
    // eslint-disable-next-line functional/immutable-data
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

    // Payload for Brain
    const payload = {
      signal_id: signal.signal_id,
      source: this.source,
      symbol: signal.symbol,
      direction: signal.direction,
      signal_type: 'SETUP_CONFIRMATION',
      timestamp: Date.now(),
      payload: signal, // Embed full signal details
    };

    try {
      // Publish to Brain (titan.signal.submit.v1)
      // Brain will validate -> check risk -> convert to Intent -> Publish CMD_EXEC_PLACE
      await this.nats.publish(TitanSubject.SIGNAL_SUBMIT, payload);

      // Cleanup local state
      // eslint-disable-next-line functional/immutable-data
      this.pendingSignals.delete(signal_id);

      return {
        executed: true,
        fill_price: (signal.entry_zone.min + signal.entry_zone.max) / 2, // Optimistic / Unknown
      };
    } catch (e: any) {
      return { executed: false, reason: e.message };
    }
  }

  async sendAbort(signal_id: string): Promise<AbortResponse> {
    // eslint-disable-next-line functional/immutable-data
    this.pendingSignals.delete(signal_id);
    return { aborted: true };
  }

  // Compatibility methods
  getMetrics(): any {
    return {
      messagesSent: 0,
      messagesReceived: 0,
      reconnectAttempts: 0,
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
    await this.connect();
  }
}
