/**
 * Centralized WebSocket Manager for Titan Trading System
 *
 * Provides connection pooling, automatic reconnection, and message routing
 * for all WebSocket connections across the Titan system.
 *
 * Requirements: 3.1 - Centralized WebSocket management
 */
import WebSocket from 'ws';
import { EventEmitter } from 'eventemitter3';
// Simple color logging utility (avoiding chalk ES module issues)
const colors = {
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
};
/**
 * Message compression utility
 */
class MessageCompressor {
    /**
     * Compress message if it exceeds threshold
     */
    static compress(data, threshold) {
        const originalSize = Buffer.byteLength(data, 'utf8');
        if (originalSize < threshold) {
            return { data, compressed: false, originalSize };
        }
        try {
            // Simple compression simulation (in real implementation, use zlib)
            const compressed = Buffer.from(data, 'utf8').toString('base64');
            const compressedSize = Buffer.byteLength(compressed, 'utf8');
            // Only use compression if it actually reduces size
            if (compressedSize < originalSize * 0.9) {
                return { data: compressed, compressed: true, originalSize, compressedSize };
            }
            return { data, compressed: false, originalSize };
        }
        catch (error) {
            console.error(colors.red('❌ Compression failed:'), error);
            return { data, compressed: false, originalSize };
        }
    }
    /**
     * Decompress message if compressed
     */
    static decompress(data, compressed) {
        if (!compressed) {
            return data;
        }
        try {
            return Buffer.from(data, 'base64').toString('utf8');
        }
        catch (error) {
            console.error(colors.red('❌ Decompression failed:'), error);
            return data;
        }
    }
}
/**
 * Delta update manager
 */
class DeltaUpdateManager {
    lastStates = new Map();
    /**
     * Create delta update from previous state
     */
    createDelta(key, newData) {
        const lastState = this.lastStates.get(key);
        if (!lastState || typeof newData !== 'object' || newData === null) {
            // eslint-disable-next-line functional/immutable-data
            this.lastStates.set(key, newData);
            return { isDelta: false, data: newData };
        }
        const changes = this.calculateChanges(lastState, newData);
        if (Object.keys(changes).length === 0) {
            return { isDelta: false, data: newData };
        }
        // Only use delta if it's significantly smaller
        const originalSize = JSON.stringify(newData).length;
        const deltaSize = JSON.stringify(changes).length;
        if (deltaSize < originalSize * 0.7) {
            // eslint-disable-next-line functional/immutable-data
            this.lastStates.set(key, newData);
            return { isDelta: true, data: changes, deltaFrom: key };
        }
        // eslint-disable-next-line functional/immutable-data
        this.lastStates.set(key, newData);
        return { isDelta: false, data: newData };
    }
    /**
     * Calculate changes between two objects
     */
    calculateChanges(oldData, newData) {
        const changes = {};
        for (const [key, value] of Object.entries(newData)) {
            if (oldData[key] !== value) {
                // eslint-disable-next-line functional/immutable-data
                changes[key] = value;
            }
        }
        return changes;
    }
    /**
     * Clear old states
     */
    cleanup(maxAge = 300000) {
        // 5 minutes
        // In a real implementation, track timestamps and clean up old states
        if (this.lastStates.size > 1000) {
            // eslint-disable-next-line functional/immutable-data
            this.lastStates.clear();
        }
    }
}
/**
 * Exchange-specific WebSocket connection
 */
