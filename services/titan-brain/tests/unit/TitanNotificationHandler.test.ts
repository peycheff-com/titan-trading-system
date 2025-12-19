/**
 * Unit tests for TitanNotificationHandler
 */

import { TitanNotificationHandler } from '../../src/server/NotificationHandler.js';
import { NotificationService } from '../../src/server/NotificationService.js';
import { NotificationConfig } from '../../src/types/config.js';

// Mock the NotificationService
jest.mock('../../src/server/NotificationService.js');

describe('TitanNotificationHandler', () => {
  let handler: TitanNotificationHandler;
  let mockNotificationService: jest.Mocked<NotificationService>;

  beforeEach(() => {
    const mockConfig: NotificationConfig = {
      telegram: { enabled: true, botToken: 'test', chatId: 'test' },
      email: { enabled: false },
    };

    mockNotificationService = new NotificationService(mockConfig) as jest.Mocked<NotificationService>;
    
    // Mock all methods
    mockNotificationService.sendCircuitBreakerNotification = jest.fn().mockResolvedValue(undefined);
    mockNotificationService.sendHighCorrelationWarning = jest.fn().mockResolvedValue(undefined);
    mockNotificationService.sendSweepNotification = jest.fn().mockResolvedValue(undefined);
    mockNotificationService.sendVetoNotification = jest.fn().mockResolvedValue(undefined);
    mockNotificationService.sendSystemError = jest.fn().mockResolvedValue(undefined);
    mockNotificationService.testNotifications = jest.fn().mockResolvedValue({ telegram: true, email: false });
    mockNotificationService.updateConfig = jest.fn();

    handler = new TitanNotificationHandler(mockNotificationService);
  });

  describe('sendEmergencyNotification', () => {
    it('should call sendCircuitBreakerNotification with correct data', async () => {
      const reason = 'Daily drawdown exceeded 15%';
      const equity = 1000;

      await handler.sendEmergencyNotification(reason, equity);

      expect(mockNotificationService.sendCircuitBreakerNotification).toHaveBeenCalledWith({
        reason,
        equity,
        drawdown: 0,
        triggeredAt: expect.any(Number),
      });
    });
  });

  describe('sendHighCorrelationWarning', () => {
    it('should call sendHighCorrelationWarning with correct data', async () => {
      const correlationScore = 0.85;
      const threshold = 0.8;
      const affectedPositions = ['BTCUSDT', 'ETHUSDT'];

      await handler.sendHighCorrelationWarning(correlationScore, threshold, affectedPositions);

      expect(mockNotificationService.sendHighCorrelationWarning).toHaveBeenCalledWith({
        correlationScore,
        threshold,
        affectedPositions,
      });
    });
  });

  describe('sendSweepNotification', () => {
    it('should call sendSweepNotification with correct data', async () => {
      const amount = 500;
      const fromWallet = 'FUTURES';
      const toWallet = 'SPOT';
      const reason = 'Automated profit sweep';
      const newBalance = 1500;

      await handler.sendSweepNotification(amount, fromWallet, toWallet, reason, newBalance);

      expect(mockNotificationService.sendSweepNotification).toHaveBeenCalledWith({
        amount,
        fromWallet,
        toWallet,
        reason,
        newBalance,
      });
    });
  });

  describe('sendVetoNotification', () => {
    it('should call sendVetoNotification with correct data', async () => {
      const phaseId = 'phase1' as const;
      const signalId = 'signal_123';
      const symbol = 'BTCUSDT';
      const reason = 'Leverage cap exceeded';
      const requestedSize = 1000;

      await handler.sendVetoNotification(phaseId, signalId, symbol, reason, requestedSize);

      expect(mockNotificationService.sendVetoNotification).toHaveBeenCalledWith({
        phaseId,
        signalId,
        symbol,
        reason,
        requestedSize,
      });
    });
  });

  describe('sendSystemError', () => {
    it('should call sendSystemError with correct data', async () => {
      const error = 'Database connection failed';
      const context = { component: 'DatabaseManager' };

      await handler.sendSystemError(error, context);

      expect(mockNotificationService.sendSystemError).toHaveBeenCalledWith(error, context);
    });
  });

  describe('testNotifications', () => {
    it('should call testNotifications on the service', async () => {
      const result = await handler.testNotifications();

      expect(mockNotificationService.testNotifications).toHaveBeenCalled();
      expect(result).toEqual({ telegram: true, email: false });
    });
  });

  describe('updateConfig', () => {
    it('should call updateConfig on the service', () => {
      const newConfig: NotificationConfig = {
        telegram: { enabled: false },
        email: { enabled: true, smtpHost: 'smtp.test.com' },
      };

      handler.updateConfig(newConfig);

      expect(mockNotificationService.updateConfig).toHaveBeenCalledWith(newConfig);
    });
  });
});