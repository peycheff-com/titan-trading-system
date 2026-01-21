module.exports = {
  forbidden: [
    {
      name: 'no-cross-service-relative-imports',
      severity: 'error',
      comment: 'Services must not import code from other services directly. Use @titan/shared.',
      from: {
        path: '^services/([^/]+)/src'
      },
      to: {
        path: '^services/([^/]+)/src',
        // If the captured group in 'to' is different from 'from', it's a cross-service import.
        // But dependency-cruiser regex is simpler.
        // We use a constraint: if strict match services/X -> services/Y
        pathNot: ['^services/$1/src', '^services/shared/src', '^services/schemas']
      }
    },
    {
      name: 'no-circular',
      severity: 'warn', // We already have madge, but good to double check
      from: {},
      to: {
        circular: true
      }
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    progress: { type: 'performance-log' }
  },
};