class ExchangeConnection extends EventEmitter {
    exchange;
    ws = null;
    config;
    status = 'disconnected';
    reconnectAttempts = 0;
    reconnectTimer = null;
    heartbeatTimer = null;
    healthCheckTimer = null;
    batchTimer = null;
    stats;
    subscriptions = new Map();
    messageQueue = [];
    deltaManager = new DeltaUpdateManager();
    performanceMetrics = {
        messagesPerSecond: 0,
        averageLatency: 0,
        compressionRatio: 0,
        deltaEfficiency: 0,
        lastMetricsUpdate: Date.now(),
    };
    constructor(exchange, config = {}) {
        super();
        this.exchange = exchange;
        this.config = {
            url: '',
            reconnectInterval: 5000,
            maxReconnectAttempts: 10,
            connectionTimeout: 30000,
            heartbeatInterval: 30000,
            enableCompression: true,
            maxMessageSize: 1024 * 1024, // 1MB
            // Performance optimization defaults
            batchingEnabled: true,
            batchInterval: 100, // 100ms
            batchMaxSize: 50,
            compressionThreshold: 2048, // 2KB
            deltaUpdatesEnabled: true,
            connectionHealthCheckInterval: 60000, // 1 minute
            ...config,
        };
        this.stats = {
            messagesReceived: 0,
            messagesSent: 0,
            reconnectCount: 0,
            lastConnected: 0,
            lastDisconnected: 0,
            uptime: 0,
            latency: 0,
        };
    }
    /**
     * Connect to the WebSocket
     */
    async connect() {
        if (this.status === 'connected' || this.status === 'connecting') {
            return;
        }
        // eslint-disable-next-line functional/immutable-data
        this.status = 'connecting';
        this.emit('statusChange', this.status);
        try {
            console.log(colors.blue(`🔌 Connecting to ${this.exchange} WebSocket...`));
            // eslint-disable-next-line functional/immutable-data
            this.ws = new WebSocket(this.config.url, {
                perMessageDeflate: this.config.enableCompression,
                maxPayload: this.config.maxMessageSize,
                handshakeTimeout: this.config.connectionTimeout,
            });
            await this.setupWebSocketHandlers();
        }
        catch (error) {
            console.error(colors.red(`❌ Failed to connect to ${this.exchange}:`), error);
            this.handleConnectionError(error);
        }
    }
    /**
     * Disconnect from the WebSocket
     */
    disconnect() {
        console.log(colors.yellow(`🔌 Disconnecting from ${this.exchange} WebSocket...`));
        this.clearTimers();
        if (this.ws) {
            this.ws.close();
            // eslint-disable-next-line functional/immutable-data
            this.ws = null;
        }
        // eslint-disable-next-line functional/immutable-data
        this.status = 'disconnected';
        // eslint-disable-next-line functional/immutable-data
        this.stats.lastDisconnected = Date.now();
        this.emit('statusChange', this.status);
    }
    /**
     * Subscribe to symbol updates
     */
    subscribe(symbol, callback) {
        if (!this.subscriptions.has(symbol)) {
            // eslint-disable-next-line functional/immutable-data
            this.subscriptions.set(symbol, new Set());
        }
        // eslint-disable-next-line functional/immutable-data
        this.subscriptions.get(symbol).add(callback);
        // Send subscription message if connected
        if (this.status === 'connected') {
            this.sendSubscription(symbol, true);
        }
        console.log(colors.green(`📡 Subscribed to ${this.exchange}:${symbol}`));
    }
    /**
     * Unsubscribe from symbol updates
     */
    unsubscribe(symbol, callback) {
        const callbacks = this.subscriptions.get(symbol);
        if (callbacks) {
            // eslint-disable-next-line functional/immutable-data
            callbacks.delete(callback);
            if (callbacks.size === 0) {
                // eslint-disable-next-line functional/immutable-data
                this.subscriptions.delete(symbol);
                // Send unsubscription message if connected
                if (this.status === 'connected') {
                    this.sendSubscription(symbol, false);
                }
            }
        }
        console.log(colors.yellow(`📡 Unsubscribed from ${this.exchange}:${symbol}`));
    }
    /**
     * Get connection status
     */
    getStatus() {
        return this.status;
    }
    /**
     * Get connection statistics
     */
    getStats() {
        if (this.status === 'connected' && this.stats.lastConnected > 0) {
            // eslint-disable-next-line functional/immutable-data
            this.stats.uptime = Date.now() - this.stats.lastConnected;
        }
        return { ...this.stats };
    }
    /**
     * Get active subscriptions
     */
    getSubscriptions() {
        return Array.from(this.subscriptions.keys());
    }
    /**
     * Setup WebSocket event handlers
     */
    async setupWebSocketHandlers() {
        if (!this.ws)
            return;
        return new Promise((resolve, reject) => {
            const connectionTimeout = setTimeout(() => {
                reject(new Error(`Connection timeout after ${this.config.connectionTimeout}ms`));
            }, this.config.connectionTimeout);
            this.ws.on('open', () => {
                clearTimeout(connectionTimeout);
                this.handleConnectionOpen();
                resolve();
            });
            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });
            this.ws.on('close', (code, reason) => {
                clearTimeout(connectionTimeout);
                this.handleConnectionClose(code, reason.toString());
            });
            this.ws.on('error', (error) => {
                clearTimeout(connectionTimeout);
                this.handleConnectionError(error);
                reject(error);
            });
            this.ws.on('pong', () => {
                this.handlePong();
            });
        });
    }
    /**
     * Handle WebSocket connection open
     */
    handleConnectionOpen() {
        console.log(colors.green(`✅ Connected to ${this.exchange} WebSocket`));
        // eslint-disable-next-line functional/immutable-data
        this.status = 'connected';
        // eslint-disable-next-line functional/immutable-data
        this.reconnectAttempts = 0;
        // eslint-disable-next-line functional/immutable-data
        this.stats.lastConnected = Date.now();
        // eslint-disable-next-line functional/immutable-data
        this.stats.reconnectCount = Math.max(0, this.stats.reconnectCount);
        this.emit('statusChange', this.status);
        this.emit('connected');
        // Start heartbeat
        this.startHeartbeat();
        // Start connection health monitoring
        this.startHealthMonitoring();
        // Start message batching if enabled
        if (this.config.batchingEnabled) {
            this.startMessageBatching();
        }
        // Re-subscribe to all symbols
        this.resubscribeAll();
    }
    /**
     * Handle WebSocket message
     */
    handleMessage(data) {
        try {
            // eslint-disable-next-line functional/immutable-data
            this.stats.messagesReceived++;
            const message = JSON.parse(data.toString());
            // Parse exchange-specific message format
            const parsedMessage = this.parseMessage(message);
            if (parsedMessage) {
                // Apply delta updates if enabled
                if (this.config.deltaUpdatesEnabled) {
                    const deltaKey = `${parsedMessage.exchange}:${parsedMessage.symbol}:${parsedMessage.type}`;
                    const deltaResult = this.deltaManager.createDelta(deltaKey, parsedMessage.data);
                    if (deltaResult.isDelta) {
                        // eslint-disable-next-line functional/immutable-data
                        parsedMessage.deltaFrom = deltaResult.deltaFrom;
                        // eslint-disable-next-line functional/immutable-data
                        parsedMessage.data = deltaResult.data;
                    }
                }
                // Handle message based on batching configuration
                if (this.config.batchingEnabled && this.messageQueue.length < this.config.batchMaxSize) {
                    // eslint-disable-next-line functional/immutable-data
                    this.messageQueue.push(parsedMessage);
                }
                else {
                    // Process immediately if batching disabled or queue full
                    this.processMessage(parsedMessage);
                }
                this.emit('message', parsedMessage);
            }
        }
        catch (error) {
            console.error(colors.red(`❌ Error parsing message from ${this.exchange}:`), error);
        }
    }
    /**
     * Process individual message
     */
    processMessage(message) {
        const callbacks = this.subscriptions.get(message.symbol);
        if (callbacks) {
            callbacks.forEach((callback) => {
                try {
                    callback(message);
                }
                catch (error) {
                    console.error(colors.red(`❌ Error in subscription callback for ${message.symbol}:`), error);
                }
            });
        }
    }
    /**
     * Handle WebSocket connection close
     */
    handleConnectionClose(code, reason) {
        console.log(colors.yellow(`🔌 ${this.exchange} WebSocket closed: ${code} ${reason}`));
        this.clearTimers();
        // eslint-disable-next-line functional/immutable-data
        this.status = 'disconnected';
        // eslint-disable-next-line functional/immutable-data
        this.stats.lastDisconnected = Date.now();
        this.emit('statusChange', this.status);
        this.emit('disconnected', { code, reason });
        // Attempt reconnection if not intentional
        if (code !== 1000 && this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.scheduleReconnect();
        }
    }
    /**
     * Handle WebSocket connection error
     */
    handleConnectionError(error) {
        console.error(colors.red(`❌ ${this.exchange} WebSocket error:`), error);
        // eslint-disable-next-line functional/immutable-data
        this.status = 'failed';
        this.emit('statusChange', this.status);
        this.emit('error', error);
        // Attempt reconnection
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.scheduleReconnect();
        }
    }
    /**
     * Handle WebSocket pong response
     */
    handlePong() {
        // Calculate latency (simplified)
        // eslint-disable-next-line functional/immutable-data
        this.stats.latency = Date.now() % 1000; // Placeholder calculation
    }
    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectTimer)
            return;
        // eslint-disable-next-line functional/immutable-data
        this.reconnectAttempts++;
        // eslint-disable-next-line functional/immutable-data
        this.stats.reconnectCount++;
        const delay = Math.min(this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1), 30000);
        console.log(colors.blue(`🔄 Reconnecting to ${this.exchange} in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`));
        // eslint-disable-next-line functional/immutable-data
        this.status = 'reconnecting';
        this.emit('statusChange', this.status);
        // eslint-disable-next-line functional/immutable-data
        this.reconnectTimer = setTimeout(() => {
            // eslint-disable-next-line functional/immutable-data
            this.reconnectTimer = null;
            this.connect().catch((error) => {
                console.error(colors.red(`❌ Reconnection failed for ${this.exchange}:`), error);
            });
        }, delay);
    }
    /**
     * Start heartbeat ping
     */
    startHeartbeat() {
        if (this.heartbeatTimer)
            return;
        // eslint-disable-next-line functional/immutable-data
        this.heartbeatTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping();
            }
        }, this.config.heartbeatInterval);
    }
    /**
     * Start connection health monitoring
     */
    startHealthMonitoring() {
        if (this.healthCheckTimer)
            return;
        // eslint-disable-next-line functional/immutable-data
        this.healthCheckTimer = setInterval(() => {
            this.updatePerformanceMetrics();
            this.deltaManager.cleanup();
            // Log performance metrics
            if (Date.now() - this.performanceMetrics.lastMetricsUpdate > 60000) {
                console.log(colors.blue(`📊 ${this.exchange} Performance: ${this.performanceMetrics.messagesPerSecond.toFixed(1)} msg/s, ${this.performanceMetrics.averageLatency.toFixed(1)}ms latency, ${(this.performanceMetrics.compressionRatio * 100).toFixed(1)}% compression`));
                // eslint-disable-next-line functional/immutable-data
                this.performanceMetrics.lastMetricsUpdate = Date.now();
            }
        }, this.config.connectionHealthCheckInterval);
    }
    /**
     * Start message batching
     */
    startMessageBatching() {
        if (this.batchTimer)
            return;
        // eslint-disable-next-line functional/immutable-data
        this.batchTimer = setInterval(() => {
            this.processBatchedMessages();
        }, this.config.batchInterval);
    }
    /**
     * Process batched messages
     */
    processBatchedMessages() {
        if (this.messageQueue.length === 0)
            return;
        const batch = {
            batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            messages: [...this.messageQueue],
            compressed: false,
            originalSize: 0,
        };
        // eslint-disable-next-line functional/immutable-data
        this.messageQueue = [];
        // Calculate batch size and apply compression if needed
        const batchData = JSON.stringify(batch.messages);
        // eslint-disable-next-line functional/immutable-data
        batch.originalSize = Buffer.byteLength(batchData, 'utf8');
        if (batch.originalSize > this.config.compressionThreshold) {
            const compressed = MessageCompressor.compress(batchData, this.config.compressionThreshold);
            // eslint-disable-next-line functional/immutable-data
            batch.compressed = compressed.compressed;
            if (compressed.compressedSize) {
                this.updateCompressionMetrics(batch.originalSize, compressed.compressedSize);
            }
        }
        // Emit batched messages to subscribers
        for (const message of batch.messages) {
            const callbacks = this.subscriptions.get(message.symbol);
            if (callbacks) {
                callbacks.forEach((callback) => {
                    try {
                        callback(message);
                    }
                    catch (error) {
                        console.error(colors.red(`❌ Error in batched callback for ${message.symbol}:`), error);
                    }
                });
            }
        }
        this.emit('batch', batch);
    }
    /**
     * Update performance metrics
     */
    updatePerformanceMetrics() {
        const now = Date.now();
        const timeDiff = (now - this.performanceMetrics.lastMetricsUpdate) / 1000;
        if (timeDiff > 0) {
            // eslint-disable-next-line functional/immutable-data
            this.performanceMetrics.messagesPerSecond = this.stats.messagesReceived / timeDiff;
        }
        // Reset counters for next interval
        // eslint-disable-next-line functional/immutable-data
        this.stats.messagesReceived = 0;
    }
    /**
     * Update compression metrics
     */
    updateCompressionMetrics(originalSize, compressedSize) {
        const ratio = (originalSize - compressedSize) / originalSize;
        // eslint-disable-next-line functional/immutable-data
        this.performanceMetrics.compressionRatio =
            (this.performanceMetrics.compressionRatio + ratio) / 2;
    }
    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return { ...this.performanceMetrics };
    }
    /**
     * Clear all timers
     */
    clearTimers() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            // eslint-disable-next-line functional/immutable-data
            this.reconnectTimer = null;
        }
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            // eslint-disable-next-line functional/immutable-data
            this.heartbeatTimer = null;
        }
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            // eslint-disable-next-line functional/immutable-data
            this.healthCheckTimer = null;
        }
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            // eslint-disable-next-line functional/immutable-data
            this.batchTimer = null;
        }
    }
    /**
     * Re-subscribe to all symbols after reconnection
     */
    resubscribeAll() {
        for (const symbol of this.subscriptions.keys()) {
            this.sendSubscription(symbol, true);
        }
    }
    /**
     * Send subscription/unsubscription message
     */
    sendSubscription(symbol, subscribe) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
            return;
        // Exchange-specific subscription format
        // eslint-disable-next-line functional/no-let
        let message;
        switch (this.exchange.toLowerCase()) {
            case 'binance':
                message = {
                    method: subscribe ? 'SUBSCRIBE' : 'UNSUBSCRIBE',
                    params: [`${symbol.toLowerCase()}@ticker`],
                    id: Date.now(),
                };
                break;
            case 'bybit':
                message = {
                    op: subscribe ? 'subscribe' : 'unsubscribe',
                    args: [`tickers.${symbol}`],
                };
                break;
            default:
                console.warn(colors.yellow(`⚠️ Unknown exchange format: ${this.exchange}`));
                return;
        }
        try {
            this.ws.send(JSON.stringify(message));
            // eslint-disable-next-line functional/immutable-data
            this.stats.messagesSent++;
        }
        catch (error) {
            console.error(colors.red(`❌ Failed to send subscription for ${symbol}:`), error);
        }
    }
    /**
     * Parse exchange-specific message format
     */
    parseMessage(message) {
        try {
            switch (this.exchange.toLowerCase()) {
                case 'binance':
                    if (message.stream && message.data) {
                        const [symbol] = message.stream.split('@');
                        return {
                            id: `${this.exchange}-${symbol}-${Date.now()}`,
                            timestamp: Date.now(),
                            exchange: this.exchange,
                            symbol: symbol.toUpperCase(),
                            type: 'ticker',
                            data: message.data,
                        };
                    }
                    break;
                case 'bybit':
                    if (message.topic && message.data) {
                        const symbol = message.topic.replace('tickers.', '');
                        return {
                            id: `${this.exchange}-${symbol}-${Date.now()}`,
                            timestamp: Date.now(),
                            exchange: this.exchange,
                            symbol: symbol,
                            type: 'ticker',
                            data: message.data,
                        };
                    }
                    break;
            }
            return null;
        }
        catch (error) {
            console.error(colors.red(`❌ Error parsing ${this.exchange} message:`), error);
            return null;
        }
    }
}
/**
 * Centralized WebSocket Manager
 */
