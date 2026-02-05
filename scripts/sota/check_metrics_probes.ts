import fs from "fs";
import path from "path";
import { globSync } from "glob";

// We look for usage of prom-client or similar
const METRICS_PATTERN = "services/*/src/**/*.{ts,rs}";

const REQUIRED_METRICS = [
    "event_lag",
    "http_request_duration_seconds",
    "error_count", // or error_rate
];

function checkMetricsProbes() {
    console.log("📊 Verifying Observability Probes...");

    const files = globSync(METRICS_PATTERN, {
        cwd: process.cwd(),
        absolute: true,
        ignore: ["**/node_modules/**", "**/*.d.ts", "**/*.test.ts"],
    });

    const foundMetrics = new Set<string>();

    for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");

        REQUIRED_METRICS.forEach((metric) => {
            if (content.includes(metric)) {
                foundMetrics.add(metric);
            }
        });
    }

    const missing = REQUIRED_METRICS.filter((m) => !foundMetrics.has(m));

    if (missing.length > 0) {
        console.error(
            `❌ Missing required metrics in codebase: ${missing.join(", ")}`,
        );
        // process.exit(1); // Strict mode
    } else {
        console.log("✅ All required metrics found in codebase.");
    }
}

checkMetricsProbes();
