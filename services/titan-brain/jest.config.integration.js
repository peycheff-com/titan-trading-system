const baseConfig = require('./jest.config.js').default;

export default {
  ...baseConfig,
  testMatch: ['**/*.integration.test.ts'],
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/integration-setup.ts'],
  collectCoverage: false, // Skip coverage for integration tests
  maxWorkers: 1, // Run integration tests sequentially
};