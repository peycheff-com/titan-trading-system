import js from "@eslint/js";
import functional from "eslint-plugin-functional";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "node_modules", "**/*.d.ts", "dist_tests"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["*.config.js", "*.config.mjs", "jest.config.js", "eslint.config.mjs"],
    languageOptions: {
        globals: globals.node,
        ecmaVersion: 2022,
        parserOptions: {
            project: false,
            tsconfigRootDir: import.meta.dirname,
        },
    },
    rules: {
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/no-explicit-any": "off",
    }
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: {
        project: ["./tsconfig.json", "./tests/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      functional,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // Relaxing strict functional rules for existing phase1 codebase
      "functional/no-let": "off",
      "functional/immutable-data": "off",
      "functional/no-loop-statements": "off",
      "functional/no-conditional-statements": "off",
      "functional/no-expression-statements": "off",
      "functional/no-return-void": "off",
      "functional/no-throw-statements": "off",
      "functional/no-classes": "off",
      "functional/no-this-expressions": "off"
    },
  }
);
