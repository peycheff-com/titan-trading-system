import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const prettierPlugin = require("eslint-plugin-prettier");
const prettierConfig = require("eslint-config-prettier");

export default tseslint.config(
  {
    ignores: ["**/dist", "**/node_modules", "**/coverage", "**/.do", "**/docs"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      ...prettierConfig.rules,
    },
  }
);
