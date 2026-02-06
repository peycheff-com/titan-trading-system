/**
 * Fast Path IPC Client - Shared Version
 *
 * Sends signals to Execution Service via Unix Domain Socket for sub-millisecond latency.
 * Implements PREPARE/CONFIRM/ABORT signal flow with HMAC authentication.
 *
 * Enhanced Features:
 * - Automatic reconnection with exponential backoff
 * - Connection pooling and management
 * - Comprehensive error handling for IPC communication failures
 * - Signal serialization and deserialization protocols
 * - Metrics collection and monitoring
 * - Graceful degradation on connection failures
 *
 * Requirements: 2.5, 5.1 (Fast Path IPC Integration)
 */
import * as net from 'net';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
/**
 * Market Regime State for BOCPD
 */
export var RegimeState;
(function (RegimeState) {
    RegimeState["STABLE"] = "STABLE";
    RegimeState["VOLATILE_BREAKOUT"] = "VOLATILE_BREAKOUT";
    RegimeState["MEAN_REVERSION"] = "MEAN_REVERSION";
    RegimeState["CRASH"] = "CRASH";
})(RegimeState || (RegimeState = {}));
/**
 * Connection state enum
 */
export var ConnectionState;
(function (ConnectionState) {
    ConnectionState["DISCONNECTED"] = "disconnected";
    ConnectionState["CONNECTING"] = "connecting";
    ConnectionState["CONNECTED"] = "connected";
    ConnectionState["RECONNECTING"] = "reconnecting";
    ConnectionState["FAILED"] = "failed";
})(ConnectionState || (ConnectionState = {}));
/**
 * Enhanced Fast Path IPC Client
 *
 * Communicates with Execution Service via Unix Domain Socket.
 * Provides sub-millisecond signal delivery for time-sensitive trades.
 */
