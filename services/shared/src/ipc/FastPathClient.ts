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

import * as net from "net";
import * as crypto from "crypto";
import { EventEmitter } from "events";

/**
 * Source service identifier
 */
export type SignalSource = "scavenger" | "hunter" | "sentinel" | "brain";

/**
 * Intent Signal sent to Execution Service
 */
export interface IntentSignal {
    signal_id: string;
    source: SignalSource;
    symbol: string;
    direction: "LONG" | "SHORT";
    entry_zone: { min: number; max: number };
    stop_loss: number;
    take_profits: number[];
    confidence: number;
    leverage: number;
    velocity?: number;
    trap_type?: string;
    timestamp: number; // Signal generation time (t_signal)
    t_analysis?: number; // Time analysis completed
    t_decision?: number; // Time Brain approved
    t_ingress?: number; // Time Execution engine received it
    t_exchange?: number; // Exchange matching engine timestamp
    max_slippage_bps?: number; // Maximum allowed slippage in basis points
}

/**
 * Report of a trade fill (Execution -> Brain/Accountant)
 */
export interface FillReport {
    fill_id: string;
    signal_id: string;
    symbol: string;
    side: "BUY" | "SELL";
    price: number;
    qty: number;
    fee: number;
    fee_currency: string;
    t_signal: number;
    t_exchange: number;
    t_ingress: number;
}

/**
 * Response from PREPARE signal
 */
export interface PrepareResponse {
    prepared: boolean;
    signal_id: string;
    position_size?: number;
    rejected?: boolean;
    reason?: string;
}

/**
 * Response from CONFIRM signal
 */
export interface ConfirmResponse {
    executed: boolean;
    fill_price?: number;
    rejected?: boolean;
    reason?: string;
}

/**
 * Response from ABORT signal
 */
export interface AbortResponse {
    aborted: boolean;
}

/**
 * Connection state enum
 */
export enum ConnectionState {
    DISCONNECTED = "disconnected",
    CONNECTING = "connecting",
    CONNECTED = "connected",
    RECONNECTING = "reconnecting",
    FAILED = "failed",
}

/**
 * IPC Client configuration
 */
export interface IPCClientConfig {
    socketPath: string;
    hmacSecret: string;
    source: SignalSource;
    maxReconnectAttempts: number;
    baseReconnectDelay: number;
    maxReconnectDelay: number;
    connectionTimeout: number;
    messageTimeout: number;
    enableMetrics: boolean;
}

/**
 * IPC Client metrics
 */
export interface IPCMetrics {
    messagesSent: number;
    messagesReceived: number;
    messagesFailed: number;
    reconnectAttempts: number;
    totalLatencyMs: number;
    avgLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    lastConnectedAt: number | null;
    lastDisconnectedAt: number | null;
}

/**
 * Enhanced Fast Path IPC Client
 *
 * Communicates with Execution Service via Unix Domain Socket.
 * Provides sub-millisecond signal delivery for time-sensitive trades.
 */
export class FastPathClient extends EventEmitter {
    private config: IPCClientConfig;
    private socket: net.Socket | null = null;
    private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
    private reconnectAttempts: number = 0;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private disconnecting: boolean = false;
    private messageBuffer: string = "";
    private pendingMessages: Map<
        string,
        { resolve: Function; reject: Function; timeout: NodeJS.Timeout }
    > = new Map();
    private messageId: number = 0;

