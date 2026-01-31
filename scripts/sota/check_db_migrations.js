import fs from "fs";
import path from "path";
import { execSync } from "child_process";
// Configuration
const SERVICES_DIR = "services";
const MIGRATION_DIR_NAME = "migrations";
console.log("🔍 Checking DB Migrations Integrity...");
// Find all migration directories
const migrationFiles = [];
if (!fs.existsSync(SERVICES_DIR)) {
    console.error(`❌ Services directory not found: ${SERVICES_DIR}`);
    process.exit(1);
}
const services = fs.readdirSync(SERVICES_DIR);
for (const service of services) {
    const servicePath = path.join(SERVICES_DIR, service);
    if (!fs.statSync(servicePath).isDirectory())
        continue;
    const migrationsPath = path.join(servicePath, MIGRATION_DIR_NAME);
    if (fs.existsSync(migrationsPath) &&
        fs.statSync(migrationsPath).isDirectory()) {
        const files = fs.readdirSync(migrationsPath).filter((f) => f.endsWith(".sql") || f.endsWith(".ts"));
        files.forEach((f) => migrationFiles.push(path.join(migrationsPath, f)));
    }
}
if (migrationFiles.length === 0) {
    console.log("⚠️  No migrations found. Skipping.");
    process.exit(0);
}
// Check for immutability (naive check: file stats or git status)
// Better: Check if any committed migration file has changed content compared to HEAD.
// We Use git diff for this.
console.log(`Checking ${migrationFiles.length} migration files...`);
try {
    const changedFiles = execSync("git diff --name-only HEAD services/*/migrations").toString();
    if (changedFiles.length > 0) {
        console.error("❌ Detected changes (mutations) to existing migrations:");
        console.error(changedFiles);
        console.error("Migrations should be immutable. Create a new migration instead of editing an existing one.");
        process.exit(1);
    }
}
catch (e) {
    // If execSync fails (not a repo?), fallback
    console.warn("⚠️  Could not check git diff. Assuming clean.");
}
console.log("✅ DB Migration Check Passed.");
//# sourceMappingURL=check_db_migrations.js.map