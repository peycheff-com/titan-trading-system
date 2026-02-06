import { getNatsClient, TitanSubject } from './NatsClient.js';
import { ConnectionState, } from '../ipc/index.js';
import { validateIntentPayload } from '../schemas/intentSchema.js';
import { EventEmitter } from 'eventemitter3';
export class ExecutionClient extends EventEmitter {
    nats;
    pendingSignals = new Map();
    source;
    constructor(config) {
        super();
        this.source = config.source;
        this.nats = getNatsClient();
    }
    async connect() {
        // Assuming NATS client connects via its own config/singleton.
        // We just ensure it's theoretically reachable or proxied.
        if (!this.nats.isConnected()) {
            await this.nats.connect();
        }
    }
    async disconnect() {
        // We don't necessarily want to close the shared NATS client
        // if others are using it, but for now specific to this lifecycle:
        // implementation usually doesn't close shared instances.
    }
    isConnected() {
        return this.nats.isConnected();
    }
    // Mimic FastPathClient interface
    getConnectionState() {
        return this.nats.isConnected() ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED;
    }
    async sendPrepare(signal) {
        // In NATS fire-and-forget (until we implement Req/Rep in Rust),
        // we simulate the "Prepare" phase by caching valid signals locally.
        if (!this.isConnected()) {
            // Try to auto-connect
            try {
                await this.connect();
            }
            catch (e) {
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
        // eslint-disable-next-line functional/immutable-data
        this.pendingSignals.set(signal.signal_id, signal);
        return {
            prepared: true,
            signal_id: signal.signal_id,
        };
    }
    async sendConfirm(signal_id) {
        const signal = this.pendingSignals.get(signal_id);
        if (!signal) {
            return { executed: false, reason: 'Signal not found or expired' };
        }
        // Transform to Rust structure
        const directionInt = signal.direction === 'LONG' ? 1 : -1;
        const intentType = signal.direction === 'LONG' ? 'BUY_SETUP' : 'SELL_SETUP';
        const tSignal = signal.timestamp ?? Date.now();
        const rustPayload = {
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
            // eslint-disable-next-line functional/immutable-data
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
        // Create Envelope
        const { createIntentMessage } = await import('../schemas/intentSchema.js');
        const envelope = createIntentMessage(validation.data, 'titan-brain', signal.signal_id);
        try {
            await this.nats.publish(subject, envelope);
            // Cleanup
            // eslint-disable-next-line functional/immutable-data
            this.pendingSignals.delete(signal_id);
            return {
                executed: true,
                // fill_price is unknown in async NATS flow currently
                fill_price: (signal.entry_zone.min + signal.entry_zone.max) / 2,
            };
        }
        catch (e) {
            return { executed: false, reason: e.message };
        }
    }
    async sendAbort(signal_id) {
        // eslint-disable-next-line functional/immutable-data
        this.pendingSignals.delete(signal_id);
        return { aborted: true };
    }
    async publishDlq(payload, reason) {
        try {
            const dlqPayload = {
                reason,
                payload,
                t_ingress: Date.now(),
            };
            await this.nats.publish('titan.dlq.execution.core', dlqPayload);
            await this.nats.publish('titan.execution.dlq', dlqPayload);
        }
        catch (e) {
            console.error('Failed to publish intent to DLQ', e);
        }
    }
    // Compatibility methods
    getMetrics() {
        return {
            messagesSent: 0,
            messagesReceived: 0,
            reconnectAttempts: 0,
            // connectionState: this.getConnectionState() // redundant in metrics usually
        };
    }
    getStatus() {
        return {
            connectionState: this.getConnectionState(),
            socketPath: 'nats://' + (this.nats.isConnected() ? 'connected' : 'disconnected'),
            source: this.source,
            metrics: this.getMetrics(),
        };
    }
    async forceReconnect() {
        // await this.nats.close(); // NatsClient might not expose close directly or safely?
        await this.connect();
    }
}
//# sourceMappingURL=ExecutionClient.js.map