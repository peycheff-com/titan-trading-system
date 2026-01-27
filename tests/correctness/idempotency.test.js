import { describe, expect, it } from "@jest/globals";
// Simulation of a generic Idempotent Consumer
class IdempotentConsumer {
    processedIds = new Set();
    state = 0;
    async handleEvent(event) {
        if (this.processedIds.has(event.id)) {
            // Idempotency check: duplicated message detected
            return { status: "ignored", reason: "duplicate" };
        }
        // Process logic
        this.state += event.value;
        // Mark as processed
        this.processedIds.add(event.id);
        return { status: "processed" };
    }
}
describe("Correctness: Idempotency Gates", () => {
    it("should ignore duplicate events (replay protection)", async () => {
        const consumer = new IdempotentConsumer();
        const event = { id: "evt_123", value: 10 };
        // First processing
        const result1 = await consumer.handleEvent(event);
        expect(result1.status).toBe("processed");
        expect(consumer.state).toBe(10);
        // Replay (Second processing)
        const result2 = await consumer.handleEvent(event);
        expect(result2.status).toBe("ignored");
        expect(result2.reason).toBe("duplicate");
        // Invariant: State must not change on replay
        expect(consumer.state).toBe(10);
    });
    it("should process distinct events correctly", async () => {
        const consumer = new IdempotentConsumer();
        await consumer.handleEvent({ id: "evt_A", value: 5 });
        await consumer.handleEvent({ id: "evt_B", value: 5 });
        expect(consumer.state).toBe(10);
    });
});
//# sourceMappingURL=idempotency.test.js.map