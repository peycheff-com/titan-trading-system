import fs from "fs";
import path from "path";
import { globSync } from "glob";
import Ajv from "ajv";

const CONTRACTS_DIR = "contracts/nats";

function checkContractsSchemas() {
    console.log("📜 Checking NATS Contract Schemas...");

    if (!fs.existsSync(CONTRACTS_DIR)) {
        console.warn(
            "⚠️  No contracts/nats directory found. Skipping schema check.",
        );
        return;
    }

    const schemaFiles = globSync("**/*.schema.json", {
        cwd: CONTRACTS_DIR,
        absolute: true,
    });
    const ajv = new Ajv();

    let failed = false;

    for (const file of schemaFiles) {
        const relativePath = path.relative(process.cwd(), file);
        try {
            const content = fs.readFileSync(file, "utf-8");
            const schema = JSON.parse(content);

            const validate = ajv.compile(schema); // compiling validates the schema itself
            // console.log(`  - ${relativePath} is valid.`);
        } catch (error: any) {
            console.error(
                `❌ Invalid schema in ${relativePath}: ${error.message}`,
            );
            failed = true;
        }
    }

    if (failed) {
        console.error("❌ Schema validation failed.");
        process.exit(1);
    } else {
        console.log(`✅ Verified ${schemaFiles.length} schemas.`);
    }
}

checkContractsSchemas();
