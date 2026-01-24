export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/*.test.ts',
    '!**/*.integration.test.ts',  // Run unit tests by default
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Timeout for property-based tests
  testTimeout: 30000,
  
  // Force exit after tests complete (handles async cleanup issues)
  forceExit: true,
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',  // Exclude barrel exports
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  coverageDirectory: '<rootDir>/coverage',
  
  // TypeScript configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.test.json'
    }],
  },
  
  // Module resolution
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1',  // Path alias for cleaner imports
    '^@titan/shared$': '<rootDir>/../shared/src/index.ts',
  },
  
  // Test setup
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // CI/CD optimization
  verbose: process.env.CI === 'true',
  collectCoverage: process.env.CI === 'true',
};
