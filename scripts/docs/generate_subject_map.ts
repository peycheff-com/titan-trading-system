import * as fs from "fs";
import * as path from "path";
import { TITAN_SUBJECTS } from "../../packages/shared/src/messaging/titan_subjects";

const SOT_PATH = path.join(
    __dirname,
    "../../docs/SYSTEM_SOURCE_OF_TRUTH.md",
);
const MARKER_START = "<!-- AUTH_SUBJECT_MAP_START -->";
const MARKER_END = "<!-- AUTH_SUBJECT_MAP_END -->";

function flattenSubjects(obj: any, prefix = "TITAN_SUBJECTS"): string[] {
    let lines: string[] = [];

    for (const key in obj) {
        if (typeof obj[key] === "string") {
            const val = obj[key] as string;
            // Only include subjects (titan.*)
            if (val.startsWith("titan.")) {
                lines.push(`| \`${prefix}.${key}\` | \`${val}\` |`);
            }
        } else if (typeof obj[key] === "function") {
            // Function generator, describe it
            lines.push(`| \`${prefix}.${key}\` | \`Function(...args)\` |`);
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
            lines = lines.concat(flattenSubjects(obj[key], `${prefix}.${key}`));
        }
    }
    return lines;
}

function generateMap() {
    console.log("🗺️  Generating NATS Subject Map...");

    const rows = flattenSubjects(TITAN_SUBJECTS.CMD, "CMD")
        .concat(flattenSubjects(TITAN_SUBJECTS.EVT, "EVT"))
        .concat(flattenSubjects(TITAN_SUBJECTS.DATA, "DATA"))
        .concat(flattenSubjects(TITAN_SUBJECTS.SYS, "SYS"));

    const table = [
        "| Constant Path | Subject Pattern |",
        "|---------------|-----------------|",
        ...rows,
    ].join("\n");

    if (!fs.existsSync(SOT_PATH)) {
        console.error(`❌ SoT file not found at ${SOT_PATH}`);
        process.exit(1);
    }

    let content = fs.readFileSync(SOT_PATH, "utf-8");
    const startIndex = content.indexOf(MARKER_START);
    const endIndex = content.indexOf(MARKER_END);

    if (startIndex === -1 || endIndex === -1) {
        console.error(
            "❌ Marker tags not found in SoT. Please add <!-- AUTH_SUBJECT_MAP_START --> and <!-- AUTH_SUBJECT_MAP_END -->",
        );
        process.exit(1);
    }

    const newContent = content.substring(0, startIndex + MARKER_START.length) +
        "\n" + table + "\n" +
        content.substring(endIndex);

    fs.writeFileSync(SOT_PATH, newContent);
    console.log("✅ SoT updated with canonical subject map.");
}

generateMap();
