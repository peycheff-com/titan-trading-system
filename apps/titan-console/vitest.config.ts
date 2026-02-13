import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugins: [react() as any],
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
        setupFiles: path.resolve(__dirname, "./src/test/setup.ts"),
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
