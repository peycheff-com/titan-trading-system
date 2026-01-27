process.env.TITAN_GENERATING_SCHEMAS = "true";
import { zodToJsonSchema } from "zod-to-json-schema";
import { EnvelopeSchema } from "../src/schemas/envelope";
import { IntentPayloadSchemaV1, } from "../src/schemas/intentSchema";
import { BaseCommandSchema } from "../src/schemas/base";
import * as fs from "fs";
import * as path from "path";
const OUTPUT_DIR = path.resolve(__dirname, "../schemas/json");
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
function generate(name, schema) {
    const jsonSchema = zodToJsonSchema(schema, name);
    const filePath = path.join(OUTPUT_DIR, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(jsonSchema, null, 2));
    console.log(`Generated ${filePath}`);
}
generate("Envelope", EnvelopeSchema);
generate("IntentPayload", IntentPayloadSchemaV1);
generate("BaseCommand", BaseCommandSchema);
const IntentEnvelopeSchema = EnvelopeSchema.extend({
    payload: IntentPayloadSchemaV1,
});
generate("IntentEnvelope", IntentEnvelopeSchema);
//# sourceMappingURL=generate-schemas.js.map