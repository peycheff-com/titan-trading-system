import fs from "fs";
import path from "path";
import { globSync } from "glob";

// Configuration
const SERVICES_ROOT = "services";
const INGRESS_PATTERNS = [
    "**/src/routes/**/*.ts", // HTTP Routes
    "**/src/server/NatsConsumer.ts", // NATS Consumers
    "**/src/controllers/**/*.ts", // Controllers
];

// Validation signatures we look for
const VALIDATION_SIGNATURES = [
    ".parse(",
    ".safeParse(",
    "validate(",
    "z.object(",
    "schema.parse",
    "Validator.",
    "ajv.validate",
];

interface Violation {
    file: string;
    reason: string;
}

function checkEdgeValidation() {
    console.log("🛡️  Running Edge Validation Check...");

    const files = globSync(INGRESS_PATTERNS, {
        cwd: SERVICES_ROOT,
        absolute: true,
        ignore: ["**/*.spec.ts", "**/*.test.ts", "**/_test/**"],
    });

    const violations: Violation[] = [];

    for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        const relativePath = path.relative(process.cwd(), file);

        // Skip if file seems to be just an export barrel or empty
        if (content.length < 50 || !content.includes("export")) {
            continue;
        }

        const hasValidation = VALIDATION_SIGNATURES.some((sig) =>
            content.includes(sig)
        );

        if (!hasValidation) {
            // Heuristic: Check if it's actually an endpoint handler
            if (
                content.includes("req:") || content.includes("request:") ||
                content.includes("msg:") || content.includes("payload:")
            ) {
                violations.push({
                    file: relativePath,
                    reason:
                        "No explicit validation signature found (looked for .parse, .safeParse, etc)",
                });
            }
        }
    }

    if (violations.length > 0) {
        console.error(
            `❌ Found ${violations.length} files with missing edge validation:`,
        );
        violations.forEach((v) => console.error(`  - ${v.file}: ${v.reason}`));
        process.exit(1);
    } else {
        console.log("✅ All ingress points appear to have validation logic.");
    }
}

checkEdgeValidation();
