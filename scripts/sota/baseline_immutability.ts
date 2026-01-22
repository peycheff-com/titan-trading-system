import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// Configuration
const ESLINT_CMD =
    'npx eslint -c scripts/sota/immutability.config.mjs "services/*/src/**/*.{ts,tsx}" --format=json';

interface EslintMessage {
    ruleId: string | null;
    severity: number;
    message: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
}

interface EslintResult {
    filePath: string;
    messages: EslintMessage[];
}

function runEslint(): EslintResult[] {
    console.log("Running ESLint to find violations...");
    try {
        // We expect this to fail with exit code 1 if there are errors
        execSync(ESLINT_CMD, {
            stdio: "pipe",
            encoding: "utf-8",
            maxBuffer: 1024 * 1024 * 50,
        });
        return [];
    } catch (err: any) {
        if (err.stdout) {
            const output = err.stdout.toString();
            // Find the start of JSON array
            const jsonStart = output.indexOf("[");
            if (jsonStart === -1) {
                console.error("Could not find JSON output in ESLint stdout");
                console.error(output.substring(0, 1000));
                return [];
            }
            return JSON.parse(output.substring(jsonStart));
        }
        console.error("ESLint failed without stdout");
        return [];
    }
}

function applyBaseline(results: EslintResult[]) {
    let initialTotal = 0;
    let filesChanged = 0;

    for (const result of results) {
        if (result.messages.length === 0) continue;

        initialTotal += result.messages.length;
        const content = fs.readFileSync(result.filePath, "utf-8");
        const lines = content.split("\n");
        let modified = false;

        // Group messages by line to handle multiple errors on same line
        const messagesByLine = new Map<number, Set<string>>();
        for (const msg of result.messages) {
            if (!msg.ruleId) continue;
            // Focus on immutability rules only to avoid suppressing other important things
            if (!msg.ruleId.startsWith("functional/")) continue;

            if (!messagesByLine.has(msg.line)) {
                messagesByLine.set(msg.line, new Set());
            }
            messagesByLine.get(msg.line)!.add(msg.ruleId);
        }

        // Process from bottom up to avoid line number shifts affecting unprocessed lines
        const sortedLines = Array.from(messagesByLine.keys()).sort((a, b) =>
            b - a
        );

        for (const lineNum of sortedLines) {
            const rules = Array.from(messagesByLine.get(lineNum)!);
            const disableComment = `// eslint-disable-next-line ${
                rules.join(", ")
            }`;

            // Determine indentation
            const targetLineIdx = lineNum - 1;
            if (targetLineIdx < 0) continue;

            const targetLine = lines[targetLineIdx];
            const indentation = targetLine.match(/^\s*/)?.[0] || "";

            // Check if previous line is already a disable comment
            if (
                targetLineIdx > 0 &&
                lines[targetLineIdx - 1].trim().startsWith(
                    "// eslint-disable-next-line",
                )
            ) {
                // Maybe merge if we want to be fancy, but simplest is just add another one or ignore
                // For simplicity, we just add it. Stacked disables work or just look ugly.
                // Better: append rules to existing disable if strictly focused?
                // Let's just insert.
            }

            lines.splice(targetLineIdx, 0, `${indentation}${disableComment}`);
            modified = true;
        }

        if (modified) {
            fs.writeFileSync(result.filePath, lines.join("\n"));
            filesChanged++;
            console.log(
                `Baselined ${messagesByLine.size} violations in ${
                    path.basename(result.filePath)
                }`,
            );
        }
    }

    console.log(`\nOperation Complete.`);
    console.log(`Files modified: ${filesChanged}`);
    console.log(`Violations processed: ${initialTotal}`);
}

const results = runEslint();
console.log(
    `Found ${
        results.reduce((acc, r) => acc + r.messages.length, 0)
    } total violations.`,
);
applyBaseline(results);
