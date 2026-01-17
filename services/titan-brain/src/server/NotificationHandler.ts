/**
 * Notification Handler Implementation
 * Bridges the CircuitBreaker NotificationHandler interface with the NotificationService
 */

import { NotificationHandler } from '../engine/CircuitBreaker.js';
import {
  NotificationService,
  CircuitBreakerNotification,
  HighCorrelationNotification,
  SweepNotification,
  VetoNotification,
} from './NotificationService.js';
import { PhaseId } from '../types/performance.js';

/**
 * Concrete implementation of NotificationHandler that uses NotificationService
 */
export class TitanNotificationHandler implements NotificationHandler {
  private notificationService: NotificationService;

  constructor(notificationService: NotificationService) {
    this.notificationService = notificationService;
  }

  /**
   * Send emergency notification for circuit breaker
   * Implementation of NotificationHandler interface
   */
  async sendEmergencyNotification(reason: string, equity: number): Promise<void> {
    const data: CircuitBreakerNotification = {
      reason,
      equity,
      drawdown: 0, // Will be calculated by the service
      triggeredAt: Date.now(),
    };

    await this.notificationService.sendCircuitBreakerNotification(data);
  }

  /**
   * Send high correlation warning
   * Requirement 6.5: Display warning when correlation exceeds threshold
   */
  async sendHighCorrelationWarning(
    correlationScore: number,
    threshold: number,
    affectedPositions: string[],
  ): Promise<void> {
    const data: HighCorrelationNotification = {
      correlationScore,
      threshold,
      affectedPositions,
    };

    await this.notificationService.sendHighCorrelationWarning(data);
  }

  /**
   * Send sweep notification
   * Requirement 4.7: Log all sweep transactions
   */
  async sendSweepNotification(
    amount: number,
    fromWallet: string,
    toWallet: string,
    reason: string,
    newBalance: number,
  ): Promise<void> {
    const data: SweepNotification = {
      amount,
      fromWallet,
      toWallet,
      reason,
      newBalance,
    };

    await this.notificationService.sendSweepNotification(data);
  }

  /**
   * Send veto notification to phases
   * Requirement 7.6: Notify originating phase when signal is vetoed
   */
  async sendVetoNotification(
    phaseId: PhaseId,
    signalId: string,
    symbol: string,
    reason: string,
    requestedSize: number,
  ): Promise<void> {
    const data: VetoNotification = {
      phaseId,
      signalId,
      symbol,
      reason,
      requestedSize,
    };

    await this.notificationService.sendVetoNotification(data);
  }

  /**
   * Send system error notification
   */
  async sendSystemError(error: string, context?: Record<string, any>): Promise<void> {
    await this.notificationService.sendSystemError(error, context);
  }

  /**
   * Test all notification channels
   */
  async testNotifications(): Promise<{ telegram: boolean; email: boolean }> {
    return await this.notificationService.testNotifications();
  }

  /**
   * Update notification configuration
   */
  updateConfig(config: any): void {
    this.notificationService.updateConfig(config);
  }
}
