import * as fs from "fs";
import * as path from "path";

// Budget in bytes
const BUDGETS: Record<string, number> = {
    // 5MB for brain bundle (it's a backend service/monolith mostly, but good to track)
    "services/titan-brain/dist/index.js": 5 * 1024 * 1024,
    // 10MB for console (React app)
    "services/titan-console/dist/index.html": 10 * 1024 * 1024,
};

console.log("⚖️  Checking Bundle Sizes...");

let failed = false;

function getFileSize(filePath: string): number {
    try {
        const stats = fs.statSync(filePath);
        return stats.size;
    } catch (e) {
        return -1;
    }
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

Object.entries(BUDGETS).forEach(([file, limit]) => {
    const size = getFileSize(file);
    if (size === -1) {
        console.warn(`⚠️  File not found (skip): ${file}`);
        return;
    }

    const percent = (size / limit) * 100;
    const color = percent > 100
        ? "\x1b[31m"
        : percent > 80
        ? "\x1b[33m"
        : "\x1b[32m";
    const reset = "\x1b[0m";

    console.log(
        `${file.padEnd(50)} : ${color}${
            formatBytes(size).padEnd(10)
        }${reset} / ${formatBytes(limit)} (${percent.toFixed(1)}%)`,
    );

    if (size > limit) {
        console.error(`❌ BUDGET EXCEEDED: ${file}`);
        failed = true;
    }
});

if (failed) {
    process.exit(1);
}
console.log("✅ All bundles within budget.");
