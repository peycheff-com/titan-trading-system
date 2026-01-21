import { createEnvelope, EnvelopeSchema } from "../../../src/schemas/envelope";
import { z } from "zod";

describe("Titan Envelope System", () => {
    const TestPayloadSchema = z.object({
        foo: z.string(),
        bar: z.number(),
    });

    type TestPayload = z.infer<typeof TestPayloadSchema>;

    it("should create a valid envelope with mandatory metadata", () => {
        const payload: TestPayload = { foo: "test", bar: 123 };
        const envelope = createEnvelope("test.event", payload, {
            version: 1,
            producer: "test-service",
        });

        expect(envelope.id).toBeDefined();
        expect(envelope.ts).toBeDefined();
        expect(envelope.correlation_id).toBeDefined();
        expect(envelope.type).toBe("test.event");
        expect(envelope.payload).toEqual(payload);
    });

    it("should validate a correct envelope using Zod", () => {
        const payload = { foo: "test", bar: 123 };
        const envelope = createEnvelope("test.event", payload, {
            version: 1,
            producer: "test-service",
        });

        const result = EnvelopeSchema.safeParse(envelope);
        expect(result.success).toBe(true);
    });

    it("should fail validation if required fields are missing", () => {
        const invalidEnvelope = {
            type: "broken",
            // missing id, version, etc.
            payload: {},
        };

        const result = EnvelopeSchema.safeParse(invalidEnvelope);
        expect(result.success).toBe(false);
    });

    it("should allow optional fields like idempotency_key", () => {
        const payload = { foo: "cmd", bar: 1 };
        const envelope = createEnvelope("test.command", payload, {
            version: 1,
            producer: "test-service",
            idempotency_key: "unique-key-123",
        });

        expect(envelope.idempotency_key).toBe("unique-key-123");
        const result = EnvelopeSchema.safeParse(envelope);
        expect(result.success).toBe(true);
    });
});
