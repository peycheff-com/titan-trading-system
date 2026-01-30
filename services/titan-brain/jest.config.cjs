const isCI = process.env.CI === 'true';
const isDevelopment = process.env.NODE_ENV === 'development';

module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  testMatch: [
    '**/*.test.ts',
    '**/*.property.test.ts',
    '!**/*.integration.test.ts',
  ],
  
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    // Integration-heavy modules (require DB, external services)
    '!src/server/**',
    '!src/db/**',
    '!src/persistence/**',
    '!src/middleware/**',
    '!src/reconciliation/**',
    '!src/features/Risk/**',
    '!src/features/Allocation/**',
    '!src/features/Governance/**',
    '!src/services/**',
    // Engine modules with complex dependencies
    '!src/engine/TitanBrain.ts',
    '!src/engine/PositionManager.ts',
    '!src/engine/TradeGate.ts',
    '!src/engine/RecoveryManager.ts',
    '!src/engine/ScavengerValidator.ts',
    '!src/engine/TailRiskCalculator.ts',
    '!src/engine/HedgeIntegrityMonitor.ts',
    '!src/engine/ConfigLoader.ts',
    '!src/engine/StructuredLogger.ts',
    '!src/engine/BrainStateManager.ts',
    '!src/engine/logic.ts',
    '!src/engine/BudgetService.ts',
  ],
  
  coverageThreshold: {
    global: {
      branches: 58,
      functions: 75,
      lines: 80,
      statements: 80,
    },
  },
  
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: isCI ? ['text', 'lcov'] : ['text'],
  
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
      useESM: true,
    }],
  },
  
  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch|chalk|fastify|@fastify)/)'
  ],
  
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(.*/monitoring/index)(\\.js)?$': '<rootDir>/tests/mocks/monitoring.ts',
    // '^(.*/db/DatabaseManager)(\\.js)?$': '<rootDir>/tests/mocks/DatabaseManager.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Performance optimizations
  maxWorkers: isCI ? 2 : '50%',
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Timeout settings for trading system tests
  testTimeout: 10000, // 10 seconds for async operations
  
  // Environment-based settings
  verbose: isCI || isDevelopment,
  collectCoverage: isCI,
  
  // Error handling
  bail: isCI ? 1 : 0, // Stop on first failure in CI
  errorOnDeprecated: true,
};
