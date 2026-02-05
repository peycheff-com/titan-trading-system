import fs from "fs";
import path from "path";

const RUNBOOKS_DIR = "docs/runbooks";
const REQUIRED_RUNBOOKS = [
    "nats_outage.md",
    "postgres_outage.md",
    "rollback.md",
    "exchange_outage.md",
];

function checkRunbooks() {
    console.log("📚 Verifying Runbook Coverage...");

    if (!fs.existsSync(RUNBOOKS_DIR)) {
        console.error(`❌ Runbooks directory not found: ${RUNBOOKS_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(RUNBOOKS_DIR);
    const missing = REQUIRED_RUNBOOKS.filter((rb) => !files.includes(rb));

    if (missing.length > 0) {
        console.error(`❌ Missing critical runbooks: ${missing.join(", ")}`);
        process.exit(1);
    }

    console.log("✅ All required runbooks exist.");
}

checkRunbooks();
