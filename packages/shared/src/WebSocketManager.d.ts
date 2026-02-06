/**
 * Centralized WebSocket Manager for Titan Trading System
 *
 * Provides connection pooling, automatic reconnection, and message routing
 * for all WebSocket connections across the Titan system.
 *
 * Requirements: 3.1 - Centralized WebSocket management
 */
import { EventEmitter } from 'eventemitter3';
/**
 * WebSocket connection configuration
 */
export interface WebSocketConfig {
    url: string;
    reconnectInterval: number;
    maxReconnectAttempts: number;
    connectionTimeout: number;
    heartbeatInterval: number;
    enableCompression: boolean;
    maxMessageSize: number;
    batchingEnabled: boolean;
    batchInterval: number;
    batchMaxSize: number;
    compressionThreshold: number;
    deltaUpdatesEnabled: boolean;
    connectionHealthCheckInterval: number;
}
/**
 * WebSocket message types
 */
export interface WebSocketMessage {
    id: string;
    timestamp: number;
    exchange: string;
    symbol: string;
    type: string;
    data: unknown;
    compressed?: boolean;
    batchId?: string;
    deltaFrom?: string;
}
/**
 * Batched message container
 */
export interface BatchedMessage {
    batchId: string;
    timestamp: number;
    messages: WebSocketMessage[];
    compressed: boolean;
    originalSize: number;
    compressedSize?: number;
}
/**
 * Delta update message
 */
export interface DeltaMessage extends WebSocketMessage {
    deltaFrom: string;
    changes: Record<string, unknown>;
}
/**
 * Subscription callback function
 */
export type SubscriptionCallback = (message: WebSocketMessage) => void;
/**
 * WebSocket connection status
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
/**
 * WebSocket connection statistics
 */
export interface ConnectionStats {
    messagesReceived: number;
    messagesSent: number;
    reconnectCount: number;
    lastConnected: number;
    lastDisconnected: number;
    uptime: number;
    latency: number;
}
/**
 * Centralized WebSocket Manager
 */
export declare class WebSocketManager extends EventEmitter {
    private connections;
    private globalStats;
    constructor();
    /**
     * Add exchange connection
     */
    addExchange(exchange: string, config: WebSocketConfig): void;
    /**
     * Connect to exchange
     */
    connect(exchange: string): Promise<void>;
    /**
     * Connect to all exchanges
     */
    connectAll(): Promise<void>;
    /**
     * Disconnect from exchange
     */
    disconnect(exchange: string): void;
    /**
     * Disconnect from all exchanges
     */
    disconnectAll(): void;
    /**
     * Subscribe to symbol updates
     */
    subscribe(exchange: string, symbol: string, callback: SubscriptionCallback): void;
    /**
     * Unsubscribe from symbol updates
     */
    unsubscribe(exchange: string, symbol: string, callback: SubscriptionCallback): void;
    /**
     * Get connection status
     */
    getConnectionStatus(exchange: string): ConnectionStatus | null;
    /**
     * Get all connection statuses
     */
    getAllConnectionStatuses(): Record<string, ConnectionStatus>;
    /**
     * Get connection statistics
     */
    getConnectionStats(exchange: string): ConnectionStats | null;
    /**
     * Get global statistics
     */
    getGlobalStats(): typeof this.globalStats;
    /**
     * Get performance metrics for all connections
     */
    getAllPerformanceMetrics(): Record<string, any>;
    /**
     * Get bandwidth usage statistics
     */
    getBandwidthStats(): {
        totalMessages: number;
        averageCompressionRatio: number;
        estimatedBandwidthSaved: number;
    };
    /**
     * Get all subscriptions
     */
    getAllSubscriptions(): Record<string, string[]>;
    /**
     * Update global statistics
     */
    private updateGlobalStats;
    /**
     * Cleanup and shutdown
     */
    shutdown(): void;
}
/**
 * Get or create the global WebSocket Manager instance
 */
export declare function getWebSocketManager(): WebSocketManager;
/**
 * Reset the global WebSocket Manager instance (for testing)
 */
export declare function resetWebSocketManager(): void;
//# sourceMappingURL=WebSocketManager.d.ts.map