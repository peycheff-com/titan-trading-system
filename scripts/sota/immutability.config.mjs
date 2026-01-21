import baseConfig from '../../eslint.config.mjs';
import functional from 'eslint-plugin-functional';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...baseConfig,
  {
    plugins: {
      functional,
    },
    rules: {
      // High-value Immutability Rules from SOTA standards
      
      // Prevent mutating changes to params/objects
      'functional/no-let': 'warn',
      'functional/immutable-data': ['warn', { ignoreAccessorPattern: ['**.current', '**.value'] }], // Allow refs
      'functional/no-loop-statements': 'off', // Too strict for existing legacy code, enable if desired
      'functional/prefer-readonly-type': 'off', // Very noisy on existing code
    }
  }
);
