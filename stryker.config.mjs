/**
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
    _comment: "SOTA Mutation Testing Config",
    packageManager: "npm",
    reporters: ["html", "clear-text", "progress"],
    testRunner: "jest",
    testRunnerNodeArgs: ["--experimental-vm-modules"],
    coverageAnalysis: "perTest",
    tsconfigFile: "tsconfig.json",
    mutate: [
        "services/*/src/**/*.ts",
        "!services/*/src/**/*.test.ts",
        "!services/*/src/**/index.ts",
        "!**/*.d.ts"
    ],
    // Low threshold to start with for an existing codebase
    thresholds: { high: 80, low: 60, break: 50 },
    
    // We limit concurrency to avoid OOM on the monorepo
    concurrency: 2,
    
    // Timeout factor for slow tests
    timeoutMS: 10000,
    timeoutFactor: 2.5,
    
    jest: {
        projectType: 'custom',
        configFile: 'jest.config.js', // We'll need to make sure a root jest config exists or point to service specific
        enableFindRelatedTests: true,
    }
  };
