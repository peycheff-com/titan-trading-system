module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts', '<rootDir>/tests/unit/**/*.test.tsx'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          isolatedModules: true,
          tsconfig: {
            module: 'commonjs'
          }
        }]
      },
      resolver: '<rootDir>/resolver.cjs',
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.integration.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          isolatedModules: true,
          tsconfig: {
            module: 'commonjs'
          }
        }]
      },
      resolver: '<rootDir>/resolver.cjs',
    },
    {
      displayName: 'property',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/property/**/*.property.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          isolatedModules: true,
          tsconfig: {
            module: 'commonjs'
          }
        }]
      },
      resolver: '<rootDir>/resolver.cjs',
    },
  ],

  roots: ['<rootDir>/src', '<rootDir>/tests'],

  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/*.types.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@engine/(.*)$': '<rootDir>/src/engine/$1',
    '^@execution/(.*)$': '<rootDir>/src/execution/$1',
    '^@portfolio/(.*)$': '<rootDir>/src/portfolio/$1',
    '^@exchanges/(.*)$': '<rootDir>/src/exchanges/$1',
    '^@console/(.*)$': '<rootDir>/src/console/$1',
    '^ink-testing-library$': '<rootDir>/tests/mocks/ink-testing-library.ts',
  },

  verbose: true,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,

  cacheDirectory: '<rootDir>/.jest-cache',

  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
  ],

  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill|chalk|ink|ink-testing-library|ethers|viem|fast-check)/)',
  ],
};
