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
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
};

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
  // Performance optimization settings
  batchingEnabled: boolean;
  batchInterval: number; // milliseconds
  batchMaxSize: number;
  compressionThreshold: number; // bytes
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
 * Message compression utility
 */
class MessageCompressor {
  /**
   * Compress message if it exceeds threshold
   */
  static compress(data: string, threshold: number): { data: string; compressed: boolean; originalSize: number; compressedSize?: number } {
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
    } catch (error) {
      console.error(colors.red('❌ Compression failed:'), error);
      return { data, compressed: false, originalSize };
    }
  }
  
  /**
   * Decompress message if compressed
   */
  static decompress(data: string, compressed: boolean): string {
    if (!compressed) {
      return data;
    }
    
    try {
      return Buffer.from(data, 'base64').toString('utf8');
    } catch (error) {
      console.error(colors.red('❌ Decompression failed:'), error);
      return data;
    }
  }
}

/**
 * Delta update manager
 */
class DeltaUpdateManager {
  private lastStates = new Map<string, unknown>();
  
  /**
   * Create delta update from previous state
   */
  createDelta(key: string, newData: unknown): { isDelta: boolean; data: unknown; deltaFrom?: string } {
    const lastState = this.lastStates.get(key);
    
    if (!lastState || typeof newData !== 'object' || newData === null) {
      this.lastStates.set(key, newData);
      return { isDelta: false, data: newData };
    }
    
    const changes = this.calculateChanges(lastState as Record<string, unknown>, newData as Record<string, unknown>);
    
    if (Object.keys(changes).length === 0) {
      return { isDelta: false, data: newData };
    }
    
    // Only use delta if it's significantly smaller
    const originalSize = JSON.stringify(newData).length;
    const deltaSize = JSON.stringify(changes).length;
    
    if (deltaSize < originalSize * 0.7) {
      this.lastStates.set(key, newData);
      return { isDelta: true, data: changes, deltaFrom: key };
    }
    
    this.lastStates.set(key, newData);
    return { isDelta: false, data: newData };
  }
  
  /**
   * Calculate changes between two objects
   */
  private calculateChanges(oldData: Record<string, unknown>, newData: Record<string, unknown>): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(newData)) {
      if (oldData[key] !== value) {
        changes[key] = value;
      }
    }
    
    return changes;
  }
  
  /**
   * Clear old states
   */
  cleanup(maxAge: number = 300000): void { // 5 minutes
    // In a real implementation, track timestamps and clean up old states
    if (this.lastStates.size > 1000) {
      this.lastStates.clear();
    }
  }
}

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
 * Exchange-specific WebSocket connection
 */
class ExchangeConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private batchTimer: NodeJS.Timeout | null = null;
  private stats: ConnectionStats;
  private subscriptions = new Map<string, Set<SubscriptionCallback>>();
  private messageQueue: WebSocketMessage[] = [];
  private deltaManager = new DeltaUpdateManager();
  private performanceMetrics = {
    messagesPerSecond: 0,
    averageLatency: 0,
    compressionRatio: 0,
    deltaEfficiency: 0,
    lastMetricsUpdate: Date.now()
  };

  constructor(
    private exchange: string,
    config: Partial<WebSocketConfig> = {}
  ) {
    super();
    
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
      ...config
    };

    this.stats = {
      messagesReceived: 0,
      messagesSent: 0,
      reconnectCount: 0,
      lastConnected: 0,
      lastDisconnected: 0,
      uptime: 0,
      latency: 0
    };
  }

  /**
   * Connect to the WebSocket
   */
  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') {
      return;
    }

    this.status = 'connecting';
    this.emit('statusChange', this.status);

    try {
      console.log(colors.blue(`🔌 Connecting to ${this.exchange} WebSocket...`));

      this.ws = new WebSocket(this.config.url, {
        perMessageDeflate: this.config.enableCompression,
        maxPayload: this.config.maxMessageSize,
        handshakeTimeout: this.config.connectionTimeout
      });

      await this.setupWebSocketHandlers();
      
    } catch (error) {
      console.error(colors.red(`❌ Failed to connect to ${this.exchange}:`), error);
      this.handleConnectionError(error as Error);
    }
  }

  /**
   * Disconnect from the WebSocket
   */
  disconnect(): void {
    console.log(colors.yellow(`🔌 Disconnecting from ${this.exchange} WebSocket...`));
    
    this.clearTimers();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.status = 'disconnected';
    this.stats.lastDisconnected = Date.now();
    this.emit('statusChange', this.status);
  }

  /**
   * Subscribe to symbol updates
   */
  subscribe(symbol: string, callback: SubscriptionCallback): void {
    if (!this.subscriptions.has(symbol)) {
      this.subscriptions.set(symbol, new Set());
    }
    
    this.subscriptions.get(symbol)!.add(callback);
    
    // Send subscription message if connected
    if (this.status === 'connected') {
      this.sendSubscription(symbol, true);
    }
    
    console.log(colors.green(`📡 Subscribed to ${this.exchange}:${symbol}`));
  }

  /**
   * Unsubscribe from symbol updates
   */
  unsubscribe(symbol: string, callback: SubscriptionCallback): void {
    const callbacks = this.subscriptions.get(symbol);
    if (callbacks) {
      callbacks.delete(callback);
      
      if (callbacks.size === 0) {
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
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    if (this.status === 'connected' && this.stats.lastConnected > 0) {
      this.stats.uptime = Date.now() - this.stats.lastConnected;
    }
    return { ...this.stats };
  }

  /**
   * Get active subscriptions
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Setup WebSocket event handlers
   */
  private async setupWebSocketHandlers(): Promise<void> {
    if (!this.ws) return;

    return new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.config.connectionTimeout}ms`));
      }, this.config.connectionTimeout);

      this.ws!.on('open', () => {
        clearTimeout(connectionTimeout);
        this.handleConnectionOpen();
        resolve();
      });

      this.ws!.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws!.on('close', (code: number, reason: Buffer) => {
        clearTimeout(connectionTimeout);
        this.handleConnectionClose(code, reason.toString());
      });

      this.ws!.on('error', (error: Error) => {
        clearTimeout(connectionTimeout);
        this.handleConnectionError(error);
        reject(error);
      });

      this.ws!.on('pong', () => {
        this.handlePong();
      });
    });
  }

  /**
   * Handle WebSocket connection open
   */
  private handleConnectionOpen(): void {
    console.log(colors.green(`✅ Connected to ${this.exchange} WebSocket`));
    
    this.status = 'connected';
    this.reconnectAttempts = 0;
    this.stats.lastConnected = Date.now();
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
  private handleMessage(data: WebSocket.Data): void {
    try {
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
            parsedMessage.deltaFrom = deltaResult.deltaFrom;
            parsedMessage.data = deltaResult.data;
          }
        }
        
        // Handle message based on batching configuration
        if (this.config.batchingEnabled && this.messageQueue.length < this.config.batchMaxSize) {
          this.messageQueue.push(parsedMessage);
        } else {
          // Process immediately if batching disabled or queue full
          this.processMessage(parsedMessage);
        }
        
        this.emit('message', parsedMessage);
      }
      
    } catch (error) {
      console.error(colors.red(`❌ Error parsing message from ${this.exchange}:`), error);
    }
  }
  
  /**
   * Process individual message
   */
  private processMessage(message: WebSocketMessage): void {
    const callbacks = this.subscriptions.get(message.symbol);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(message);
        } catch (error) {
          console.error(colors.red(`❌ Error in subscription callback for ${message.symbol}:`), error);
        }
      });
    }
  }

  /**
   * Handle WebSocket connection close
   */
  private handleConnectionClose(code: number, reason: string): void {
    console.log(colors.yellow(`🔌 ${this.exchange} WebSocket closed: ${code} ${reason}`));
    
    this.clearTimers();
    this.status = 'disconnected';
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
  private handleConnectionError(error: Error): void {
    console.error(colors.red(`❌ ${this.exchange} WebSocket error:`), error);
    
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
  private handlePong(): void {
    // Calculate latency (simplified)
    this.stats.latency = Date.now() % 1000; // Placeholder calculation
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    this.reconnectAttempts++;
    this.stats.reconnectCount++;
    
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );
    
    console.log(colors.blue(`🔄 Reconnecting to ${this.exchange} in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`));
    
    this.status = 'reconnecting';
    this.emit('statusChange', this.status);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(error => {
        console.error(colors.red(`❌ Reconnection failed for ${this.exchange}:`), error);
      });
    }, delay);
  }

  /**
   * Start heartbeat ping
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Start connection health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) return;
    
    this.healthCheckTimer = setInterval(() => {
      this.updatePerformanceMetrics();
      this.deltaManager.cleanup();
      
      // Log performance metrics
      if (Date.now() - this.performanceMetrics.lastMetricsUpdate > 60000) {
        console.log(colors.blue(`📊 ${this.exchange} Performance: ${this.performanceMetrics.messagesPerSecond.toFixed(1)} msg/s, ${this.performanceMetrics.averageLatency.toFixed(1)}ms latency, ${(this.performanceMetrics.compressionRatio * 100).toFixed(1)}% compression`));
        this.performanceMetrics.lastMetricsUpdate = Date.now();
      }
    }, this.config.connectionHealthCheckInterval);
  }
  
  /**
   * Start message batching
   */
  private startMessageBatching(): void {
    if (this.batchTimer) return;
    
    this.batchTimer = setInterval(() => {
      this.processBatchedMessages();
    }, this.config.batchInterval);
  }
  
  /**
   * Process batched messages
   */
  private processBatchedMessages(): void {
    if (this.messageQueue.length === 0) return;
    
    const batch: BatchedMessage = {
      batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      messages: [...this.messageQueue],
      compressed: false,
      originalSize: 0
    };
    
    this.messageQueue = [];
    
    // Calculate batch size and apply compression if needed
    const batchData = JSON.stringify(batch.messages);
    batch.originalSize = Buffer.byteLength(batchData, 'utf8');
    
    if (batch.originalSize > this.config.compressionThreshold) {
      const compressed = MessageCompressor.compress(batchData, this.config.compressionThreshold);
      batch.compressed = compressed.compressed;
      if (compressed.compressedSize) {
        this.updateCompressionMetrics(batch.originalSize, compressed.compressedSize);
      }
    }
    
    // Emit batched messages to subscribers
    for (const message of batch.messages) {
      const callbacks = this.subscriptions.get(message.symbol);
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(message);
          } catch (error) {
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
  private updatePerformanceMetrics(): void {
    const now = Date.now();
    const timeDiff = (now - this.performanceMetrics.lastMetricsUpdate) / 1000;
    
    if (timeDiff > 0) {
      this.performanceMetrics.messagesPerSecond = this.stats.messagesReceived / timeDiff;
    }
    
    // Reset counters for next interval
    this.stats.messagesReceived = 0;
  }
  
  /**
   * Update compression metrics
   */
  private updateCompressionMetrics(originalSize: number, compressedSize: number): void {
    const ratio = (originalSize - compressedSize) / originalSize;
    this.performanceMetrics.compressionRatio = (this.performanceMetrics.compressionRatio + ratio) / 2;
  }
  
  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): typeof this.performanceMetrics {
    return { ...this.performanceMetrics };
  }
  
  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Re-subscribe to all symbols after reconnection
   */
  private resubscribeAll(): void {
    for (const symbol of this.subscriptions.keys()) {
      this.sendSubscription(symbol, true);
    }
  }

  /**
   * Send subscription/unsubscription message
   */
  private sendSubscription(symbol: string, subscribe: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    // Exchange-specific subscription format
    let message: unknown;
    
    switch (this.exchange.toLowerCase()) {
      case 'binance':
        message = {
          method: subscribe ? 'SUBSCRIBE' : 'UNSUBSCRIBE',
          params: [`${symbol.toLowerCase()}@ticker`],
          id: Date.now()
        };
        break;
        
      case 'bybit':
        message = {
          op: subscribe ? 'subscribe' : 'unsubscribe',
          args: [`tickers.${symbol}`]
        };
        break;
        
      default:
        console.warn(colors.yellow(`⚠️ Unknown exchange format: ${this.exchange}`));
        return;
    }
    
    try {
      this.ws.send(JSON.stringify(message));
      this.stats.messagesSent++;
    } catch (error) {
      console.error(colors.red(`❌ Failed to send subscription for ${symbol}:`), error);
    }
  }

  /**
   * Parse exchange-specific message format
   */
  private parseMessage(message: any): WebSocketMessage | null {
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
              data: message.data
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
              data: message.data
            };
          }
          break;
      }
      
      return null;
    } catch (error) {
      console.error(colors.red(`❌ Error parsing ${this.exchange} message:`), error);
      return null;
    }
  }
}

/**
 * Centralized WebSocket Manager
 */
export class WebSocketManager extends EventEmitter {
  private connections = new Map<string, ExchangeConnection>();
  private globalStats = {
    totalConnections: 0,
    activeConnections: 0,
    totalMessages: 0,
    totalSubscriptions: 0
  };

  constructor() {
    super();
    console.log(colors.blue('🚀 WebSocket Manager initialized'));
  }

  /**
   * Add exchange connection
   */
  addExchange(exchange: string, config: WebSocketConfig): void {
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
      this.globalStats.totalMessages++;
      this.emit('message', message);
    });
    
    connection.on('error', (error) => {
      this.emit('connectionError', { exchange, error });
    });

    this.connections.set(exchange, connection);
    this.globalStats.totalConnections = this.connections.size;
    
    console.log(colors.green(`✅ Added ${exchange} exchange connection`));
  }

  /**
   * Connect to exchange
   */
  async connect(exchange: string): Promise<void> {
    const connection = this.connections.get(exchange);
    if (!connection) {
      throw new Error(`Exchange ${exchange} not found`);
    }

    await connection.connect();
  }

  /**
   * Connect to all exchanges
   */
  async connectAll(): Promise<void> {
    const promises = Array.from(this.connections.keys()).map(exchange => 
      this.connect(exchange).catch(error => {
        console.error(colors.red(`❌ Failed to connect to ${exchange}:`), error);
      })
    );

    await Promise.allSettled(promises);
  }

  /**
   * Disconnect from exchange
   */
  disconnect(exchange: string): void {
    const connection = this.connections.get(exchange);
    if (connection) {
      connection.disconnect();
    }
  }

  /**
   * Disconnect from all exchanges
   */
  disconnectAll(): void {
    for (const connection of this.connections.values()) {
      connection.disconnect();
    }
  }

  /**
   * Subscribe to symbol updates
   */
  subscribe(exchange: string, symbol: string, callback: SubscriptionCallback): void {
    const connection = this.connections.get(exchange);
    if (!connection) {
      throw new Error(`Exchange ${exchange} not found`);
    }

    connection.subscribe(symbol, callback);
    this.globalStats.totalSubscriptions++;
  }

  /**
   * Unsubscribe from symbol updates
   */
  unsubscribe(exchange: string, symbol: string, callback: SubscriptionCallback): void {
    const connection = this.connections.get(exchange);
    if (connection) {
      connection.unsubscribe(symbol, callback);
      this.globalStats.totalSubscriptions = Math.max(0, this.globalStats.totalSubscriptions - 1);
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(exchange: string): ConnectionStatus | null {
    const connection = this.connections.get(exchange);
    return connection ? connection.getStatus() : null;
  }

  /**
   * Get all connection statuses
   */
  getAllConnectionStatuses(): Record<string, ConnectionStatus> {
    const statuses: Record<string, ConnectionStatus> = {};
    for (const [exchange, connection] of this.connections) {
      statuses[exchange] = connection.getStatus();
    }
    return statuses;
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(exchange: string): ConnectionStats | null {
    const connection = this.connections.get(exchange);
    return connection ? connection.getStats() : null;
  }

  /**
   * Get global statistics
   */
  getGlobalStats(): typeof this.globalStats {
    return { ...this.globalStats };
  }
  
  /**
   * Get performance metrics for all connections
   */
  getAllPerformanceMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    for (const [exchange, connection] of this.connections) {
      metrics[exchange] = connection.getPerformanceMetrics();
    }
    return metrics;
  }
  
  /**
   * Get bandwidth usage statistics
   */
  getBandwidthStats(): {
    totalMessages: number;
    averageCompressionRatio: number;
    estimatedBandwidthSaved: number;
  } {
    let totalMessages = 0;
    let totalCompressionRatio = 0;
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
      estimatedBandwidthSaved
    };
  }

  /**
   * Get all subscriptions
   */
  getAllSubscriptions(): Record<string, string[]> {
    const subscriptions: Record<string, string[]> = {};
    for (const [exchange, connection] of this.connections) {
      subscriptions[exchange] = connection.getSubscriptions();
    }
    return subscriptions;
  }

  /**
   * Update global statistics
   */
  private updateGlobalStats(): void {
    this.globalStats.activeConnections = Array.from(this.connections.values())
      .filter(conn => conn.getStatus() === 'connected').length;
  }

  /**
   * Cleanup and shutdown
   */
  shutdown(): void {
    console.log(colors.blue('🛑 Shutting down WebSocket Manager...'));
    this.disconnectAll();
    this.connections.clear();
    this.globalStats.totalConnections = 0;
    this.globalStats.activeConnections = 0;
    this.globalStats.totalSubscriptions = 0;
    this.removeAllListeners();
  }
}

/**
 * Singleton WebSocket Manager instance
 */
let wsManagerInstance: WebSocketManager | null = null;

/**
 * Get or create the global WebSocket Manager instance
 */
export function getWebSocketManager(): WebSocketManager {
  if (!wsManagerInstance) {
    wsManagerInstance = new WebSocketManager();
  }
  return wsManagerInstance;
}

/**
 * Reset the global WebSocket Manager instance (for testing)
 */
export function resetWebSocketManager(): void {
  if (wsManagerInstance) {
    wsManagerInstance.shutdown();
  }
  wsManagerInstance = null;
}