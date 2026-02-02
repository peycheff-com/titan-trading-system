import fs from "fs";
import path from "path";
import { glob } from "glob";

const ROOT_DIR = process.cwd();

const FORBIDDEN_TERMS = [
    {
        term: "npm run titan:halt",
        replacement: "nats pub titan.cmd.sys.halt.v1",
    },
];

const allowedDirs = [
    "tutorials",
    "how-to",
    "reference",
    "explanation",
    "canonical",
    "security",
    "runbooks",
    "api",
];

async function checkTruth() {
    console.log("🔍 Checking for forbidden terms and legacy drift...");

    const files = await glob("docs/**/*.md", {
        cwd: ROOT_DIR,
        ignore: "**/node_modules/**",
    });
    let errorCount = 0;

    const allowedDirs = [
        "tutorials",
        "how-to",
        "reference",
        "explanation",
        "canonical",
        "runbooks",
        "security",
        "adr",
        "api",
        "setup",
        "templates",
        "audit",
        "architecture",
        "launch",
        "operations",
    ];

    for (const file of files) {
        // Skip archive, change logs, and audit reports
        if (
            file.includes("_archive") || file.includes("CHANGELOG") ||
            file.includes("DOCS_AUDIT_REPORT")
        ) continue;

        const filePath = path.join(ROOT_DIR, file);
        const content = fs.readFileSync(filePath, "utf-8");

        for (const { term, replacement } of FORBIDDEN_TERMS) {
            if (content.includes(term)) {
                console.error(`❌ Forbidden term found in ${file}:`);
                console.error(`   Term: "${term}"`);
                console.error(`   Use instead: "${replacement}"`);
                errorCount++;
            }
        }

        // Check for absolute local paths
        if (content.includes("file:///Users/")) {
            console.error(
                `❌ Absolute local path found in ${file}. Use relative paths.`,
            );
            errorCount++;
        }

        // Check if file is in an allowed directory or is a root file
        const relPath = path.relative(path.join(ROOT_DIR, "docs"), filePath);
        const topLevelDir = relPath.split(path.sep)[0];

        // Allow root files like START_HERE.md
        if (
            relPath.includes(path.sep) && !allowedDirs.includes(topLevelDir) &&
            !file.includes("_archive")
        ) {
            // console.warn(`⚠️ Warning: File ${file} is in non-standard directory "${topLevelDir}". Consider moving.`);
            // Not failing yet to avoid breaking legacy setup
        }
    }

    if (errorCount > 0) {
        console.error(`\nFound ${errorCount} truth violations.`);
        process.exit(1);
    } else {
        console.log("✅ Documentation truth verified.");
    }
}

checkTruth().catch(console.error);
