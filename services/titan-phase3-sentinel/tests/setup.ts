/**
 * Jest Test Setup for Titan Phase 3 - The Sentinel
 * 
 * This file runs before each test file and sets up the testing environment.
 */

// Increase timeout for property-based tests
jest.setTimeout(30000);

// Mock console methods to reduce noise during tests
const originalConsole = { ...console };

beforeAll(() => {
  // Suppress console output during tests unless DEBUG is set
  if (!process.env.DEBUG) {
    console.log = jest.fn();
    console.info = jest.fn();
    console.debug = jest.fn();
  }
});

afterAll(() => {
  // Restore console
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
});

// Global test utilities
declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        randomPrice: (min?: number, max?: number) => number;
        randomBasis: (min?: number, max?: number) => number;
        randomSize: (min?: number, max?: number) => number;
      };
    }
  }
}

// Add test utilities
(global as any).testUtils = {
  randomPrice: (min = 10000, max = 100000) => 
    Math.random() * (max - min) + min,
  randomBasis: (min = -0.05, max = 0.05) => 
    Math.random() * (max - min) + min,
  randomSize: (min = 0.001, max = 10) => 
    Math.random() * (max - min) + min,
};

export {};
