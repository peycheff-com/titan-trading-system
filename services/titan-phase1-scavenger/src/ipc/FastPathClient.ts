/**
 * Fast Path IPC Client - Enhanced Version
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
 * Intent Signal sent to Execution Service
 */
export interface IntentSignal {
  signal_id: string;
  source: 'scavenger' | 'hunter' | 'sentinel';
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry_zone: { min: number; max: number };
  stop_loss: number;
  take_profits: number[];
  confidence: number;
  leverage: number;
  velocity?: number;
  trap_type?: string;
  timestamp: number;
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
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}

/**
 * IPC Client configuration
 */
export interface IPCClientConfig {
  socketPath: string;
  hmacSecret: string;
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
  messagessSent: number;
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
 * 
 * Enhanced with automatic reconnection, connection management, and comprehensive error handling.
 */
export class FastPathClient extends EventEmitter {
  private config: IPCClientConfig;
  private socket: net.Socket | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private disconnecting: boolean = false;
  private messageBuffer: string = '';
  private pendingMessages: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  private messageId: number = 0;
  
  // Metrics
  private metrics: IPCMetrics = {
    messagessSent: 0,
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
      socketPath: config?.socketPath || process.env.TITAN_IPC_SOCKET || '/tmp/titan-ipc.sock',
      hmacSecret: config?.hmacSecret || process.env.TITAN_HMAC_SECRET || 'default-secret',
      maxReconnectAttempts: config?.maxReconnectAttempts || 10,
      baseReconnectDelay: config?.baseReconnectDelay || 1000,
      maxReconnectDelay: config?.maxReconnectDelay || 30000,
      connectionTimeout: config?.connectionTimeout || 5000,
      messageTimeout: config?.messageTimeout || 1000,
      enableMetrics: config?.enableMetrics ?? true,
    };
  }

