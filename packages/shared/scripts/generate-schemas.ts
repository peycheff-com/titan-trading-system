process.env.TITAN_GENERATING_SCHEMAS = "true";

import { zodToJsonSchema } from "zod-to-json-schema";
import { EnvelopeSchema } from "../src/schemas/envelope";
import { IntentPayloadSchemaV1 } from "../src/schemas/intentSchema";
import { BaseCommandSchema } from "../src/schemas/base";
import { FeeScheduleSchema } from "../src/schemas/FeeSchedule";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = path.resolve(__dirname, "../schemas/json");

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function generate(name: string, schema: any) {
    const jsonSchema = zodToJsonSchema(schema, name);
    const filePath = path.join(OUTPUT_DIR, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(jsonSchema, null, 2));
    console.log(`Generated ${filePath}`);
}

generate("Envelope", EnvelopeSchema);
generate("IntentPayload", IntentPayloadSchemaV1);
generate("BaseCommand", BaseCommandSchema);
generate("FeeSchedule", FeeScheduleSchema);

// Generate a specific Envelope<Intent> schema for Rust to look at
// Note: Zod generics are tricky to export directly as 'Envelope<Intent>',
// so we might just export the parts and composition guidelines,
// OR we create a specific Zod type just for generation purposes.

import { z } from "zod";
const IntentEnvelopeSchema = EnvelopeSchema.extend({
    payload: IntentPayloadSchemaV1,
});
generate("IntentEnvelope", IntentEnvelopeSchema);
