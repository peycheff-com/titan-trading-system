/**
 * Integration Test Setup
 *
 * Global setup and configuration for integration tests
 */

import { Logger } from "../../src/logging/Logger";
import * as net from "net";

// Global test timeout
jest.setTimeout(60000);

// Global test setup
beforeAll(async () => {
  // Suppress console output during tests unless explicitly enabled
  if (!process.env.TEST_VERBOSE) {
    const originalConsole = console;
    global.console = {
      ...originalConsole,
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
  }

  // Set test environment
  process.env.NODE_ENV = "test";

  console.log("Integration test setup completed");
});

// Global test teardown
afterAll(async () => {
  console.log("Integration test teardown completed");
});

// Global error handler
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

// Test utilities
export const testUtils = {
  /**
   * Wait for a condition to be true
   */
  async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeoutMs: number = 5000,
    intervalMs: number = 100,
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await condition()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Condition not met within ${timeoutMs}ms`);
  },

  /**
   * Create a test logger with minimal output
   */
  createTestLogger(): Logger {
    return new Logger({
      level: "error", // Only log errors during tests
      format: "json",
      enableConsole: false,
      enableFile: false,
    });
  },

  /**
   * Generate a random test identifier
   */
  generateTestId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Check if external service is available
   */
  async isServiceAvailable(host: string, port: number): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);

        socket.on("connect", () => {
          socket.destroy();
          resolve(true);
        });

        socket.on("timeout", () => {
          socket.destroy();
          resolve(false);
        });

        socket.on("error", () => {
          resolve(false);
        });

        socket.connect(port, host);
      });
    } catch {
      return false;
    }
  },
};