  /**
   * Connect to IPC server with enhanced error handling and automatic reconnection
   */
  async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTED && this.socket) {
      return;
    }

    if (this.connectionState === ConnectionState.CONNECTING) {
      // Wait for existing connection attempt
      return new Promise((resolve, reject) => {
        const onConnected = () => {
          this.removeListener('error', onError);
          resolve();
        };
        const onError = (error: Error) => {
          this.removeListener('connected', onConnected);
          reject(error);
        };
        
        this.once('connected', onConnected);
        this.once('error', onError);
      });
    }

    return this.attemptConnection();
  }

  /**
   * Attempt connection with timeout and error handling
   */
  private async attemptConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connectionState = ConnectionState.CONNECTING;
      this.emit('connecting');

      // Clean up existing socket
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

      this.socket.on('connect', () => {
        cleanup();
        this.connectionState = ConnectionState.CONNECTED;
        this.reconnectAttempts = 0;
        this.metrics.lastConnectedAt = Date.now();
        
        console.log(`✅ Connected to Execution Service via Fast Path IPC (${this.config.socketPath})`);
        this.emit('connected');
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        this.handleIncomingData(data);
      });

      this.socket.on('error', (error: Error) => {
        cleanup();
        this.connectionState = ConnectionState.FAILED;
        this.metrics.lastDisconnectedAt = Date.now();
        
        // Don't log or reconnect if we're intentionally disconnecting
        if (this.disconnecting) {
          reject(error);
          return;
        }

        console.error(`❌ Fast Path IPC error: ${error.message}`);
        this.emit('error', error);

        // Attempt automatic reconnection
        this.scheduleReconnection();
        reject(error);
      });

      this.socket.on('close', () => {
        cleanup();
        if (this.connectionState !== ConnectionState.FAILED) {
          this.connectionState = ConnectionState.DISCONNECTED;
        }
        this.metrics.lastDisconnectedAt = Date.now();
        
        console.log('🔌 Fast Path IPC connection closed');
        this.emit('disconnected');

        // Clear pending messages
        this.clearPendingMessages('Connection closed');

        // Attempt automatic reconnection if not intentionally disconnecting
        if (!this.disconnecting) {
          this.scheduleReconnection();
        }
      });

      // Set connection timeout
      connectionTimeout = setTimeout(() => {
        cleanup();
        this.connectionState = ConnectionState.FAILED;
        
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.destroy();
          this.socket = null;
        }
        
        const error = new Error(`IPC connection timeout after ${this.config.connectionTimeout}ms`);
        this.emit('error', error);
        reject(error);
      }, this.config.connectionTimeout);
    });
  }

  /**
   * Schedule automatic reconnection with exponential backoff
   */
  private scheduleReconnection(): void {
    if (this.disconnecting || this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
        console.error(`❌ Max reconnection attempts (${this.config.maxReconnectAttempts}) reached`);
        this.connectionState = ConnectionState.FAILED;
        this.emit('maxReconnectAttemptsReached');
      }
      return;
    }

    this.reconnectAttempts++;
    this.metrics.reconnectAttempts++;
    
    // Exponential backoff with jitter
    const delay = Math.min(
      this.config.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.config.maxReconnectDelay
    );
    const jitter = Math.random() * 0.1 * delay; // 10% jitter
    const finalDelay = delay + jitter;

    console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${Math.round(finalDelay)}ms`);
    
    this.connectionState = ConnectionState.RECONNECTING;
    this.emit('reconnecting', this.reconnectAttempts);

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

  /**
   * Handle incoming data with message framing
   */
  private handleIncomingData(data: Buffer): void {
    this.messageBuffer += data.toString();

    // Process complete messages (delimited by newlines)
    let delimiterIndex;
    while ((delimiterIndex = this.messageBuffer.indexOf('\n')) !== -1) {
      const messageStr = this.messageBuffer.slice(0, delimiterIndex);
      this.messageBuffer = this.messageBuffer.slice(delimiterIndex + 1);

      try {
        const message = JSON.parse(messageStr);
        this.handleMessage(message);
      } catch (error) {
        console.error(`❌ Failed to parse IPC message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        this.metrics.messagesFailed++;
      }
    }
  }

  /**
   * Handle parsed message
   */
  private handleMessage(message: any): void {
    this.metrics.messagesReceived++;

    // Handle message with correlation ID
    if (message.correlationId && this.pendingMessages.has(message.correlationId)) {
      const pending = this.pendingMessages.get(message.correlationId)!;
      this.pendingMessages.delete(message.correlationId);
      
      clearTimeout(pending.timeout);
      
      // Calculate latency
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
      // Handle unsolicited messages (events, notifications)
      this.emit('message', message);
    }
  }

  /**
   * Update latency metrics
   */
  private updateLatencyMetrics(latency: number): void {
    this.metrics.totalLatencyMs += latency;
    this.metrics.minLatencyMs = Math.min(this.metrics.minLatencyMs, latency);
    this.metrics.maxLatencyMs = Math.max(this.metrics.maxLatencyMs, latency);
    
    if (this.metrics.messagesReceived > 0) {
      this.metrics.avgLatencyMs = this.metrics.totalLatencyMs / this.metrics.messagesReceived;
    }
  }

  /**
   * Clear all pending messages with error
   */
  private clearPendingMessages(reason: string): void {
    for (const [correlationId, pending] of this.pendingMessages) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    this.pendingMessages.clear();
  }

  /**
   * Send PREPARE signal with enhanced serialization and error handling
   * 
   * Pre-fetches L2 data and calculates position size.
   * Returns prepared signal_id for later CONFIRM/ABORT.
   */
  async sendPrepare(signal: IntentSignal): Promise<PrepareResponse> {
    const enhancedSignal = {
      ...signal,
      signal_type: 'PREPARE',
      timestamp: Date.now(),
      source: 'scavenger',
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
      console.error(`❌ Failed to send PREPARE signal: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`PREPARE_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send CONFIRM signal with enhanced error handling
   * 
   * Executes the prepared order via BrokerGateway.
   */
  async sendConfirm(signal_id: string): Promise<ConfirmResponse> {
    const signal = {
      signal_id,
      signal_type: 'CONFIRM',
      timestamp: Date.now(),
      source: 'scavenger',
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
      console.error(`❌ Failed to send CONFIRM signal: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`CONFIRM_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send ABORT signal with enhanced error handling
   * 
   * Discards the prepared order without execution.
   */
  async sendAbort(signal_id: string): Promise<AbortResponse> {
    const signal = {
      signal_id,
      signal_type: 'ABORT',
      timestamp: Date.now(),
      source: 'scavenger',
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
      console.error(`❌ Failed to send ABORT signal: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`ABORT_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate unique correlation ID for message tracking
   */
  private generateCorrelationId(): string {
    return `scavenger-${Date.now()}-${++this.messageId}`;
  }

  /**
   * Send message and wait for reply with enhanced error handling
   * 
   * @param message - Message to send
   * @param timeout - Timeout in milliseconds (uses config default if not specified)
   */
  private async send(message: any, timeout?: number): Promise<any> {
    if (this.connectionState !== ConnectionState.CONNECTED || !this.socket) {
      throw new Error('NOT_CONNECTED');
    }

    const actualTimeout = timeout || this.config.messageTimeout;
    const correlationId = message.correlationId;

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingMessages.delete(correlationId);
        this.metrics.messagesFailed++;
        reject(new Error(`IPC_TIMEOUT: No response received within ${actualTimeout}ms`));
      }, actualTimeout);

      // Store pending message
      this.pendingMessages.set(correlationId, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      try {
        // Serialize and send message
        const messageStr = this.serializeMessage(message);
        const success = this.socket!.write(messageStr);
        
        if (!success) {
          // Handle backpressure
          this.socket!.once('drain', () => {
            console.log('Socket drained after backpressure');
          });
        }

        this.metrics.messagessSent++;
      } catch (error) {
        // Clean up on send failure
        this.pendingMessages.delete(correlationId);
        clearTimeout(timeoutHandle);
        this.metrics.messagesFailed++;
        reject(new Error(`SEND_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  /**
   * Serialize message with proper framing
   */
  private serializeMessage(message: any): string {
    try {
      return JSON.stringify(message) + '\n';
    } catch (error) {
      throw new Error(`SERIALIZATION_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate HMAC signature for authentication with enhanced security
   */
  private sign(signal: any): string {
    try {
      // Ensure consistent serialization for signature
      const normalizedSignal = this.normalizeForSigning(signal);
      return crypto
        .createHmac('sha256', this.config.hmacSecret)
        .update(JSON.stringify(normalizedSignal))
        .digest('hex');
    } catch (error) {
      throw new Error(`SIGNATURE_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Normalize object for consistent signing (sort keys, handle undefined)
   */
  private normalizeForSigning(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.normalizeForSigning(item));
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

  /**
   * Disconnect from IPC server with graceful cleanup
   */
  async disconnect(): Promise<void> {
    this.disconnecting = true;
    this.connectionState = ConnectionState.DISCONNECTED;
    
    // Cancel any pending reconnection
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Clear pending messages
    this.clearPendingMessages('Client disconnecting');
    
    if (this.socket) {
      return new Promise<void>((resolve) => {
        const cleanup = () => {
          if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
          }
          this.emit('disconnected');
          resolve();
        };

        // Try graceful close first
        this.socket!.end();
        
        // Force close after timeout
        setTimeout(cleanup, 1000);
        this.socket!.once('close', cleanup);
      });
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get comprehensive connection status
   */
  getStatus(): {
    connectionState: ConnectionState;
    socketPath: string;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
    pendingMessages: number;
    metrics: IPCMetrics;
    config: IPCClientConfig;
  } {
    return {
      connectionState: this.connectionState,
      socketPath: this.config.socketPath,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      pendingMessages: this.pendingMessages.size,
      metrics: { ...this.metrics },
      config: { ...this.config },
    };
  }

  /**
   * Get metrics
   */
  getMetrics(): IPCMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      messagessSent: 0,
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

  /**
   * Test connection with ping
   */
  async ping(): Promise<{ success: boolean; latency?: number; error?: string }> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    const startTime = Date.now();
    
    try {
      const message = {
        signal: { signal_type: 'PING', timestamp: startTime },
        signature: this.sign({ signal_type: 'PING', timestamp: startTime }),
        correlationId: this.generateCorrelationId(),
        timestamp: startTime,
      };

      await this.send(message, 5000); // 5 second timeout for ping
      const latency = Date.now() - startTime;
      
      return { success: true, latency };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Force reconnection (useful for testing or manual recovery)
   */
  async forceReconnect(): Promise<void> {
    console.log('🔄 Force reconnecting...');
    
    // Disconnect first
    await this.disconnect();
    
    // Reset state
    this.disconnecting = false;
    this.reconnectAttempts = 0;
    
    // Reconnect
    await this.connect();
  }
}
