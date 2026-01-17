/**
 * Jest Configuration for Integration Tests
 * 
 * Separate configuration for integration tests that require external dependencies
 * like databases, Redis, and external APIs.
 */

// Configuration constants
const INTEGRATION_TEST_DIR = '<rootDir>/tests/integration';
const COVERAGE_DIR = 'coverage/integration';
const TEST_RESULTS_DIR = 'test-results/integration';

module.exports = {
  // Use modern ts-jest preset
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  
  // Test discovery
  roots: [INTEGRATION_TEST_DIR],
  testMatch: ['**/*.integration.test.ts'],
  
  // TypeScript configuration (modern approach)
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json', // Use test-specific tsconfig if available
      isolatedModules: true, // Faster compilation
      useESM: true,
    }]
  },
  
  // Module resolution
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Test setup
  setupFilesAfterEnv: [`${INTEGRATION_TEST_DIR}/setup.ts`],
  setupFiles: [`${INTEGRATION_TEST_DIR}/env.ts`],
  
  // Timeouts - more reasonable for integration tests
  testTimeout: 30000, // 30 seconds should be sufficient for most integration tests
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.mock.ts'
  ],
  
  // Coverage thresholds (realistic for integration tests)
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  
  // Coverage reporting
  coverageReporters: ['text-summary', 'lcov', 'html'],
  coverageDirectory: COVERAGE_DIR,
  
  // Test reporting
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: TEST_RESULTS_DIR,
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › '
    }]
  ],
  
  // Performance optimizations
  maxWorkers: process.env.CI ? 1 : 2, // Single worker in CI, 2 locally
  
  // Test execution
  runInBand: process.env.CI === 'true', // Sequential in CI for stability
  
  // Error handling
  detectOpenHandles: true,
  forceExit: false, // Let tests clean up properly
  
  // Retry configuration for flaky integration tests
  retry: process.env.CI ? 2 : 1,
  
  // Logging
  verbose: process.env.JEST_VERBOSE === 'true',
  silent: process.env.JEST_SILENT === 'true',
  
  // Cache configuration
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest-integration',
  
  // Module path mapping (if needed for shared infrastructure)
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../shared/src/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  }
};