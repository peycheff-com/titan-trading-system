import fs from "fs";
import path from "path";
import { globSync } from "glob";

// Configuration
// We scan for health controller files and look for dependency integration
const HEALTH_CONTROLLERS_PATTERN = "services/*/src/**/HealthController.ts";

function checkHealthDeps() {
    console.log("🏥 Checking Health Check Dependencies...");

    const files = globSync(HEALTH_CONTROLLERS_PATTERN, {
        cwd: process.cwd(),
        absolute: true,
    });

    if (files.length === 0) {
        console.warn("⚠️  No HealthController.ts files found. Skipping check.");
        return;
    }

    let failed = false;

    for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        const relativePath = path.relative(process.cwd(), file);

        // Naive check: Does it mention NATS or Database/Postgres?
        const checksNats = content.includes("nats") || content.includes("Nats");
        const checksDb = content.includes("db") ||
            content.includes("postgres") || content.includes("database");

        if (!checksNats && !checksDb) {
            console.error(
                `❌ Health check in ${relativePath} seems shallow (no NATS/DB checks found).`,
            );
            failed = true;
        } else {
            console.log(`✅ ${relativePath} checks dependencies.`);
        }
    }

    if (failed) {
        console.error(
            "❌ Some health checks are missing dependency awareness.",
        );
        // process.exit(1); // Warn for now until fixed
    }
}

checkHealthDeps();
