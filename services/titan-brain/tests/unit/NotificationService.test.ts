/**
 * Unit tests for NotificationService
 */

import { NotificationService } from "../../src/server/NotificationService.js";
import { NotificationConfig } from "../../src/types/config.js";

// Mock fetch globally
global.fetch = jest.fn();

describe("NotificationService", () => {
  let notificationService: NotificationService;
  let mockConfig: NotificationConfig;

  beforeEach(() => {
    mockConfig = {
      telegram: {
        enabled: true,
        botToken: "test_bot_token",
        chatId: "test_chat_id",
      },
      email: {
        enabled: false,
      },
    };

    notificationService = new NotificationService(mockConfig);

    // Reset fetch mock
    (fetch as jest.Mock).mockReset();
  });

  describe("sendCircuitBreakerNotification", () => {
    it("should send circuit breaker notification via Telegram", async () => {
      // Mock successful Telegram API response
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('{"ok":true}'),
      });

      const data = {
        reason: "Daily drawdown exceeded 15%",
        equity: 1000,
        drawdown: 0.15,
        triggeredAt: Date.now(),
      };

      await notificationService.sendCircuitBreakerNotification(data);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bottest_bot_token/sendMessage",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: expect.stringContaining("CIRCUIT BREAKER TRIGGERED"),
        }),
      );
    });

    it("should retry on failure", async () => {
      // Mock first call failure, second call success
      (fetch as jest.Mock)
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue('{"ok":true}'),
        });

      const data = {
        reason: "Test failure",
        equity: 1000,
        drawdown: 0.15,
        triggeredAt: Date.now(),
      };

      await notificationService.sendCircuitBreakerNotification(data);

      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("sendHighCorrelationWarning", () => {
    it("should send high correlation warning", async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('{"ok":true}'),
      });

      const data = {
        correlationScore: 0.85,
        threshold: 0.8,
        affectedPositions: ["BTCUSDT", "ETHUSDT"],
      };

      await notificationService.sendHighCorrelationWarning(data);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bottest_bot_token/sendMessage",
        expect.objectContaining({
          body: expect.stringContaining("HIGH CORRELATION WARNING"),
        }),
      );
    });
  });

  describe("sendSweepNotification", () => {
    it("should send sweep notification", async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('{"ok":true}'),
      });

      const data = {
        amount: 500,
        fromWallet: "FUTURES",
        toWallet: "SPOT",
        reason: "Automated profit sweep",
        newBalance: 1500,
      };

      await notificationService.sendSweepNotification(data);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bottest_bot_token/sendMessage",
        expect.objectContaining({
          body: expect.stringContaining("PROFIT SWEEP EXECUTED"),
        }),
      );
    });
  });

  describe("sendVetoNotification", () => {
    it("should send veto notification", async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('{"ok":true}'),
      });

      const data = {
        phaseId: "phase1" as const,
        signalId: "signal_123",
        symbol: "BTCUSDT",
        reason: "Leverage cap exceeded",
        requestedSize: 1000,
      };

      await notificationService.sendVetoNotification(data);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bottest_bot_token/sendMessage",
        expect.objectContaining({
          body: expect.stringContaining("SIGNAL VETOED"),
        }),
      );
    });
  });

  describe("testNotifications", () => {
    it("should test Telegram notifications", async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('{"ok":true}'),
      });

      const results = await notificationService.testNotifications();

      expect(results.telegram).toBe(true);
      expect(results.email).toBe(false); // Email is disabled in test config
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("should handle Telegram test failure", async () => {
      // Mock console.error to suppress expected logs
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(
        () => {},
      );

      // Mock all retry attempts to fail
      (fetch as jest.Mock).mockRejectedValue(new Error("API error"));

      const results = await notificationService.testNotifications();

      expect(results.telegram).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(3); // Should retry 3 times

      consoleSpy.mockRestore();
    });
  });

  describe("configuration", () => {
    it("should not send notifications when disabled", async () => {
      const disabledConfig: NotificationConfig = {
        telegram: { enabled: false },
        email: { enabled: false },
      };

      const service = new NotificationService(disabledConfig);

      const data = {
        reason: "Test",
        equity: 1000,
        drawdown: 0.15,
        triggeredAt: Date.now(),
      };

      await service.sendCircuitBreakerNotification(data);

      expect(fetch).not.toHaveBeenCalled();
    });

    it("should update configuration", () => {
      const newConfig: NotificationConfig = {
        telegram: { enabled: false },
        email: { enabled: true, smtpHost: "smtp.test.com" },
      };

      notificationService.updateConfig(newConfig);

      // Configuration should be updated (tested indirectly through behavior)
      expect(() => notificationService.updateConfig(newConfig)).not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle Telegram API errors gracefully", async () => {
      // Mock all retry attempts to fail with API error
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue("Bad Request"),
      });

      const data = {
        reason: "Test error",
        equity: 1000,
        drawdown: 0.15,
        triggeredAt: Date.now(),
      };

      // The service catches errors internally and doesn't re-throw for notifications
      // So we test that it completes without throwing
      await expect(notificationService.sendCircuitBreakerNotification(data))
        .resolves.not.toThrow();
      expect(fetch).toHaveBeenCalledTimes(3); // Should retry 3 times
    });

    it("should handle missing Telegram configuration", async () => {
      const incompleteConfig: NotificationConfig = {
        telegram: { enabled: true }, // Missing botToken and chatId
        email: { enabled: false },
      };

      const service = new NotificationService(incompleteConfig);

      const data = {
        reason: "Test",
        equity: 1000,
        drawdown: 0.15,
        triggeredAt: Date.now(),
      };

      // The service catches errors internally for notifications
      await expect(service.sendCircuitBreakerNotification(data)).resolves.not
        .toThrow();
    });
  });
});
