/** @type {import('jest').Config} */

const fs = require('fs');
const path = require('path');

// Validate that required directories exist
const requiredDirs = ['tests', 'src'];
requiredDirs.forEach(dir => {
  if (!fs.existsSync(path.join(__dirname, dir))) {
    console.warn(`Warning: Required directory '${dir}' does not exist`);
  }
});

// Common TypeScript transform configuration
const tsJestConfig = {
  tsconfig: {
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    module: 'commonjs'
  }
};

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test discovery
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: [
    '**/*.test.ts',
    '**/*.property.test.ts',
    '**/*.integration.test.ts'
  ],
  
  // File extensions
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  
  coverageThreshold: {
    global: {
      branches: 25,
      functions: 35,
      lines: 35,
      statements: 35
    }
  },
  
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'text-summary', 
    'lcov',
    'html'
  ],
  
  // Transform configuration for TypeScript
  transform: {
    '^.+\\.ts$': ['ts-jest', tsJestConfig]
  },
  
  // Transform ES modules - handle ESM dependencies
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|eventemitter3|node-fetch|ws)/)'
  ],
  
  // Module resolution
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  
  // Test setup
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Performance and CI optimizations
  verbose: process.env.CI === 'true',
  collectCoverage: process.env.CI === 'true',
  maxWorkers: process.env.CI ? 2 : '50%',
  bail: process.env.CI ? 1 : 0, // Stop on first failure in CI
  
  // Cache configuration
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
  
  // Error handling
  errorOnDeprecated: true,
  detectOpenHandles: true, // Detect async operations that prevent Jest from exiting
  forceExit: false, // Don't force exit - fix the underlying issues instead
  
  // Better error reporting
  reporters: [
    'default',
    ...(process.env.CI ? (() => {
      try {
        require.resolve('jest-junit');
        return [['jest-junit', { outputDirectory: 'coverage', outputName: 'junit.xml' }]];
      } catch {
        console.warn('jest-junit not found, skipping JUnit reporter');
        return [];
      }
    })() : [])
  ],
  
  // Test timeout for async operations (property tests may need more time)
  testTimeout: 30000,
  
  // Custom test runners for different test types
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', tsJestConfig]
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
    },
    {
      displayName: 'property',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/property/**/*.property.test.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', tsJestConfig]
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.integration.test.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', tsJestConfig]
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
    }
  ]
};