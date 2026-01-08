module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test discovery
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/*.test.ts',
    '**/*.property.test.ts', 
    '**/*.integration.test.ts'
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/console/**/*.tsx',
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
    '^@tests/(.*)$': '<rootDir>/tests/$1'
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
  
  // ES Modules support for node-fetch v3 and chalk v5
  extensionsToTreatAsEsm: ['.ts'],
  
  // Transform ES modules in node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch|fetch-blob|data-uri-to-buffer|formdata-polyfill|web-streams-polyfill|chalk)/)'
  ],
  
  // Transform configuration for better TypeScript support
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
      useESM: true,
      // Enable diagnostics in development, disable in CI for performance
      diagnostics: process.env.CI ? false : {
        warnOnly: true,
        exclude: ['**/*.test.ts', '**/*.spec.ts']
      },
      // Enable incremental compilation for faster rebuilds
      incremental: true,
      // Disable source map support in CI for performance
      disableSourceMapSupport: process.env.CI ? true : false
    }]
  },
  
  // Setup files for enhanced testing
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};