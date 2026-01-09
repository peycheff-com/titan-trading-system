/**
 * Jest Global Setup
 * 
 * This file runs before all tests and sets up global configuration
 * for the Titan Phase 2 Hunter test suite.
 */

// Extend Jest matchers with jest-extended
import 'jest-extended';

// Set up global test timeout based on test type
const testTimeout = (() => {
  const testFile = expect.getState().testPath || '';
  
  if (testFile.includes('property.test')) {
    return parseInt(process.env.PROPERTY_TEST_TIMEOUT) || 15000;
  }
  
  if (testFile.includes('integration.test')) {
    return 30000;
  }
  
  return 5000; // Default for unit tests
})();

jest.setTimeout(testTimeout);

// Global test configuration
global.console = {
  ...console,
  // Suppress console.log in tests unless explicitly enabled
  log: process.env.JEST_VERBOSE ? console.log : jest.fn(),
  debug: process.env.JEST_VERBOSE ? console.debug : jest.fn(),
  info: process.env.JEST_VERBOSE ? console.info : jest.fn(),
  warn: console.warn, // Always show warnings
  error: console.error, // Always show errors
};

// Mock WebSocket globally to prevent connection attempts in tests
global.WebSocket = jest.fn().mockImplementation(() => ({
  close: jest.fn(),
  send: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  readyState: 1, // OPEN
}));

// Mock fetch globally for consistent behavior
global.fetch = jest.fn();

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.TITAN_MASTER_PASSWORD = 'test-password';

// Increase the default timeout for async operations in tests
const originalSetTimeout = global.setTimeout;
global.setTimeout = (fn, delay) => {
  // Cap delays in tests to prevent slow tests
  const cappedDelay = Math.min(delay || 0, 1000);
  return originalSetTimeout(fn, cappedDelay);
};