    private metrics: IPCMetrics = {
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

    constructor(config?: Partial<IPCClientConfig>) {
        super();

        this.config = {
            socketPath: config?.socketPath || process.env.TITAN_IPC_SOCKET ||
                "/tmp/titan-ipc.sock",
            hmacSecret: config?.hmacSecret || process.env.TITAN_HMAC_SECRET ||
                "default-secret",
            source: config?.source || "scavenger",
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
    getSource(): SignalSource {
        return this.config.source;
    }

    /**
     * Connect to IPC server with automatic reconnection
     */
    async connect(): Promise<void> {
        if (this.connectionState === ConnectionState.CONNECTED && this.socket) {
            return;
        }

        if (this.connectionState === ConnectionState.CONNECTING) {
            return new Promise((resolve, reject) => {
                const onConnected = () => {
                    this.removeListener("error", onError);
                    resolve();
                };
                const onError = (error: Error) => {
                    this.removeListener("connected", onConnected);
                    reject(error);
                };

                this.once("connected", onConnected);
                this.once("error", onError);
            });
        }

        return this.attemptConnection();
    }

    private async attemptConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.connectionState = ConnectionState.CONNECTING;
            this.emit("connecting");

            if (this.socket) {
                this.socket.removeAllListeners();
                this.socket.destroy();
                this.socket = null;
            }

            this.socket = net.connect(this.config.socketPath);
            let connectionTimeout: NodeJS.Timeout | null = null;

            const cleanup = () => {
                if (connectionTimeout) {
                    clearTimeout(connectionTimeout);
                    connectionTimeout = null;
                }
            };

            this.socket.on("connect", () => {
                cleanup();
                this.connectionState = ConnectionState.CONNECTED;
                this.reconnectAttempts = 0;
                this.metrics.lastConnectedAt = Date.now();

                console.log(
                    `✅ [${this.config.source}] Connected to Execution Service via Fast Path IPC (${this.config.socketPath})`,
                );
                this.emit("connected");
                resolve();
            });

            this.socket.on("data", (data: Buffer) => {
                this.handleIncomingData(data);
            });

            this.socket.on("error", (error: Error) => {
                cleanup();
                this.connectionState = ConnectionState.FAILED;
                this.metrics.lastDisconnectedAt = Date.now();

                if (this.disconnecting) {
                    reject(error);
                    return;
                }

                console.error(
                    `❌ [${this.config.source}] Fast Path IPC error: ${error.message}`,
                );
                this.emit("error", error);
                this.scheduleReconnection();
                reject(error);
            });

            this.socket.on("close", () => {
                cleanup();
                if (this.connectionState !== ConnectionState.FAILED) {
                    this.connectionState = ConnectionState.DISCONNECTED;
                }
                this.metrics.lastDisconnectedAt = Date.now();

                console.log(
                    `🔌 [${this.config.source}] Fast Path IPC connection closed`,
                );
                this.emit("disconnected");
                this.clearPendingMessages("Connection closed");

                if (!this.disconnecting) {
                    this.scheduleReconnection();
                }
            });

            connectionTimeout = setTimeout(() => {
                cleanup();
                this.connectionState = ConnectionState.FAILED;

                if (this.socket) {
                    this.socket.removeAllListeners();
                    this.socket.destroy();
                    this.socket = null;
                }

                const error = new Error(
                    `IPC connection timeout after ${this.config.connectionTimeout}ms`,
                );
                this.emit("error", error);
                reject(error);
            }, this.config.connectionTimeout);
        });
    }

    private scheduleReconnection(): void {
        if (
            this.disconnecting ||
            this.reconnectAttempts >= this.config.maxReconnectAttempts
        ) {
            if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
                console.error(
                    `❌ [${this.config.source}] Max reconnection attempts (${this.config.maxReconnectAttempts}) reached`,
                );
                this.connectionState = ConnectionState.FAILED;
                this.emit("maxReconnectAttemptsReached");
            }
            return;
        }

        this.reconnectAttempts++;
        this.metrics.reconnectAttempts++;

        const delay = Math.min(
            this.config.baseReconnectDelay *
                Math.pow(2, this.reconnectAttempts - 1),
            this.config.maxReconnectDelay,
        );
        const jitter = Math.random() * 0.1 * delay;
        const finalDelay = delay + jitter;

        console.log(
            `🔄 [${this.config.source}] Scheduling reconnection attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${
                Math.round(finalDelay)
            }ms`,
        );

        this.connectionState = ConnectionState.RECONNECTING;
        this.emit("reconnecting", this.reconnectAttempts);

