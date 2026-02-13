import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
export default defineConfig({
    plugins: [react()],
    test: {
        // Prevent Playwright e2e specs from being executed by Vitest.
        exclude: [
            ...configDefaults.exclude,
            "e2e/**",
            "playwright-report/**",
            "test-results/**",
        ],
        globals: true,
        environment: "jsdom",
        setupFiles: "./src/test/setup.ts",
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
//# sourceMappingURL=vitest.config.js.map
