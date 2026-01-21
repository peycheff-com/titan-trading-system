import baseConfig from '../../eslint.config.mjs';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  ...baseConfig,
  {
    plugins: {
      sonarjs,
    },
    rules: {
      // Set to 0 (off) for most things to speed up, but here we just append specific rules
      // We want to capture the complexity metrics.
      // 'complexity' rule in ESLint reports cyclomatic complexity.
      "complexity": ["warn", 1], 
      
      // 'sonarjs/cognitive-complexity' reports cognitive complexity.
      "sonarjs/cognitive-complexity": ["warn", 1],
    }
  }
];