        this.reconnectTimer = setTimeout(async () => {
            if (!this.disconnecting) {
                try {
                    await this.attemptConnection();
                } catch (error) {
                    // Connection failed, will be handled by error event
                }
            }
        }, finalDelay);
    }

    private handleIncomingData(data: Buffer): void {
        this.messageBuffer += data.toString();

        let delimiterIndex;
        while ((delimiterIndex = this.messageBuffer.indexOf("\n")) !== -1) {
            const messageStr = this.messageBuffer.slice(0, delimiterIndex);
            this.messageBuffer = this.messageBuffer.slice(delimiterIndex + 1);

            try {
                const message = JSON.parse(messageStr);
                this.handleMessage(message);
            } catch (error) {
                console.error(
                    `❌ [${this.config.source}] Failed to parse IPC message: ${
                        error instanceof Error ? error.message : "Unknown error"
                    }`,
                );
                this.metrics.messagesFailed++;
            }
        }
    }

    private handleMessage(message: any): void {
        this.metrics.messagesReceived++;

        if (
            message.correlationId &&
            this.pendingMessages.has(message.correlationId)
        ) {
            const pending = this.pendingMessages.get(message.correlationId)!;
            this.pendingMessages.delete(message.correlationId);

            clearTimeout(pending.timeout);

            if (this.config.enableMetrics && message.timestamp) {
                const latency = Date.now() - message.timestamp;
                this.updateLatencyMetrics(latency);
            }

            if (message.error) {
                pending.reject(new Error(message.error));
            } else {
                pending.resolve(message);
            }
        } else {
            this.emit("message", message);
        }
    }

    private updateLatencyMetrics(latency: number): void {
        this.metrics.totalLatencyMs += latency;
        this.metrics.minLatencyMs = Math.min(
            this.metrics.minLatencyMs,
            latency,
        );
        this.metrics.maxLatencyMs = Math.max(
            this.metrics.maxLatencyMs,
            latency,
        );

        if (this.metrics.messagesReceived > 0) {
            this.metrics.avgLatencyMs = this.metrics.totalLatencyMs /
                this.metrics.messagesReceived;
        }
    }

    private clearPendingMessages(reason: string): void {
        for (const [correlationId, pending] of this.pendingMessages) {
            clearTimeout(pending.timeout);
            pending.reject(new Error(reason));
        }
        this.pendingMessages.clear();
    }

    /**
     * Send PREPARE signal
     */
    async sendPrepare(signal: IntentSignal): Promise<PrepareResponse> {
        const enhancedSignal = {
            ...signal,
            signal_type: "PREPARE",
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
            return response as PrepareResponse;
        } catch (error) {
            console.error(
                `❌ [${this.config.source}] Failed to send PREPARE signal: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
            throw new Error(
                `PREPARE_FAILED: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }

    /**
     * Send CONFIRM signal
     */
    async sendConfirm(signal_id: string): Promise<ConfirmResponse> {
        const signal = {
            signal_id,
            signal_type: "CONFIRM",
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
            return response as ConfirmResponse;
        } catch (error) {
            console.error(
                `❌ [${this.config.source}] Failed to send CONFIRM signal: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
            throw new Error(
                `CONFIRM_FAILED: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }

    /**
     * Send ABORT signal
     */
    async sendAbort(signal_id: string): Promise<AbortResponse> {
        const signal = {
            signal_id,
            signal_type: "ABORT",
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
            return response as AbortResponse;
        } catch (error) {
            console.error(
                `❌ [${this.config.source}] Failed to send ABORT signal: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
            throw new Error(
                `ABORT_FAILED: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }

    private generateCorrelationId(): string {
        return `${this.config.source}-${Date.now()}-${++this.messageId}`;
    }

    private async send(message: any, timeout?: number): Promise<any> {
        if (
            this.connectionState !== ConnectionState.CONNECTED || !this.socket
        ) {
            throw new Error("NOT_CONNECTED");
        }

        const actualTimeout = timeout || this.config.messageTimeout;
        const correlationId = message.correlationId;

        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                this.pendingMessages.delete(correlationId);
                this.metrics.messagesFailed++;
                reject(
                    new Error(
                        `IPC_TIMEOUT: No response received within ${actualTimeout}ms`,
                    ),
                );
            }, actualTimeout);

            this.pendingMessages.set(correlationId, {
                resolve,
                reject,
                timeout: timeoutHandle,
            });

            try {
                const messageStr = this.serializeMessage(message);
                const success = this.socket!.write(messageStr);

                if (!success) {
                    this.socket!.once("drain", () => {
                        console.log(
                            `[${this.config.source}] Socket drained after backpressure`,
                        );
                    });
                }

                this.metrics.messagesSent++;
            } catch (error) {
                this.pendingMessages.delete(correlationId);
                clearTimeout(timeoutHandle);
                this.metrics.messagesFailed++;
                reject(
                    new Error(
                        `SEND_FAILED: ${
                            error instanceof Error
                                ? error.message
                                : "Unknown error"
                        }`,
                    ),
                );
            }
        });
    }

    private serializeMessage(message: any): string {
        try {
            return JSON.stringify(message) + "\n";
        } catch (error) {
            throw new Error(
                `SERIALIZATION_FAILED: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }

    private sign(signal: any): string {
        try {
            const normalizedSignal = this.normalizeForSigning(signal);
            return crypto
                .createHmac("sha256", this.config.hmacSecret)
                .update(JSON.stringify(normalizedSignal))
                .digest("hex");
        } catch (error) {
            throw new Error(
                `SIGNATURE_FAILED: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
            );
        }
    }

    private normalizeForSigning(obj: any): any {
        if (obj === null || typeof obj !== "object") {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map((item) => this.normalizeForSigning(item));
        }

        const normalized: any = {};
        const keys = Object.keys(obj).sort();

        for (const key of keys) {
            const value = obj[key];
            if (value !== undefined) {
                normalized[key] = this.normalizeForSigning(value);
            }
        }

        return normalized;
    }

    async disconnect(): Promise<void> {
        this.disconnecting = true;
        this.connectionState = ConnectionState.DISCONNECTED;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.clearPendingMessages("Client disconnecting");

        if (this.socket) {
            return new Promise<void>((resolve) => {
                const cleanup = () => {
                    if (this.socket) {
                        this.socket.removeAllListeners();
                        this.socket.destroy();
                        this.socket = null;
                    }
                    this.emit("disconnected");
                    resolve();
                };

                this.socket!.end();
                setTimeout(cleanup, 1000);
                this.socket!.once("close", cleanup);
            });
        }
    }

    isConnected(): boolean {
        return this.connectionState === ConnectionState.CONNECTED;
    }

    getConnectionState(): ConnectionState {
        return this.connectionState;
    }

    getStatus(): {
        connectionState: ConnectionState;
        socketPath: string;
        source: SignalSource;
        reconnectAttempts: number;
        maxReconnectAttempts: number;
        pendingMessages: number;
        metrics: IPCMetrics;
    } {
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

    getMetrics(): IPCMetrics {
        return { ...this.metrics };
    }

    resetMetrics(): void {
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

    async ping(): Promise<
        { success: boolean; latency?: number; error?: string }
    > {
        if (!this.isConnected()) {
            return { success: false, error: "Not connected" };
        }

        const startTime = Date.now();

        try {
            const message = {
                signal: { signal_type: "PING", timestamp: startTime },
                signature: this.sign({
                    signal_type: "PING",
                    timestamp: startTime,
                }),
                correlationId: this.generateCorrelationId(),
                timestamp: startTime,
            };

            await this.send(message, 5000);
            const latency = Date.now() - startTime;

            return { success: true, latency };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    async forceReconnect(): Promise<void> {
        console.log(`🔄 [${this.config.source}] Force reconnecting...`);

        await this.disconnect();

        this.disconnecting = false;
        this.reconnectAttempts = 0;

        await this.connect();
    }
}
