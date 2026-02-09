import {
  NotificationConfig,
} from '../types/config.js';
import {
  NotificationPayload,
  NotificationType,
} from '@titan/shared';
import { WebSocketService } from './WebSocketService.js';
import { randomUUID } from 'crypto';
import { PhaseId } from '../types/index.js'; // Assuming PhaseId is re-exported from index

// Re-export NotificationType for backward compatibility
export { NotificationType } from '@titan/shared';

/**
 * Notification message interface (Legacy - to be deprecated/migrated)
 */
export interface NotificationMessage {
  type: NotificationType;
  title: string;
  message: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Circuit breaker notification data
 */
export interface CircuitBreakerNotification {
  reason: string;
  equity: number;
  drawdown: number;
  triggeredAt: number;
}

/**
 * High correlation warning data
 */
export interface HighCorrelationNotification {
  correlationScore: number;
  threshold: number;
  affectedPositions: string[];
}

/**
 * Sweep notification data
 */
export interface SweepNotification {
  amount: number;
  fromWallet: string;
  toWallet: string;
  reason: string;
  newBalance: number;
}

/**
 * Veto notification data
 */
export interface VetoNotification {
  phaseId: PhaseId;
  signalId: string;
  symbol: string;
  reason: string;
  requestedSize: number;
}

/**
 * Notification service for sending alerts via multiple channels
 */
export class NotificationService {
  private config: NotificationConfig;
  private retryAttempts = 3;
  private retryDelay = 1000; // 1 second base delay
  private webSocketService: WebSocketService | null = null;
  private dedupCache: Map<string, { count: number; timestamp: number }> = new Map();
  private readonly DEDUP_WINDOW_MS = 60000; // 1 minute

  constructor(config: NotificationConfig) {
    this.config = config;
  }

  setWebSocketService(ws: WebSocketService) {
    this.webSocketService = ws;
  }

  /**
   * Send circuit breaker emergency notification
   * Requirement 5.6: Send emergency notifications via all configured channels
   */
  async sendCircuitBreakerNotification(data: CircuitBreakerNotification): Promise<void> {
    const message: NotificationMessage = {
      type: NotificationType.CIRCUIT_BREAKER,
      title: '🚨 CIRCUIT BREAKER TRIGGERED',
      message: this.formatCircuitBreakerMessage(data),
      priority: 'CRITICAL',
      timestamp: Date.now(),
      metadata: data as unknown as Record<string, unknown>,
    };

    await this.sendNotification(message);

    // Broadcast via WebSocket
    this.broadcastToConsole({
      severity: 'CRITICAL',
      reason_code: 'CIRCUIT_BREAKER_TRIGGERED',
      message: `Circuit Breaker Triggered: ${data.reason}`,
      metadata: data as unknown as Record<string, unknown>,
      action_path: {
        type: 'modal',
        target: 'circuit-breaker-modal',
        label: 'Review System Halt',
      },
    });
  }

  /**
   * Send high correlation warning
   * Requirement 6.5: Display warning when correlation exceeds threshold
   */
  async sendHighCorrelationWarning(data: HighCorrelationNotification): Promise<void> {
    const message: NotificationMessage = {
      type: NotificationType.HIGH_CORRELATION,
      title: '⚠️ HIGH CORRELATION WARNING',
      message: this.formatHighCorrelationMessage(data),
      priority: 'HIGH',
      timestamp: Date.now(),
      metadata: data as unknown as Record<string, unknown>,
    };

    await this.sendNotification(message);

    this.broadcastToConsole({
      severity: 'WARNING',
      reason_code: 'HIGH_CORRELATION',
      message: `High Correlation Detected: ${(data.correlationScore * 100).toFixed(1)}%`,
      metadata: data as unknown as Record<string, unknown>,
    });
  }

