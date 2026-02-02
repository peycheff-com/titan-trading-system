import fs from "fs";
import path from "path";
import { glob } from "glob";

const ROOT_DIR = process.cwd();
const DOCS_DIR = path.join(ROOT_DIR, "docs");

async function validateLinks() {
    console.log("🔍 Scanning for broken links in docs/...");

    const files = await glob("docs/**/*.md", {
        cwd: ROOT_DIR,
        ignore: "**/node_modules/**",
    });
    let errorCount = 0;

    for (const file of files) {
        const filePath = path.join(ROOT_DIR, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;

        while ((match = linkRegex.exec(content)) !== null) {
            const [fullMatch, text, link] = match;

            // Skip external links, anchors, and absolute paths (which are banned but handled effectively by truth check)
            if (
                link.startsWith("http") || link.startsWith("#") ||
                link.startsWith("mailto:")
            ) continue;

            // Resolve path
            const dir = path.dirname(filePath);
            const targetPath = path.resolve(dir, link.split("#")[0]); // Ignore anchor for file check

            if (!fs.existsSync(targetPath)) {
                console.error(`❌ Broken Link in ${file}:`);
                console.error(`   Link: ${link}`);
                console.error(`   Resolved: ${targetPath}`);
                errorCount++;
            }
        }
    }

    if (errorCount > 0) {
        console.error(`\nFound ${errorCount} broken links.`);
        process.exit(1);
    } else {
        console.log("✅ No broken relative links found.");
    }
}

validateLinks().catch(console.error);