export class FastPathClient extends EventEmitter {
    config;
    socket = null;
    connectionState = ConnectionState.DISCONNECTED;
    reconnectAttempts = 0;
    reconnectTimer = null;
    disconnecting = false;
    messageBuffer = '';
    pendingMessages = new Map();
    messageId = 0;
    metrics = {
        messagesSent: 0,
        messagesReceived: 0,
        messagesFailed: 0,
        reconnectAttempts: 0,
        totalLatencyMs: 0,
        avgLatencyMs: 0,
        minLatencyMs: Infinity,
        maxLatencyMs: 0,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
    };
    constructor(config) {
        super();
        const secretEnv = config?.hmacSecret || process.env.TITAN_HMAC_SECRET || process.env.HMAC_SECRET;
        if (!secretEnv && process.env.NODE_ENV !== 'test') {
            console.warn('WARN: FastPathClient initialized without HMAC secret. Signatures will fail.');
        }
        const finalSecret = secretEnv || (process.env.NODE_ENV === 'test' ? 'test-secret' : '');
        this.config = {
            socketPath: config?.socketPath || process.env.TITAN_IPC_SOCKET || '/tmp/titan-ipc.sock',
            hmacSecret: finalSecret,
            source: config?.source || 'scavenger',
            maxReconnectAttempts: config?.maxReconnectAttempts || 10,
            baseReconnectDelay: config?.baseReconnectDelay || 1000,
            maxReconnectDelay: config?.maxReconnectDelay || 30000,
            connectionTimeout: config?.connectionTimeout || 5000,
            messageTimeout: config?.messageTimeout || 1000,
            enableMetrics: config?.enableMetrics ?? true,
        };
    }
    /**
     * Get the configured source
     */
    getSource() {
        return this.config.source;
    }
    /**
     * Connect to IPC server with automatic reconnection
     */
    async connect() {
        if (this.connectionState === ConnectionState.CONNECTED && this.socket) {
            return;
        }
        if (this.connectionState === ConnectionState.CONNECTING) {
            return new Promise((resolve, reject) => {
                const onConnected = () => {
                    this.removeListener('error', onError);
                    resolve();
                };
                const onError = (error) => {
                    this.removeListener('connected', onConnected);
                    reject(error);
                };
                this.once('connected', onConnected);
                this.once('error', onError);
            });
        }
        return this.attemptConnection();
    }
    async attemptConnection() {
        return new Promise((resolve, reject) => {
            // eslint-disable-next-line functional/immutable-data
            this.connectionState = ConnectionState.CONNECTING;
            this.emit('connecting');
            if (this.socket) {
                this.socket.removeAllListeners();
                this.socket.destroy();
                // eslint-disable-next-line functional/immutable-data
                this.socket = null;
            }
            // eslint-disable-next-line functional/immutable-data
            this.socket = net.connect(this.config.socketPath);
            // eslint-disable-next-line functional/no-let
            let connectionTimeout = null;
            const cleanup = () => {
                if (connectionTimeout) {
                    clearTimeout(connectionTimeout);
                    connectionTimeout = null;
                }
            };
            this.socket.on('connect', () => {
                cleanup();
                // eslint-disable-next-line functional/immutable-data
                this.connectionState = ConnectionState.CONNECTED;
                // eslint-disable-next-line functional/immutable-data
                this.reconnectAttempts = 0;
                // eslint-disable-next-line functional/immutable-data
                this.metrics.lastConnectedAt = Date.now();
                console.log(`✅ [${this.config.source}] Connected to Execution Service via Fast Path IPC (${this.config.socketPath})`);
                this.emit('connected');
                resolve();
            });
            this.socket.on('data', (data) => {
                this.handleIncomingData(data);
            });
            this.socket.on('error', (error) => {
                cleanup();
                // eslint-disable-next-line functional/immutable-data
                this.connectionState = ConnectionState.FAILED;
                // eslint-disable-next-line functional/immutable-data
                this.metrics.lastDisconnectedAt = Date.now();
                if (this.disconnecting) {
                    reject(error);
                    return;
                }
                console.error(`❌ [${this.config.source}] Fast Path IPC error: ${error.message}`);
                this.emit('error', error);
                this.scheduleReconnection();
                reject(error);
            });
            this.socket.on('close', () => {
                cleanup();
                if (this.connectionState !== ConnectionState.FAILED) {
                    // eslint-disable-next-line functional/immutable-data
                    this.connectionState = ConnectionState.DISCONNECTED;
                }
                // eslint-disable-next-line functional/immutable-data
                this.metrics.lastDisconnectedAt = Date.now();
                console.log(`🔌 [${this.config.source}] Fast Path IPC connection closed`);
                this.emit('disconnected');
                this.clearPendingMessages('Connection closed');
                if (!this.disconnecting) {
                    this.scheduleReconnection();
                }
            });
            connectionTimeout = setTimeout(() => {
                cleanup();
                // eslint-disable-next-line functional/immutable-data
                this.connectionState = ConnectionState.FAILED;
                if (this.socket) {
                    this.socket.removeAllListeners();
                    this.socket.destroy();
                    // eslint-disable-next-line functional/immutable-data
                    this.socket = null;
                }
                const error = new Error(`IPC connection timeout after ${this.config.connectionTimeout}ms`);
                this.emit('error', error);
                reject(error);
            }, this.config.connectionTimeout);
        });
    }
    scheduleReconnection() {
        if (this.disconnecting || this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
                console.error(`❌ [${this.config.source}] Max reconnection attempts (${this.config.maxReconnectAttempts}) reached`);
                // eslint-disable-next-line functional/immutable-data
                this.connectionState = ConnectionState.FAILED;
                this.emit('maxReconnectAttemptsReached');
            }
            return;
        }
        // eslint-disable-next-line functional/immutable-data
        this.reconnectAttempts++;
        // eslint-disable-next-line functional/immutable-data
        this.metrics.reconnectAttempts++;
        const delay = Math.min(this.config.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.config.maxReconnectDelay);
        const jitter = Math.random() * 0.1 * delay;
        const finalDelay = delay + jitter;
        console.log(`🔄 [${this.config.source}] Scheduling reconnection attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${Math.round(finalDelay)}ms`);
        // eslint-disable-next-line functional/immutable-data
        this.connectionState = ConnectionState.RECONNECTING;
        this.emit('reconnecting', this.reconnectAttempts);
        // eslint-disable-next-line functional/immutable-data
        this.reconnectTimer = setTimeout(async () => {
            if (!this.disconnecting) {
                try {
                    await this.attemptConnection();
                }
                catch (error) {
                    // Connection failed, will be handled by error event
                }
            }
        }, finalDelay);
    }
    handleIncomingData(data) {
        // eslint-disable-next-line functional/immutable-data
        this.messageBuffer += data.toString();
        // eslint-disable-next-line functional/no-let
        let delimiterIndex;
        while ((delimiterIndex = this.messageBuffer.indexOf('\n')) !== -1) {
            const messageStr = this.messageBuffer.slice(0, delimiterIndex);
            // eslint-disable-next-line functional/immutable-data
            this.messageBuffer = this.messageBuffer.slice(delimiterIndex + 1);
            try {
                const message = JSON.parse(messageStr);
                this.handleMessage(message);
            }
            catch (error) {
                console.error(`❌ [${this.config.source}] Failed to parse IPC message: ${error instanceof Error ? error.message : 'Unknown error'}`);
                // eslint-disable-next-line functional/immutable-data
                this.metrics.messagesFailed++;
            }
        }
    }
    handleMessage(message) {
        // eslint-disable-next-line functional/immutable-data
        this.metrics.messagesReceived++;
        if (message.correlationId && this.pendingMessages.has(message.correlationId)) {
            const pending = this.pendingMessages.get(message.correlationId);
            // eslint-disable-next-line functional/immutable-data
            this.pendingMessages.delete(message.correlationId);
            clearTimeout(pending.timeout);
            if (this.config.enableMetrics && message.timestamp) {
                const latency = Date.now() - message.timestamp;
                this.updateLatencyMetrics(latency);
            }
            if (message.error) {
                pending.reject(new Error(message.error));
            }
            else {
                pending.resolve(message);
            }
        }
        else {
            this.emit('message', message);
        }
    }
    updateLatencyMetrics(latency) {
        // eslint-disable-next-line functional/immutable-data
        this.metrics.totalLatencyMs += latency;
        // eslint-disable-next-line functional/immutable-data
        this.metrics.minLatencyMs = Math.min(this.metrics.minLatencyMs, latency);
        // eslint-disable-next-line functional/immutable-data
        this.metrics.maxLatencyMs = Math.max(this.metrics.maxLatencyMs, latency);
        if (this.metrics.messagesReceived > 0) {
            // eslint-disable-next-line functional/immutable-data
            this.metrics.avgLatencyMs = this.metrics.totalLatencyMs / this.metrics.messagesReceived;
        }
    }
    clearPendingMessages(reason) {
        for (const [correlationId, pending] of this.pendingMessages) {
            clearTimeout(pending.timeout);
            pending.reject(new Error(reason));
        }
        // eslint-disable-next-line functional/immutable-data
        this.pendingMessages.clear();
    }
    /**
     * Send PREPARE signal
     */
    async sendPrepare(signal) {
        const enhancedSignal = {
            ...signal,
            signal_type: 'PREPARE',
            timestamp: Date.now(),
            source: this.config.source,
        };
        const message = {
            signal: enhancedSignal,
            signature: this.sign(enhancedSignal),
            correlationId: this.generateCorrelationId(),
            timestamp: Date.now(),
        };
        try {
            const response = await this.send(message);
            return response;
        }
        catch (error) {
            console.error(`❌ [${this.config.source}] Failed to send PREPARE signal: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw new Error(`PREPARE_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Send CONFIRM signal
     */
    async sendConfirm(signal_id) {
        const signal = {
            signal_id,
            signal_type: 'CONFIRM',
            timestamp: Date.now(),
            source: this.config.source,
        };
        const message = {
            signal,
            signature: this.sign(signal),
            correlationId: this.generateCorrelationId(),
            timestamp: Date.now(),
        };
        try {
            const response = await this.send(message);
            return response;
        }
        catch (error) {
            console.error(`❌ [${this.config.source}] Failed to send CONFIRM signal: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw new Error(`CONFIRM_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Send ABORT signal
     */
    async sendAbort(signal_id) {
        const signal = {
            signal_id,
            signal_type: 'ABORT',
            timestamp: Date.now(),
            source: this.config.source,
        };
        const message = {
            signal,
            signature: this.sign(signal),
            correlationId: this.generateCorrelationId(),
            timestamp: Date.now(),
        };
        try {
            const response = await this.send(message);
            return response;
        }
        catch (error) {
            console.error(`❌ [${this.config.source}] Failed to send ABORT signal: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw new Error(`ABORT_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    generateCorrelationId() {
        // eslint-disable-next-line functional/immutable-data
        return `${this.config.source}-${Date.now()}-${++this.messageId}`;
    }
    async send(message, timeout) {
        if (this.connectionState !== ConnectionState.CONNECTED || !this.socket) {
            throw new Error('NOT_CONNECTED');
        }
        const actualTimeout = timeout || this.config.messageTimeout;
        const correlationId = message.correlationId;
        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                // eslint-disable-next-line functional/immutable-data
                this.pendingMessages.delete(correlationId);
                // eslint-disable-next-line functional/immutable-data
                this.metrics.messagesFailed++;
                reject(new Error(`IPC_TIMEOUT: No response received within ${actualTimeout}ms`));
            }, actualTimeout);
            // eslint-disable-next-line functional/immutable-data
            this.pendingMessages.set(correlationId, {
                resolve,
                reject,
                timeout: timeoutHandle,
            });
            try {
                const messageStr = this.serializeMessage(message);
                const success = this.socket.write(messageStr);
                if (!success) {
                    this.socket.once('drain', () => {
                        console.log(`[${this.config.source}] Socket drained after backpressure`);
                    });
                }
                // eslint-disable-next-line functional/immutable-data
                this.metrics.messagesSent++;
            }
            catch (error) {
                // eslint-disable-next-line functional/immutable-data
                this.pendingMessages.delete(correlationId);
                clearTimeout(timeoutHandle);
                // eslint-disable-next-line functional/immutable-data
                this.metrics.messagesFailed++;
                reject(new Error(`SEND_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`));
            }
        });
    }
    serializeMessage(message) {
        try {
            return JSON.stringify(message) + '\n';
        }
        catch (error) {
            throw new Error(`SERIALIZATION_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    sign(signal) {
        try {
            const normalizedSignal = this.normalizeForSigning(signal);
            return crypto
                .createHmac('sha256', this.config.hmacSecret)
                .update(JSON.stringify(normalizedSignal))
                .digest('hex');
        }
        catch (error) {
            throw new Error(`SIGNATURE_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    normalizeForSigning(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map((item) => this.normalizeForSigning(item));
        }
        const normalized = {};
        const keys = Object.keys(obj).sort();
        for (const key of keys) {
            const value = obj[key];
            if (value !== undefined) {
                // eslint-disable-next-line functional/immutable-data
                normalized[key] = this.normalizeForSigning(value);
            }
        }
        return normalized;
    }
    async disconnect() {
        // eslint-disable-next-line functional/immutable-data
        this.disconnecting = true;
        // eslint-disable-next-line functional/immutable-data
        this.connectionState = ConnectionState.DISCONNECTED;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            // eslint-disable-next-line functional/immutable-data
            this.reconnectTimer = null;
        }
        this.clearPendingMessages('Client disconnecting');
        if (this.socket) {
            return new Promise((resolve) => {
                const cleanup = () => {
                    if (this.socket) {
                        this.socket.removeAllListeners();
                        this.socket.destroy();
                        // eslint-disable-next-line functional/immutable-data
                        this.socket = null;
                    }
                    this.emit('disconnected');
                    resolve();
                };
                this.socket.end();
                setTimeout(cleanup, 1000);
                this.socket.once('close', cleanup);
            });
        }
    }
    isConnected() {
        return this.connectionState === ConnectionState.CONNECTED;
    }
    getConnectionState() {
        return this.connectionState;
    }
    getStatus() {
        return {
            connectionState: this.connectionState,
            socketPath: this.config.socketPath,
            source: this.config.source,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.config.maxReconnectAttempts,
            pendingMessages: this.pendingMessages.size,
            metrics: { ...this.metrics },
        };
    }
    getMetrics() {
        return { ...this.metrics };
    }
    resetMetrics() {
        // eslint-disable-next-line functional/immutable-data
        this.metrics = {
            messagesSent: 0,
            messagesReceived: 0,
            messagesFailed: 0,
            reconnectAttempts: 0,
            totalLatencyMs: 0,
            avgLatencyMs: 0,
            minLatencyMs: Infinity,
            maxLatencyMs: 0,
            lastConnectedAt: null,
            lastDisconnectedAt: null,
        };
    }
    async ping() {
        if (!this.isConnected()) {
            return { success: false, error: 'Not connected' };
        }
        const startTime = Date.now();
        try {
            const message = {
                signal: { signal_type: 'PING', timestamp: startTime },
                signature: this.sign({
                    signal_type: 'PING',
                    timestamp: startTime,
                }),
                correlationId: this.generateCorrelationId(),
                timestamp: startTime,
            };
            await this.send(message, 5000);
            const latency = Date.now() - startTime;
            return { success: true, latency };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    async forceReconnect() {
        console.log(`🔄 [${this.config.source}] Force reconnecting...`);
        await this.disconnect();
        // eslint-disable-next-line functional/immutable-data
        this.disconnecting = false;
        // eslint-disable-next-line functional/immutable-data
        this.reconnectAttempts = 0;
        await this.connect();
    }
}
//# sourceMappingURL=FastPathClient.js.map