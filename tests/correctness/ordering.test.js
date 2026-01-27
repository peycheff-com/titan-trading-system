import { describe, expect, it } from "@jest/globals";
// Simulation of a Sequence-Enforcing Consumer
class OrderedConsumer {
    expectedSequence = 1;
    processedEvents = [];
    buffer = new Map();
    async handleEvent(event) {
        // If exact match
        if (event.seq === this.expectedSequence) {
            this.process(event);
            this.tryProcessBuffer();
            return { status: "processed" };
        }
        // If future event (gap detected)
        if (event.seq > this.expectedSequence) {
            this.buffer.set(event.seq, event);
            return { status: "buffered", expected: this.expectedSequence };
        }
        // If old event
        return { status: "ignored", reason: "stale" };
    }
    process(event) {
        this.processedEvents.push(event.seq);
        this.expectedSequence++;
    }
    tryProcessBuffer() {
        while (this.buffer.has(this.expectedSequence)) {
            const nextEvent = this.buffer.get(this.expectedSequence);
            this.buffer.delete(this.expectedSequence);
            this.process(nextEvent);
        }
    }
}
describe("Correctness: Event Ordering Invariants", () => {
    it("should process in-order events immediately", async () => {
        const consumer = new OrderedConsumer();
        await consumer.handleEvent({ seq: 1, data: "A" });
        await consumer.handleEvent({ seq: 2, data: "B" });
        expect(consumer.processedEvents).toEqual([1, 2]);
    });
    it("should buffer out-of-order events and reconcile when gap is filled", async () => {
        const consumer = new OrderedConsumer();
        // Receive 1, then 3 (gap of 2), then 2
        await consumer.handleEvent({ seq: 1, data: "A" });
        const res3 = await consumer.handleEvent({ seq: 3, data: "C" });
        expect(res3.status).toBe("buffered");
        expect(consumer.processedEvents).toEqual([1]); // 3 is not processed yet
        // Fill gap with 2
        await consumer.handleEvent({ seq: 2, data: "B" });
        // Should auto-process 2 then 3
        expect(consumer.processedEvents).toEqual([1, 2, 3]);
        expect(consumer.buffer.size).toBe(0);
    });
    it("should ignore stale events (already processed)", async () => {
        const consumer = new OrderedConsumer();
        await consumer.handleEvent({ seq: 1, data: "A" });
        // Replay 1
        const res = await consumer.handleEvent({ seq: 1, data: "A" });
        expect(res.status).toBe("ignored");
    });
});
//# sourceMappingURL=ordering.test.js.map