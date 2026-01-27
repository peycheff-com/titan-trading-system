import js from "@eslint/js";
import tseslint from "typescript-eslint";

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const prettierPlugin = require("eslint-plugin-prettier");
const prettierConfig = require("eslint-config-prettier");
const functionalPluginRaw = require("eslint-plugin-functional");
const functionalPlugin = functionalPluginRaw.default || functionalPluginRaw;

export default tseslint.config(
  {
    ignores: ["**/dist", "**/node_modules", "**/coverage", "**/.do", "**/docs"],
  },

  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./services/*/tsconfig.json", "./services/*/tsconfig.app.json", "./services/*/tsconfig.node.json"],
        tsconfigRootDir: __dirname,
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      prettier: prettierPlugin,
      functional: functionalPlugin,

    },
    rules: {
      "prettier/prettier": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      
      // Functional Immutability Rules
      "functional/no-let": "error",
      "functional/immutable-data": ["error", { ignoreAccessorPattern: ["**.current", "**.value"] }],
      
      ...prettierConfig.rules,
    },
  },
  {
    files: ['ecosystem.config.js'],
    languageOptions: {
      globals: {
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
      },
      parserOptions: {
        project: null,
      },
    },
  }
);
