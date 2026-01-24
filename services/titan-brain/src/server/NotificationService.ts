/**
 * Notification Service for Titan Brain
 * Handles all notification channels (Telegram, email) for alerts
 */

import { NotificationConfig } from '../types/config.js';
import { PhaseId } from '../types/performance.js';

/**
 * Notification types for different alert categories
 */
export enum NotificationType {
  CIRCUIT_BREAKER = 'CIRCUIT_BREAKER',
  HIGH_CORRELATION = 'HIGH_CORRELATION',
  SWEEP_NOTIFICATION = 'SWEEP_NOTIFICATION',
  VETO_NOTIFICATION = 'VETO_NOTIFICATION',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
}

/**
 * Notification message interface
 */
export interface NotificationMessage {
  type: NotificationType;
  title: string;
  message: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: number;
  metadata?: Record<string, any>;
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

  constructor(config: NotificationConfig) {
    this.config = config;
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
      metadata: data,
    };

    await this.sendNotification(message);
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
      metadata: data,
    };

    await this.sendNotification(message);
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
      metadata: data,
    };

    await this.sendNotification(message);
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
      metadata: data,
    };

    await this.sendNotification(message);
  }

  /**
   * Send system error notification
   */
  async sendSystemError(error: string, context?: Record<string, any>): Promise<void> {
    const message: NotificationMessage = {
      type: NotificationType.SYSTEM_ERROR,
      title: '🔥 SYSTEM ERROR',
      message: `System Error: ${error}`,
      priority: 'HIGH',
      timestamp: Date.now(),
      metadata: context,
    };

    await this.sendNotification(message);
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
      throw new Error('Telegram configuration incomplete');
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
      throw new Error('Email configuration incomplete');
    }

    // TODO: Implement email sending using nodemailer or similar
    // For now, just log the email that would be sent
    console.log('Email notification (not implemented):', {
      to: this.config.email.to,
      subject: message.title,
      body: message.message,
      timestamp: new Date(message.timestamp).toISOString(),
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
        return; // Success
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.retryAttempts) {
          // Exponential backoff
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    throw new Error(
      `Notification failed after ${this.retryAttempts} attempts: ${lastError?.message}`,
    );
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
