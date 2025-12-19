/**
 * Jest Test Setup for Titan Brain
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };

beforeAll(() => {
  // Suppress console output during tests unless DEBUG is set
  if (!process.env.DEBUG) {
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    // Keep console.error for debugging
  }
});

afterAll(() => {
  // Restore console
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
});

// Global test utilities
export const testUtils = {
  /**
   * Wait for a specified duration
   */
  wait: (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Generate a random signal ID
   */
  randomSignalId: (): string =>
    `sig_${Date.now()}_${Math.random().toString(36).substring(7)}`,

  /**
   * Generate a random equity value within a range
   */
  randomEquity: (min: number = 200, max: number = 100000): number =>
    Math.random() * (max - min) + min,
};
