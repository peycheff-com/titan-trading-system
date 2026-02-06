import { getNatsClient, TitanSubject } from './NatsClient.js';
import { ConnectionState, } from '../ipc/index.js';
import { EventEmitter } from 'eventemitter3';
export class SignalClient extends EventEmitter {
    nats;
    pendingSignals = new Map();
    source;
    constructor(config) {
        super();
        this.source = config.source;
        this.nats = getNatsClient();
    }
    async connect() {
        console.log('DEBUG: Connecting to NATS with:', {
            url: process.env.NATS_URL,
            user: process.env.NATS_USER,
            pass: process.env.NATS_PASS ? '****' : 'none',
        });
        if (!this.nats.isConnected()) {
            await this.nats.connect({
                servers: [process.env.NATS_URL || 'nats://localhost:4222'],
                user: process.env.NATS_USER,
                pass: process.env.NATS_PASS,
                token: process.env.NATS_TOKEN,
            });
        }
    }
    async disconnect() {
        // Shared NATS client usually remains open
    }
    isConnected() {
        return this.nats.isConnected();
    }
    // Mimic FastPathClient interface
    getConnectionState() {
        return this.nats.isConnected() ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED;
    }
    async sendPrepare(signal) {
        if (!this.isConnected()) {
            try {
                await this.connect();
            }
            catch (e) {
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
    async sendConfirm(signal_id) {
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
        }
        catch (e) {
            return {
                executed: false,
                reason: e instanceof Error ? e.message : String(e),
            };
        }
    }
    async sendAbort(signal_id) {
        // eslint-disable-next-line functional/immutable-data
        this.pendingSignals.delete(signal_id);
        return { aborted: true };
    }
    // Compatibility methods
    getMetrics() {
        return {
            messagesSent: 0,
            messagesReceived: 0,
            reconnectAttempts: 0,
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
        await this.connect();
    }
}
//# sourceMappingURL=SignalClient.js.map