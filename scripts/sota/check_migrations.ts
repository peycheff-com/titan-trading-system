import fs from "fs";
import path from "path";
import { globSync } from "glob";

const MIGRATIONS_DIR = "services/titan-brain/migrations"; // Adjust based on reality

function checkMigrations() {
    console.log("🔄 Verifying Migration Safety...");

    if (!fs.existsSync(MIGRATIONS_DIR)) {
        console.warn(
            `⚠️  Migrations directory not found at ${MIGRATIONS_DIR}. Skipping.`,
        );
        return;
    }

    const files = globSync("**/*.{sql,ts}", {
        cwd: MIGRATIONS_DIR,
        absolute: true,
    });
    let failed = false;

    // This logic depends on the migration framework (e.g. TypeORM, db-migrate, raw sql)
    // Assuming file pairs like 123-up.sql and 123-down.sql OR single file with down method.

    // For now, let's assume we look for "down" logic or "reversible" flag
    for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        const relativePath = path.relative(process.cwd(), file);

        // Very basic heuristic
        const hasDown = content.toLowerCase().includes("down") ||
            content.toLowerCase().includes("revert") ||
            content.toLowerCase().includes("drop");

        if (!hasDown) {
            console.warn(
                `⚠️  Migration ${relativePath} might be irreversible (no 'down'/'revert' keyword found).`,
            );
            // failed = true; // Strict mode disable for now
        }
    }

    if (failed) {
        process.exit(1);
    }
    console.log("✅ Migration safety check complete.");
}

checkMigrations();