export class WebSocketManager extends EventEmitter {
    connections = new Map();
    globalStats = {
        totalConnections: 0,
        activeConnections: 0,
        totalMessages: 0,
        totalSubscriptions: 0,
    };
    constructor() {
        super();
        console.log(colors.blue('🚀 WebSocket Manager initialized'));
    }
    /**
     * Add exchange connection
     */
    addExchange(exchange, config) {
        if (this.connections.has(exchange)) {
            console.warn(colors.yellow(`⚠️ Exchange ${exchange} already exists`));
            return;
        }
        const connection = new ExchangeConnection(exchange, config);
        // Forward events
        connection.on('statusChange', (status) => {
            this.emit('connectionStatusChange', { exchange, status });
            this.updateGlobalStats();
        });
        connection.on('message', (message) => {
            // eslint-disable-next-line functional/immutable-data
            this.globalStats.totalMessages++;
            this.emit('message', message);
        });
        connection.on('error', (error) => {
            this.emit('connectionError', { exchange, error });
        });
        // eslint-disable-next-line functional/immutable-data
        this.connections.set(exchange, connection);
        // eslint-disable-next-line functional/immutable-data
        this.globalStats.totalConnections = this.connections.size;
        console.log(colors.green(`✅ Added ${exchange} exchange connection`));
    }
    /**
     * Connect to exchange
     */
    async connect(exchange) {
        const connection = this.connections.get(exchange);
        if (!connection) {
            throw new Error(`Exchange ${exchange} not found`);
        }
        await connection.connect();
    }
    /**
     * Connect to all exchanges
     */
    async connectAll() {
        const promises = Array.from(this.connections.keys()).map((exchange) => this.connect(exchange).catch((error) => {
            console.error(colors.red(`❌ Failed to connect to ${exchange}:`), error);
        }));
        await Promise.allSettled(promises);
    }
    /**
     * Disconnect from exchange
     */
    disconnect(exchange) {
        const connection = this.connections.get(exchange);
        if (connection) {
            connection.disconnect();
        }
    }
    /**
     * Disconnect from all exchanges
     */
    disconnectAll() {
        for (const connection of this.connections.values()) {
            connection.disconnect();
        }
    }
    /**
     * Subscribe to symbol updates
     */
    subscribe(exchange, symbol, callback) {
        const connection = this.connections.get(exchange);
        if (!connection) {
            throw new Error(`Exchange ${exchange} not found`);
        }
        connection.subscribe(symbol, callback);
        // eslint-disable-next-line functional/immutable-data
        this.globalStats.totalSubscriptions++;
    }
    /**
     * Unsubscribe from symbol updates
     */
    unsubscribe(exchange, symbol, callback) {
        const connection = this.connections.get(exchange);
        if (connection) {
            connection.unsubscribe(symbol, callback);
            // eslint-disable-next-line functional/immutable-data
            this.globalStats.totalSubscriptions = Math.max(0, this.globalStats.totalSubscriptions - 1);
        }
    }
    /**
     * Get connection status
     */
    getConnectionStatus(exchange) {
        const connection = this.connections.get(exchange);
        return connection ? connection.getStatus() : null;
    }
    /**
     * Get all connection statuses
     */
    getAllConnectionStatuses() {
        const statuses = {};
        for (const [exchange, connection] of this.connections) {
            // eslint-disable-next-line functional/immutable-data
            statuses[exchange] = connection.getStatus();
        }
        return statuses;
    }
    /**
     * Get connection statistics
     */
    getConnectionStats(exchange) {
        const connection = this.connections.get(exchange);
        return connection ? connection.getStats() : null;
    }
    /**
     * Get global statistics
     */
    getGlobalStats() {
        return { ...this.globalStats };
    }
    /**
     * Get performance metrics for all connections
     */
    getAllPerformanceMetrics() {
        const metrics = {};
        for (const [exchange, connection] of this.connections) {
            // eslint-disable-next-line functional/immutable-data
            metrics[exchange] = connection.getPerformanceMetrics();
        }
        return metrics;
    }
    /**
     * Get bandwidth usage statistics
     */
    getBandwidthStats() {
        // eslint-disable-next-line functional/no-let
        let totalMessages = 0;
        // eslint-disable-next-line functional/no-let
        let totalCompressionRatio = 0;
        // eslint-disable-next-line functional/no-let
        let connectionCount = 0;
        for (const connection of this.connections.values()) {
            const metrics = connection.getPerformanceMetrics();
            totalMessages += this.globalStats.totalMessages;
            totalCompressionRatio += metrics.compressionRatio;
            connectionCount++;
        }
        const averageCompressionRatio = connectionCount > 0 ? totalCompressionRatio / connectionCount : 0;
        const estimatedBandwidthSaved = totalMessages * averageCompressionRatio * 1024; // Rough estimate in bytes
        return {
            totalMessages,
            averageCompressionRatio,
            estimatedBandwidthSaved,
        };
    }
    /**
     * Get all subscriptions
     */
    getAllSubscriptions() {
        const subscriptions = {};
        for (const [exchange, connection] of this.connections) {
            // eslint-disable-next-line functional/immutable-data
            subscriptions[exchange] = connection.getSubscriptions();
        }
        return subscriptions;
    }
    /**
     * Update global statistics
     */
    updateGlobalStats() {
        // eslint-disable-next-line functional/immutable-data
        this.globalStats.activeConnections = Array.from(this.connections.values()).filter((conn) => conn.getStatus() === 'connected').length;
    }
    /**
     * Cleanup and shutdown
     */
    shutdown() {
        console.log(colors.blue('🛑 Shutting down WebSocket Manager...'));
        this.disconnectAll();
        // eslint-disable-next-line functional/immutable-data
        this.connections.clear();
        // eslint-disable-next-line functional/immutable-data
        this.globalStats.totalConnections = 0;
        // eslint-disable-next-line functional/immutable-data
        this.globalStats.activeConnections = 0;
        // eslint-disable-next-line functional/immutable-data
        this.globalStats.totalSubscriptions = 0;
        this.removeAllListeners();
    }
}
/**
 * Singleton WebSocket Manager instance
 */
// eslint-disable-next-line functional/no-let
let wsManagerInstance = null;
/**
 * Get or create the global WebSocket Manager instance
 */
export function getWebSocketManager() {
    if (!wsManagerInstance) {
        wsManagerInstance = new WebSocketManager();
    }
    return wsManagerInstance;
}
/**
 * Reset the global WebSocket Manager instance (for testing)
 */
export function resetWebSocketManager() {
    if (wsManagerInstance) {
        wsManagerInstance.shutdown();
    }
    wsManagerInstance = null;
}
//# sourceMappingURL=WebSocketManager.js.map