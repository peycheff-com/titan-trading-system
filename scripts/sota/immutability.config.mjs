import functional from 'eslint-plugin-functional';
import tseslint from 'typescript-eslint';
import baseConfig from '../../eslint.config.mjs';

/**
 * SOTA Immutability Check — Functional Rules Only
 *
 * This overlay enforces functional/immutable patterns.
 * Base-config rules (prettier, no-explicit-any, no-unused-vars) are
 * disabled here because they are enforced by `npm run lint` separately.
 *
 * Warnings from this config must reach ZERO for SOTA compliance.
 */
export default tseslint.config(
  ...baseConfig,
  {
    ignores: [
      "**/*.d.ts",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/tests/**",
      "**/dist/**",
      "**/node_modules/**",
      "apps/titan-console/**",      // React frontend — separate lint config
      "apps/titan-harness/**",      // Test harness — separate lint config
      "services/titan-ai-quant/**", // AI service — parser compatibility issues
    ],
  },
  {
    plugins: {
      functional,
    },
    rules: {
      // ── Functional rules (the purpose of this check) ──
      'functional/no-let': 'warn',
      'functional/immutable-data': ['warn', { ignoreAccessorPattern: ['**.current', '**.value'] }],
      'functional/no-loop-statements': 'off',
      'functional/prefer-readonly-type': 'off',

      // ── Silence base-config rules (enforced by `npm run lint`) ──
      'prettier/prettier': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-async-promise-executor': 'off',
    }
  }
);
