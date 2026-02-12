/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
      isolatedModules: true
    }]
  },
  moduleNameMapper: {
    '^@titan/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^../src/(.*)\\.js$': '<rootDir>/src/$1', // Map ../src/*.js -> src/*
    '^(\\.{1,2}/.*)\\.js$': '$1', // Map relative .js -> no extension
    '^../src/(.*)$': '<rootDir>/src/$1'
  }
};
