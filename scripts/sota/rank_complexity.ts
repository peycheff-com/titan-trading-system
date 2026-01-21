import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Colors
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

console.log(`${BOLD}🧠 Running Titan Complexity Scanner...${RESET}`);

// Run ESLint with the complexity config and JSON output
const cmd =
    `npx eslint -c scripts/sota/complexity.config.mjs --format json "services/*/src/**/*.{ts,tsx}"`;

let output: string;
try {
    // Increase max buffer for large JSON output
    output = execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
} catch (e: any) {
    // ESLint returns exit code 1 if there are warnings (which we forced), so we catch it
    output = e.stdout;
}

if (!output) {
    console.error(`${RED}No output from ESLint!${RESET}`);
    process.exit(1);
}

interface EslintMessage {
    ruleId: string;
    message: string;
    line: number;
}

interface EslintResult {
    filePath: string;
    messages: EslintMessage[];
}

let results: EslintResult[] = [];
try {
    results = JSON.parse(output);
} catch (e) {
    console.error(`${RED}Failed to parse ESLint JSON output.${RESET}`);
    // Try to find JSON start
    const jsonStart = output.indexOf("[");
    if (jsonStart > -1) {
        try {
            results = JSON.parse(output.substring(jsonStart));
        } catch (e2) {
            console.error(output.substring(0, 500) + "...");
            process.exit(1);
        }
    } else {
        console.error(output);
        process.exit(1);
    }
}

// Extract complexity metrics
interface Metric {
    file: string;
    line: number;
    score: number;
    type: string;
}

const metrics: Metric[] = [];

results.forEach((fileResult) => {
    fileResult.messages.forEach((msg) => {
        let score = 0;
        let type = "";

        // Parse Standard Complexity (Cyclomatic)
        if (msg.ruleId === "complexity") {
            const match = msg.message.match(/complexity of (\d+)/);
            if (match) {
                score = parseInt(match[1], 10);
                type = "Cyclomatic";
            }
        }

        // Parse Cognitive Complexity
        if (msg.ruleId === "sonarjs/cognitive-complexity") {
            const match = msg.message.match(/complexity of (\d+)/);
            if (match) {
                score = parseInt(match[1], 10);
                type = "Cognitive";
            }
        }

        if (score > 15) { // Only care about significant complexity
            metrics.push({
                file: path.relative(process.cwd(), fileResult.filePath),
                line: msg.line,
                score: score,
                type: type,
            });
        }
    });
});

// Sort by score descending
metrics.sort((a, b) => b.score - a.score);

// Print Top 20
console.log(`\n${BOLD}🔥 Top 20 Most Complex Functions${RESET}`);
console.log(
    `${BOLD}${"Score".padEnd(8)} | ${
        "Type".padEnd(12)
    } | ${"Location"}${RESET}`,
);
console.log("".padEnd(80, "-"));

metrics.slice(0, 20).forEach((m) => {
    const color = m.score > 30 ? RED : m.score > 20 ? YELLOW : CYAN;
    console.log(
        `${color}${m.score.toString().padEnd(8)}${RESET} | ${
            m.type.padEnd(12)
        } | ${m.file}:${m.line}`,
    );
});

console.log(`\n${BOLD}Total Violations (>15):${RESET} ${metrics.length}`);

// Generate a Markdown Report
const reportPath = "complexity_report.md";
const mdContent = `# Complexity Report
*Generated on ${new Date().toISOString()}*

## Top 50 Most Complex Functions
| Score | Type | Location |
|-------|------|----------|
${
    metrics.slice(0, 50).map((m) =>
        `| ${m.score} | ${m.type} | [${m.file}:${m.line}](${m.file}#L${m.line}) |`
    ).join("\n")
}
`;

fs.writeFileSync(reportPath, mdContent);
console.log(`\n📄 Report saved to ${reportPath}`);
