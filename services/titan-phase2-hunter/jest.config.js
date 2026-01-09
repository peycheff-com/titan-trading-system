module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test setup and teardown
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/globalTeardown.ts',
  
  // Test discovery
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.property.test.ts', 
    '**/*.integration.test.ts'
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/*.types.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    '^@console/(.*)$': '<rootDir>/src/console/$1',
    '^@engine/(.*)$': '<rootDir>/src/engine/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1'
  },
  
  // Test execution settings
  testTimeout: process.env.PROPERTY_TEST_TIMEOUT || 10000,
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
  
  // Performance optimizations
  cacheDirectory: '<rootDir>/.jest-cache',
  workerIdleMemoryLimit: '512MB',
  
  // Test path optimizations
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '/temp/',
    '/temp2/',
    '/temp3/'
  ],
  
  // Fail fast on first test failure in CI
  bail: process.env.CI ? 1 : 0,
  
  // Detect open handles in tests
  detectOpenHandles: true,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Maximum number of concurrent workers
  maxWorkers: process.env.CI ? 2 : '50%',
  
  // Transform configuration for TypeScript
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }]
  }
};