  /**
   * Send sweep notification
   * Requirement 4.7: Log all sweep transactions
   */
  async sendSweepNotification(data: SweepNotification): Promise<void> {
    const message: NotificationMessage = {
      type: NotificationType.SWEEP_NOTIFICATION,
      title: '💰 PROFIT SWEEP EXECUTED',
      message: this.formatSweepMessage(data),
      priority: 'MEDIUM',
      timestamp: Date.now(),
      metadata: data as unknown as Record<string, unknown>,
    };

    await this.sendNotification(message);

    this.broadcastToConsole({
      severity: 'INFO',
      reason_code: 'PROFIT_SWEEP',
      message: `Profit Sweep: $${data.amount.toFixed(2)} to ${data.toWallet}`,
      metadata: data as unknown as Record<string, unknown>,
    });
  }

  /**
   * Send veto notification to phases
   * Requirement 7.6: Notify originating phase when signal is vetoed
   */
  async sendVetoNotification(data: VetoNotification): Promise<void> {
    const message: NotificationMessage = {
      type: NotificationType.VETO_NOTIFICATION,
      title: '❌ SIGNAL VETOED',
      message: this.formatVetoMessage(data),
      priority: 'MEDIUM',
      timestamp: Date.now(),
      metadata: data as unknown as Record<string, unknown>,
    };

    await this.sendNotification(message);

    this.broadcastToConsole({
      severity: 'WARNING',
      reason_code: 'SIGNAL_VETOED',
      message: `Signal Vetoed: ${data.symbol} - ${data.reason}`,
      metadata: data as unknown as Record<string, unknown>,
    });
  }

  /**
   * Send system error notification
   */
  async sendSystemError(error: string, context?: Record<string, unknown>): Promise<void> {
    const message: NotificationMessage = {
      type: NotificationType.SYSTEM_ERROR,
      title: '🔥 SYSTEM ERROR',
      message: `System Error: ${error}`,
      priority: 'HIGH',
      timestamp: Date.now(),
      metadata: context,
    };

    await this.sendNotification(message);

    this.broadcastToConsole({
      severity: 'CRITICAL',
      reason_code: 'SYSTEM_ERROR',
      message: error,
      metadata: context,
    });
  }

  /**
   * Broadcast to Console (WebSocket) with Deduplication
   */
  private broadcastToConsole(
    params: Omit<NotificationPayload, 'id' | 'timestamp' | 'trace_id' | 'source' | 'count' | 'acknowledged'>
  ) {
    if (!this.webSocketService) return;

    const dedupKey = `${params.reason_code}:${params.message}`;
    const now = Date.now();
    const cached = this.dedupCache.get(dedupKey);

    // Dedup logic
    if (cached && now - cached.timestamp < this.DEDUP_WINDOW_MS) {
      cached.count++;
      cached.timestamp = now;
      this.dedupCache.set(dedupKey, cached);
    } else {
      this.dedupCache.set(dedupKey, { count: 1, timestamp: now });
    }

    const currentCount = this.dedupCache.get(dedupKey)?.count || 1;

    const payload: NotificationPayload = {
      id: randomUUID(),
      trace_id: randomUUID(), // TODO: Use real trace context
      source: 'brain',
      timestamp: now,
      count: currentCount,
      acknowledged: false,
      ...params,
    };

    this.webSocketService.broadcastNotification(payload);
  }

