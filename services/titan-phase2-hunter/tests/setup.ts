/**
 * Jest setup file for Titan Phase 2 Hunter tests
 * Runs after the test framework is set up but before each test file
 */

// Extend Jest matchers for better assertions
import 'jest-extended';

// Mock console methods to reduce noise in tests (but keep errors for debugging)
const originalConsole = global.console;
global.console = {
  ...console,
  // Keep error and warn for debugging critical issues
  error: process.env.DEBUG_TESTS ? originalConsole.error : jest.fn(),
  warn: process.env.DEBUG_TESTS ? originalConsole.warn : jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
};

// Mock WebSocket for tests
global.WebSocket = jest.fn().mockImplementation(() => ({
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  readyState: 1, // OPEN
}));

// Mock fetch for API calls
global.fetch = jest.fn();

// Set default test timeout for property-based tests
jest.setTimeout(10000);

// Mock crypto for HMAC signatures in tests
jest.mock('crypto', () => ({
  createHmac: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('mocked-signature'),
  }),
  randomBytes: jest.fn().mockReturnValue(Buffer.from('mocked-random-16-bytes')),
  pbkdf2Sync: jest.fn().mockReturnValue(Buffer.from('mocked-derived-key-32-bytes-long')),
  createCipheriv: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnValue(Buffer.from('encrypted-data')),
    final: jest.fn().mockReturnValue(Buffer.from('final-encrypted')),
  }),
  createDecipheriv: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnValue(Buffer.from('decrypted-data')),
    final: jest.fn().mockReturnValue(Buffer.from('final-decrypted')),
  }),
}));

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.BINANCE_API_KEY = 'test-binance-key';
process.env.BINANCE_API_SECRET = 'test-binance-secret';
process.env.BYBIT_API_KEY = 'test-bybit-key';
process.env.BYBIT_API_SECRET = 'test-bybit-secret';

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
      toBeValidHologramState(): R;
      toBeValidSignal(): R;
    }
  }
}

// Custom matchers for trading system tests
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },

  toBeValidHologramState(received: any) {
    const requiredFields = ['dailyBias', 'fourHourLocation', 'fifteenMinTrigger', 'alignmentScore'];
    const hasAllFields = requiredFields.every(field => received.hasOwnProperty(field));
    const validScore = received.alignmentScore >= 0 && received.alignmentScore <= 100;
    
    const pass = hasAllFields && validScore;
    if (pass) {
      return {
        message: () => `expected ${JSON.stringify(received)} not to be a valid hologram state`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${JSON.stringify(received)} to be a valid hologram state`,
        pass: false,
      };
    }
  },

  toBeValidSignal(received: any) {
    const requiredFields = ['symbol', 'side', 'confidence', 'entry', 'stopLoss', 'takeProfit'];
    const hasAllFields = requiredFields.every(field => received.hasOwnProperty(field));
    const validSide = ['Buy', 'Sell'].includes(received.side);
    const validConfidence = received.confidence >= 0 && received.confidence <= 100;
    
    const pass = hasAllFields && validSide && validConfidence;
    if (pass) {
      return {
        message: () => `expected ${JSON.stringify(received)} not to be a valid signal`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${JSON.stringify(received)} to be a valid signal`,
        pass: false,
      };
    }
  },
});