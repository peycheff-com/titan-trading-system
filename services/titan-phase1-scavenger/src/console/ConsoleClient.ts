/**
 * Console Client for Titan Scavenger
 *
 * Pushes real-time updates to the Titan Console via HTTP POST.
 *
 * Requirements: 12.1-12.4
 * - Push trap_map_updated messages
 * - Push sensor_status_updated messages
 * - Push trap_sprung events
 * - Push execution_complete events
 */

import fetch, { RequestInit } from 'node-fetch';
import { Logger } from '../logging/Logger.js';

export interface ConsoleClientConfig {
  consoleUrl: string;
  enabled: boolean;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export interface TrapMapUpdate {
  symbolCount: number;
  symbols: string[];
  timestamp: number;
}

export interface SensorStatusUpdate {
  binanceHealth: string;
  binanceTickRate: number;
  bybitStatus: string;
  bybitPing: number;
  slippage: number;
  timestamp: number;
}

export interface TrapSprungEvent {
  symbol: string;
  trapType: string;
  price: number;
  direction: string;
  confidence: number;
  timestamp: number;
}

export interface ExecutionCompleteEvent {
  symbol: string;
  fillPrice: number;
  fillSize: number;
  side: string;
  timestamp: number;
}

/**
 * Console Client
 *
 * Sends real-time updates to the Titan Console.
 */
export class ConsoleClient {
  private config: ConsoleClientConfig;
  private isConnected: boolean = false;
  private logger: Logger;

  constructor(dependencies: { config: ConsoleClientConfig; logger: Logger }) {
    this.config = {
      retryAttempts: 3,
      retryDelayMs: 1000,
      ...dependencies.config,
    };
    this.logger = dependencies.logger;
  }

  /**
   * Test connection to Console
   */
  async connect(): Promise<boolean> {
    if (!this.config.enabled) {
      this.logger.info('📡 Console Client disabled (set CONSOLE_URL to enable)');
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.consoleUrl}/health`, {
        method: 'GET',
        signal: controller.signal as RequestInit['signal'],
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // eslint-disable-next-line functional/immutable-data
        this.isConnected = true;
        this.logger.info(`✅ Connected to Console at ${this.config.consoleUrl}`);
        return true;
      } else {
        this.logger.warn(`⚠️  Console health check failed: ${response.status}`);
        return false;
      }
    } catch (error) {
      this.logger.warn(`⚠️  Failed to connect to Console: ${error}`);
      return false;
    }
  }

  /**
   * Push trap map update to Console
   * Requirements: 12.1
   */
  async pushTrapMapUpdate(update: TrapMapUpdate): Promise<void> {
    if (!this.config.enabled) return;

    await this.sendEvent('trap_map_updated', update);
  }

  /**
   * Push sensor status update to Console
   * Requirements: 12.2
   */
  async pushSensorStatusUpdate(update: SensorStatusUpdate): Promise<void> {
    if (!this.config.enabled) return;

    await this.sendEvent('sensor_status_updated', update);
  }

  /**
   * Push trap sprung event to Console
   * Requirements: 12.3
   */
  async pushTrapSprung(event: TrapSprungEvent): Promise<void> {
    if (!this.config.enabled) return;

    await this.sendEvent('trap_sprung', event);
  }

  /**
   * Push execution complete event to Console
   * Requirements: 12.3
   */
  async pushExecutionComplete(event: ExecutionCompleteEvent): Promise<void> {
    if (!this.config.enabled) return;

    await this.sendEvent('execution_complete', event);
  }

  /**
   * Send event to Console with retry logic
   */
  private async sendEvent(eventType: string, data: any): Promise<void> {
    // eslint-disable-next-line functional/no-let
    let lastError: Error | null = null;

    // eslint-disable-next-line functional/no-let
    for (let attempt = 1; attempt <= (this.config.retryAttempts || 3); attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${this.config.consoleUrl}/api/scavenger/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event_type: eventType,
            data,
            source: 'scavenger',
            timestamp: Date.now(),
          }),
          signal: controller.signal as RequestInit['signal'],
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          // Success
          return;
        } else {
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        lastError = error as Error;
      }

      // Retry with exponential backoff
      if (attempt < (this.config.retryAttempts || 3)) {
        const delay = (this.config.retryDelayMs || 1000) * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    // All retries failed
    this.logger.warn(
      `⚠️  Failed to send ${eventType} to Console after ${this.config.retryAttempts} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if connected to Console
   */
  isConnectedToConsole(): boolean {
    return this.isConnected;
  }
}
