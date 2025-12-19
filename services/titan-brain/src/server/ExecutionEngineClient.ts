/**
 * ExecutionEngineClient - Integration with Titan Execution Engine
 * 
 * Implements signal forwarding to the Execution Engine and receives fill confirmations.
 * Handles position state synchronization between Brain and Execution services.
 * 
 * Requirements: 1.7, 7.5
 */

import { EventEmitter } from 'events';
import { createHmac } from 'crypto';
import {
  IntentSignal,
  Position,
  PhaseId,
} from '../types/index.js';
import { ExecutionEngineClient as IExecutionEngineClient } from '../engine/TitanBrain.js';

/**
 * Configuration for Execution Engine Client
 */
export interface ExecutionEngineConfig {
  /** Base URL of the Execution Engine */
  baseUrl: string;
  /** HMAC secret for request signing */
  hmacSecret?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * Fill confirmation from Execution Engine
 */
export interface FillConfirmation {
  signalId: string;
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  fillPrice: number;
  fillSize: number;
  requestedSize: number;
  timestamp: number;
  fees?: number;
  slippage?: number;
}

/**
 * Position data from Execution Engine
 */
export interface ExecutionPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  unrealizedPnl: number;
  leverage: number;
  timestamp: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<ExecutionEngineConfig> = {
  timeout: 5000,
  maxRetries: 3,
  retryDelay: 1000,
};

/**
 * ExecutionEngineClient handles communication with the Titan Execution Engine
 */
export class ExecutionEngineClient extends EventEmitter implements IExecutionEngineClient {
  private readonly config: Required<ExecutionEngineConfig>;
  private connected: boolean = false;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: ExecutionEngineConfig) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      hmacSecret: config.hmacSecret || '',
    } as Required<ExecutionEngineConfig>;
  }

  /**
   * Initialize the client and start health checks
   */
  async initialize(): Promise<void> {
    console.log(`🔗 Connecting to Execution Engine at ${this.config.baseUrl}...`);
    
    // Test connection
    const healthy = await this.healthCheck();
    if (!healthy) {
      console.warn('⚠️ Execution Engine not available, will retry on signal forwarding');
    } else {
      console.log('✅ Execution Engine connection established');
    }

    // Start periodic health checks
    this.healthCheckInterval = setInterval(async () => {
      await this.healthCheck();
    }, 30000); // Every 30 seconds
  }

  /**
   * Shutdown the client
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.connected = false;
    console.log('🔌 Execution Engine client disconnected');
  }

  /**
   * Forward a signal to the Execution Engine
   * Requirement 7.5: Maximum latency of 100ms
   * 
   * @param signal - Intent signal to forward
   * @param authorizedSize - Size authorized by the Brain
   */
  async forwardSignal(signal: IntentSignal, authorizedSize: number): Promise<void> {
    const startTime = Date.now();

    const payload = {
      signal_id: signal.signalId,
      source: this.mapPhaseIdToSource(signal.phaseId),
      symbol: signal.symbol,
      direction: signal.side === 'BUY' ? 'LONG' : 'SHORT',
      size: authorizedSize,
      leverage: signal.leverage || 1,
      timestamp: signal.timestamp,
      brain_authorized: true,
      brain_timestamp: Date.now(),
    };

    try {
      const response = await this.makeRequest('/webhook/signal', 'POST', payload);
      
      const latency = Date.now() - startTime;
      console.log(`📤 Signal forwarded to Execution Engine: ${signal.signalId} (${latency}ms)`);

      // Emit forwarded event
      this.emit('signal:forwarded', {
        signalId: signal.signalId,
        symbol: signal.symbol,
        authorizedSize,
        latency,
        response,
      });

      // Check for immediate fill confirmation in response
      if (response.fill) {
        this.handleFillConfirmation(response.fill);
      }

    } catch (error) {
      console.error(`❌ Failed to forward signal ${signal.signalId}:`, error);
      
      this.emit('signal:forward_failed', {
        signalId: signal.signalId,
        symbol: signal.symbol,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Close all positions via Execution Engine
   * Called by Circuit Breaker for emergency flatten
   */
  async closeAllPositions(): Promise<void> {
    console.log('🚨 Requesting emergency position closure from Execution Engine...');

    try {
      const response = await this.makeRequest('/positions/flatten', 'POST', {
        reason: 'BRAIN_CIRCUIT_BREAKER',
        timestamp: Date.now(),
      });

      console.log(`✅ Emergency flatten completed: ${response.closed_count || 0} positions closed`);

      this.emit('positions:flattened', {
        closedCount: response.closed_count || 0,
        reason: 'BRAIN_CIRCUIT_BREAKER',
        timestamp: Date.now(),
      });

    } catch (error) {
      console.error('❌ Failed to close all positions:', error);
      throw error;
    }
  }

  /**
   * Get current positions from Execution Engine
   * Used for position state synchronization
   */
  async getPositions(): Promise<Position[]> {
    try {
      const response = await this.makeRequest('/positions', 'GET');
      
      const positions: Position[] = (response.positions || []).map((pos: ExecutionPosition) => ({
        symbol: pos.symbol,
        side: pos.side,
        size: pos.size,
        entryPrice: pos.entryPrice,
        unrealizedPnl: pos.unrealizedPnl,
        leverage: pos.leverage,
        timestamp: pos.timestamp,
      }));

      return positions;

    } catch (error) {
      console.error('❌ Failed to get positions:', error);
      return [];
    }
  }

  /**
   * Get current equity from Execution Engine
   */
  async getEquity(): Promise<number> {
    try {
      const response = await this.makeRequest('/state/equity', 'GET');
      return response.equity || 0;
    } catch (error) {
      console.error('❌ Failed to get equity:', error);
      return 0;
    }
  }

  /**
   * Perform health check on Execution Engine
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest('/health', 'GET', undefined, 2000);
      this.connected = response.status === 'healthy' || response.status === 'ok';
      this.lastHealthCheck = Date.now();
      return this.connected;
    } catch (error) {
      this.connected = false;
      return false;
    }
  }

  /**
   * Check if connected to Execution Engine
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get last health check timestamp
   */
  getLastHealthCheck(): number {
    return this.lastHealthCheck;
  }

  /**
   * Register a fill confirmation callback
   * Called when Execution Engine confirms an order fill
   */
  onFillConfirmation(callback: (fill: FillConfirmation) => void): void {
    this.on('fill:confirmed', callback);
  }

  /**
   * Handle incoming fill confirmation
   */
  handleFillConfirmation(fill: FillConfirmation): void {
    console.log(`✅ Fill confirmed: ${fill.signalId} @ ${fill.fillPrice}`);
    this.emit('fill:confirmed', fill);
  }

  /**
   * Map PhaseId to source string for Execution Engine
   */
  private mapPhaseIdToSource(phaseId: PhaseId): string {
    switch (phaseId) {
      case 'phase1':
        return 'scavenger';
      case 'phase2':
        return 'hunter';
      case 'phase3':
        return 'sentinel';
      default:
        return 'unknown';
    }
  }

  /**
   * Make HTTP request to Execution Engine
   */
  private async makeRequest(
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    body?: unknown,
    timeout?: number
  ): Promise<any> {
    const url = `${this.config.baseUrl}${path}`;
    const requestTimeout = timeout || this.config.timeout;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add HMAC signature if secret is configured
    if (this.config.hmacSecret && body) {
      const bodyString = JSON.stringify(body);
      const signature = createHmac('sha256', this.config.hmacSecret)
        .update(bodyString)
        .digest('hex');
      headers['x-signature'] = signature;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        return await response.json();

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.config.maxRetries) {
          console.warn(`Request to ${path} failed (attempt ${attempt}/${this.config.maxRetries}), retrying...`);
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }

    clearTimeout(timeoutId);
    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
