module.exports = {
  // Multi-project configuration for better test organization
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      testTimeout: 5000, // Shorter timeout for unit tests
    },
    {
      displayName: 'integration', 
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.integration.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      globalSetup: '<rootDir>/tests/globalSetup.ts',
      globalTeardown: '<rootDir>/tests/globalTeardown.ts',
      testTimeout: 30000, // Longer timeout for integration tests
    },
    {
      displayName: 'property',
      preset: 'ts-jest', 
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/property/**/*.property.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      testTimeout: parseInt(process.env.PROPERTY_TEST_TIMEOUT) || 15000, // Configurable timeout for property tests
    },
    {
      displayName: 'console',
      preset: 'ts-jest',
      testEnvironment: 'node', // Changed from jsdom to node
      testMatch: ['<rootDir>/tests/console/**/*.test.ts', '<rootDir>/tests/console/**/*.test.tsx'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      testTimeout: 10000, // Medium timeout for UI tests
      moduleNameMapper: {
        // Additional mappings for React/Ink components
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
      }
    }
  ],
  
  // Global configuration (applies to all projects)
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  
  // Coverage configuration - more granular thresholds
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/*.types.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/console/**', // Exclude UI components from coverage requirements
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // More lenient thresholds for specific directories
    './src/engine/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './src/console/': {
      branches: 60, // UI components are harder to test
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  
  // Module resolution with better path mapping
  moduleNameMapper: {
    // Core path mappings
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    
    // Feature-specific mappings
    '^@console/(.*)$': '<rootDir>/src/console/$1',
    '^@engine/(.*)$': '<rootDir>/src/engine/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@exchanges/(.*)$': '<rootDir>/src/exchanges/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    
    // External dependency mocks
    'node-fetch': '<rootDir>/tests/__mocks__/node-fetch.js',
    '^ws$': '<rootDir>/tests/__mocks__/ws.js'
  },
  
  // Test execution settings - environment-aware configuration
  verbose: process.env.CI ? false : true, // Reduce noise in CI
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true, // Ensure clean state between tests
  
  // Performance optimizations
  cacheDirectory: '<rootDir>/.jest-cache',
  workerIdleMemoryLimit: process.env.CI ? '256MB' : '512MB', // Reduce memory in CI
  
  // Test path optimizations
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '/temp/',
    '/temp2/',
    '/temp3/',
    '/.jest-cache/'
  ],
  
  // Environment-specific configuration
  bail: process.env.CI ? 1 : 0, // Fail fast in CI
  detectOpenHandles: !process.env.CI, // Skip in CI to avoid flaky tests
  forceExit: false, // Let tests exit naturally to catch resource leaks
  maxWorkers: process.env.CI ? 2 : '50%',
  
  // Improved error reporting and notifications
  errorOnDeprecated: true,
  notify: false, // Disable notifications to avoid node-notifier dependency
  notifyMode: 'failure-change',
  
  // Transform configuration for TypeScript
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
      // Improve performance by skipping type checking in tests
      isolatedModules: true,
      // Use faster transpilation for tests
      useESM: false
    }]
  },
  
  // Transform ES modules in node_modules - more comprehensive list
  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill|chalk|ink)/)'
  ],
  
  // Global test configuration
  globals: {
    'ts-jest': {
      // Suppress TypeScript warnings in tests
      diagnostics: {
        warnOnly: true,
        exclude: ['**/*.d.ts']
      }
    }
  },
  
  // Test result processors for better reporting
  reporters: process.env.CI 
    ? [['default', { silent: true }], 'jest-junit']
    : ['default'],
    
  // Setup for different test environments
  setupFiles: ['<rootDir>/tests/jest.setup.js'],
  
  // Additional Jest configuration for better reliability
  testSequencer: '@jest/test-sequencer', // Default sequencer for consistent ordering
  
  // Watchman configuration for better file watching
  watchman: true,
  
  // Snapshot configuration
  updateSnapshot: process.env.UPDATE_SNAPSHOTS === 'true'
};