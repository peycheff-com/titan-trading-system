import {
    FetchingJSONSchemaStore,
    InputData,
    JSONSchemaInput,
    quicktype,
} from "quicktype-core";
import * as fs from "fs";
import * as path from "path";

const SCHEMA_DIR = path.resolve(__dirname, "../schemas/json");
const OUTPUT_DIR = path.resolve(
    __dirname,
    "../../../services/titan-execution-rs/src",
);

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generateRust() {
    const schemaFiles = fs.readdirSync(SCHEMA_DIR).filter((f) =>
        f.endsWith(".json")
    );

    const schemaInput = new JSONSchemaInput(new FetchingJSONSchemaStore());

    for (const file of schemaFiles) {
        const name = path.basename(file, ".json");
        const schemaContent = fs.readFileSync(
            path.join(SCHEMA_DIR, file),
            "utf8",
        );
        await schemaInput.addSource({ name, schema: schemaContent });
    }

    const inputData = new InputData();
    inputData.addInput(schemaInput);

    const { lines } = await quicktype({
        inputData,
        lang: "rust",
        rendererOptions: {
            "visibility": "public",
            "derive-debug": "true",
            "derive-clone": "true",
            "derive-serde": "true",
        },
    });

    const outputFile = path.join(OUTPUT_DIR, "contracts.rs");
    fs.writeFileSync(outputFile, lines.join("\n"));
    console.log(`Generated Rust contracts at ${outputFile}`);
}

generateRust().catch(console.error);
