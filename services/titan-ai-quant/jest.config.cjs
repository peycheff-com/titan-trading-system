// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = 'test-api-key';

module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.property.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    // Excluded per best practices - require integration testing
    '!src/server.ts',
    '!src/debug-*.ts',
    '!src/cron/**',
    '!src/messaging/**',
    // Require external services (Weaviate, DB, etc.)
    '!src/ai/VectorMemory.ts',
    '!src/ai/EnhancedAIIntegration.ts',
    '!src/ai/TitanAnalyst.ts',
    '!src/ai/GeminiClient.ts', // Gemini API integration
    '!src/ai/PredictiveAnalytics.ts', // Complex analytics
    '!src/ai/RealTimeOptimizer.ts', // Real-time orchestration
    '!src/simulation/DataLoader.ts',
    '!src/pipeline/WalkForwardValidator.ts',
    '!src/cron/NightlyOptimize.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 68,
      functions: 82,
      lines: 80,
      statements: 80
    }
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'NodeNext',
        },
      },
    ],
  },
  // setupFilesAfterEnv removed
};
