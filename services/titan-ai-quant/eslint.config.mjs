import js from "@eslint/js";
import functional from "eslint-plugin-functional";
import tseslint from "typescript-eslint";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const prettierPlugin = require("eslint-plugin-prettier");
const prettierConfig = require("eslint-config-prettier");

export default tseslint.config(
  {
    ignores: ["**/dist", "**/node_modules", "**/coverage", "**/.do", "**/docs"],
  },
  {
    files: ["eslint.config.mjs"],
    languageOptions: {
      parserOptions: {
        project: null,
      },
    },
  },
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      prettier: prettierPlugin,
      functional,
    },
    rules: {
      "prettier/prettier": "warn",
      "functional/no-let": "error",
      "functional/immutable-data": ["error", { ignoreAccessorPattern: ["**.current", "**.value"] }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      ...prettierConfig.rules,
    },
  }
);
