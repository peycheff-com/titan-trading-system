import * as fs from "fs";
import * as path from "path";
// Budget in bytes
const BUDGETS = {
    // 5MB for brain bundle (it's a backend service/monolith mostly, but good to track)
    "services/titan-brain/dist/index.js": 5 * 1024 * 1024,
    // 2MB for console JS bundle (Titan Console - Single Page App)
    // Note: glob pattern matching is not supported by fs.statSync, so we need to handle that logic 
    // or just point to the largest file. For now, we'll update the logic below to handle glob-like finding or 
    // just use a fixed name if we control build names. 
    // Since vite produces hashed filenames, we need to find them.
    // For this scripts, let's just create a helper to find the largest JS file in the assets dir.
    "apps/titan-console/dist/assets/largest_js": 2 * 1024 * 1024,
    "apps/titan-console/dist/assets/largest_css": 200 * 1024,
};
console.log("⚖️  Checking Bundle Sizes...");
let failed = false;
function getFileSize(filePath) {
    try {
        if (filePath.includes("apps/titan-console/dist/assets/largest_js")) {
            return getLargestFileInDir("apps/titan-console/dist/assets", ".js");
        }
        if (filePath.includes("apps/titan-console/dist/assets/largest_css")) {
            return getLargestFileInDir("apps/titan-console/dist/assets", ".css");
        }
        const stats = fs.statSync(filePath);
        return stats.size;
    }
    catch (e) {
        return -1;
    }
}
function getLargestFileInDir(dir, ext) {
    try {
        const files = fs.readdirSync(dir);
        let maxSize = -1;
        files.forEach(file => {
            if (file.endsWith(ext)) {
                const size = fs.statSync(path.join(dir, file)).size;
                if (size > maxSize)
                    maxSize = size;
            }
        });
        return maxSize;
    }
    catch (e) {
        return -1;
    }
}
function formatBytes(bytes) {
    if (bytes === 0)
        return "0 Bytes";
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
    console.log(`${file.padEnd(50)} : ${color}${formatBytes(size).padEnd(10)}${reset} / ${formatBytes(limit)} (${percent.toFixed(1)}%)`);
    if (size > limit) {
        console.error(`❌ BUDGET EXCEEDED: ${file}`);
        failed = true;
    }
});
if (failed) {
    process.exit(1);
}
console.log("✅ All bundles within budget.");
//# sourceMappingURL=check_bundle_size.js.map