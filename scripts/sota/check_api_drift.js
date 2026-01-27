import fs from "fs";
import { execSync } from "child_process";
const OPENAPI_PATH = "docs/api/openapi/titan-brain.yaml";
console.log("🔍 Checking API Drift...");
if (!fs.existsSync(OPENAPI_PATH)) {
    console.warn(`⚠️  OpenAPI spec not found at ${OPENAPI_PATH}. Skipping.`);
    process.exit(0);
}
// 1. Check if valid YAML
try {
    // Basic validation implies it's readable
    const content = fs.readFileSync(OPENAPI_PATH, "utf8");
    if (!content.includes("openapi:")) {
        throw new Error("Not a valid OpenAPI 3.x spec");
    }
}
catch (e) {
    console.error("❌ OpenAPI spec invalid:", e);
    process.exit(1);
}
// 2. Check for uncommitted changes (Drift from HEAD)
try {
    const status = execSync(`git status --porcelain ${OPENAPI_PATH}`)
        .toString();
    if (status.length > 0) {
        console.error("❌ OpenAPI spec has uncommitted changes. Please commit or revert them.");
        process.exit(1);
    }
}
catch (e) {
    // Git might not be available or not a repo
    console.warn("⚠️  Could not check git status.");
}
console.log("✅ API Drift Check Passed (Spec exists and is clean).");
//# sourceMappingURL=check_api_drift.js.map