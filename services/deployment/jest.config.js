module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.integration.test.ts'
  ],
  
  collectCoverageFrom: [
    '<rootDir>/*.ts',
    '!<rootDir>/*.d.ts',
    '!<rootDir>/jest.config.js',
    '!<rootDir>/tests/**/*',
    '!<rootDir>/node_modules/**/*'
  ],
  
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  
  detectOpenHandles: true,
  forceExit: true,
  verbose: true
};