  /**
   * Send notification via all enabled channels
   */
  private async sendNotification(message: NotificationMessage): Promise<void> {
    const promises: Promise<void>[] = [];

    // Send via Telegram if enabled
    if (this.config.telegram.enabled) {
      promises.push(this.sendTelegramNotification(message));
    }

    // Send via Email if enabled
    if (this.config.email.enabled) {
      promises.push(this.sendEmailNotification(message));
    }

    // Wait for all notifications to complete
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * Send notification via Telegram
   */
  private async sendTelegramNotification(message: NotificationMessage): Promise<void> {
    if (!this.config.telegram.botToken || !this.config.telegram.chatId) {
      return;
    }

    const telegramMessage = this.formatTelegramMessage(message);
    const url = `https://api.telegram.org/bot${this.config.telegram.botToken}/sendMessage`;

    const payload = {
      chat_id: this.config.telegram.chatId,
      text: telegramMessage,
      parse_mode: 'Markdown',
    };

    await this.retryRequest(async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Telegram API error: ${response.status} - ${error}`);
      }
    });
  }

  /**
   * Send notification via Email (placeholder implementation)
   */
  private async sendEmailNotification(message: NotificationMessage): Promise<void> {
    if (!this.config.email.smtpHost || !this.config.email.from || !this.config.email.to?.length) {
      return;
    }

    // Placeholder log
    console.log('Email notification (not implemented):', {
      to: this.config.email.to,
      subject: message.title,
      body: message.message,
    });
  }

  /**
   * Format circuit breaker message
   */
  private formatCircuitBreakerMessage(data: CircuitBreakerNotification): string {
    return `EMERGENCY: Circuit breaker triggered!
    
Reason: ${data.reason}
Current Equity: $${data.equity.toFixed(2)}
Drawdown: ${(data.drawdown * 100).toFixed(2)}%
Time: ${new Date(data.triggeredAt).toISOString()}

All positions have been closed and trading is halted.
Manual reset required to resume operations.`;
  }

  /**
   * Format high correlation message
   */
  private formatHighCorrelationMessage(data: HighCorrelationNotification): string {
    return `High correlation detected between positions!
    
Correlation Score: ${(data.correlationScore * 100).toFixed(2)}%
Threshold: ${(data.threshold * 100).toFixed(2)}%
Affected Positions: ${data.affectedPositions.join(', ')}

Risk management measures may be applied to new signals.`;
  }

  /**
   * Format sweep message
   */
  private formatSweepMessage(data: SweepNotification): string {
    return `Profit sweep executed successfully!
    
Amount: $${data.amount.toFixed(2)}
From: ${data.fromWallet}
To: ${data.toWallet}
Reason: ${data.reason}
New Balance: $${data.newBalance.toFixed(2)}`;
  }

  /**
   * Format veto message
   */
  private formatVetoMessage(data: VetoNotification): string {
    return `Signal vetoed by Brain risk management!
    
Phase: ${data.phaseId}
Signal ID: ${data.signalId}
Symbol: ${data.symbol}
Requested Size: $${data.requestedSize.toFixed(2)}
Reason: ${data.reason}`;
  }

  /**
   * Format message for Telegram with markdown
   */
  private formatTelegramMessage(message: NotificationMessage): string {
    const priorityEmoji = {
      LOW: '🔵',
      MEDIUM: '🟡',
      HIGH: '🟠',
      CRITICAL: '🔴',
    };

    return `${priorityEmoji[message.priority]} *${message.title}*

${message.message}

_${new Date(message.timestamp).toISOString()}_`;
  }

  /**
   * Retry mechanism for network requests
   */
  private async retryRequest(fn: () => Promise<void>): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        await fn();
        return;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.retryAttempts) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw new Error(`Notification failed after ${this.retryAttempts} attempts: ${lastError?.message}`);
  }

  /**
   * Update configuration
   */
  updateConfig(config: NotificationConfig): void {
    this.config = config;
  }
  
  /**
   * Test notification channels
   */
  async testNotifications(): Promise<{ telegram: boolean; email: boolean }> {
      const results = { telegram: false, email: false };

      // Test Telegram
      if (this.config.telegram.enabled) {
        try {
          const testMessage: NotificationMessage = {
            type: NotificationType.SYSTEM_ERROR,
            title: '🧪 Test Notification',
            message: 'This is a test notification from Titan Brain.',
            priority: 'LOW',
            timestamp: Date.now(),
          };
          await this.sendTelegramNotification(testMessage);
  
          results.telegram = true;
        } catch (error) {
          console.error('Telegram test failed:', error);
        }
      }
  
      // Test Email
      if (this.config.email.enabled) {
        try {
          const testMessage: NotificationMessage = {
            type: NotificationType.SYSTEM_ERROR,
            title: '🧪 Test Notification',
            message: 'This is a test notification from Titan Brain.',
            priority: 'LOW',
            timestamp: Date.now(),
          };
          await this.sendEmailNotification(testMessage);
  
          results.email = true;
        } catch (error) {
          console.error('Email test failed:', error);
        }
      }
  
      return results;
    }
}
