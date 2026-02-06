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
import { EventEmitter } from 'events';
/**
 * Source service identifier
 */
export type SignalSource = 'scavenger' | 'hunter' | 'sentinel' | 'brain';
/**
 * Intent Signal sent to Execution Service
 */
export interface IntentSignal {
    signal_id: string;
    source: SignalSource;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entry_zone: {
        min: number;
        max: number;
    };
    stop_loss: number;
    take_profits: number[];
    confidence: number;
    leverage: number;
    position_size?: number;
    velocity?: number;
    trap_type?: string;
    type?: string;
    timestamp: number;
    t_analysis?: number;
    t_decision?: number;
    t_ingress?: number;
    t_exchange?: number;
    max_slippage_bps?: number;
    fill_feasibility?: number;
    expected_impact_bps?: number;
    latency_profile?: LatencyProfile;
    ttl_ms?: number;
    partition_key?: string;
    causation_id?: string;
    env?: string;
    subject?: string;
    metadata?: any;
}
/**
 * End-to-end latency profile for signal auditing
 */
export interface LatencyProfile {
    t0_market_data: number;
    t1_signal_generated: number;
    t2_brain_ingress: number;
    t3_brain_decision: number;
    t4_execution_ingress: number;
}
/**
 * Market Regime State for BOCPD
 */
export declare enum RegimeState {
    STABLE = "STABLE",// Low vol, mean-reverting (Sentinel dominant)
    VOLATILE_BREAKOUT = "VOLATILE_BREAKOUT",// High vol, directional (Hunter dominant)
    MEAN_REVERSION = "MEAN_REVERSION",// Moderate vol, range-bound
    CRASH = "CRASH"
}
/**
 * Report of a trade fill (Execution -> Brain/Accountant)
 */
export interface FillReport {
    fill_id: string;
    signal_id: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    price: number;
    qty: number;
    fee: number;
    fee_currency: string;
    t_signal: number;
    t_exchange: number;
    t_ingress: number;
    client_order_id: string;
    execution_id: string;
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
export declare enum ConnectionState {
    DISCONNECTED = "disconnected",
    CONNECTING = "connecting",
    CONNECTED = "connected",
    RECONNECTING = "reconnecting",
    FAILED = "failed"
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
export declare class FastPathClient extends EventEmitter {
    private config;
    private socket;
    private connectionState;
    private reconnectAttempts;
    private reconnectTimer;
    private disconnecting;
    private messageBuffer;
    private pendingMessages;
    private messageId;
    private metrics;
    constructor(config?: Partial<IPCClientConfig>);
    /**
     * Get the configured source
     */
    getSource(): SignalSource;
    /**
     * Connect to IPC server with automatic reconnection
     */
    connect(): Promise<void>;
    private attemptConnection;
    private scheduleReconnection;
    private handleIncomingData;
    private handleMessage;
    private updateLatencyMetrics;
    private clearPendingMessages;
    /**
     * Send PREPARE signal
     */
    sendPrepare(signal: IntentSignal): Promise<PrepareResponse>;
    /**
     * Send CONFIRM signal
     */
    sendConfirm(signal_id: string): Promise<ConfirmResponse>;
    /**
     * Send ABORT signal
     */
    sendAbort(signal_id: string): Promise<AbortResponse>;
    private generateCorrelationId;
    private send;
    private serializeMessage;
    private sign;
    private normalizeForSigning;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    getConnectionState(): ConnectionState;
    getStatus(): {
        connectionState: ConnectionState;
        socketPath: string;
        source: SignalSource;
        reconnectAttempts: number;
        maxReconnectAttempts: number;
        pendingMessages: number;
        metrics: IPCMetrics;
    };
    getMetrics(): IPCMetrics;
    resetMetrics(): void;
    ping(): Promise<{
        success: boolean;
        latency?: number;
        error?: string;
    }>;
    forceReconnect(): Promise<void>;
}
//# sourceMappingURL=FastPathClient.d.ts.map