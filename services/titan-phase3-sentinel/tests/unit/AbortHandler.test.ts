/* Jest globals: describe, it, expect, beforeEach */
import { AbortHandler } from "../../src/execution/AbortHandler.js";

describe("AbortHandler", () => {
    describe("constructor", () => {
        it("should create handler in non-aborted state", () => {
            const handler = new AbortHandler();
            expect(handler.isAborted).toBe(false);
        });

        it("should have a signal", () => {
            const handler = new AbortHandler();
            expect(handler.signal).toBeDefined();
            expect(handler.signal.aborted).toBe(false);
        });
    });

    describe("abort", () => {
        it("should set isAborted to true", () => {
            const handler = new AbortHandler();
            handler.abort();
            expect(handler.isAborted).toBe(true);
        });

        it("should abort the signal", () => {
            const handler = new AbortHandler();
            handler.abort();
            expect(handler.signal.aborted).toBe(true);
        });

        it("should emit abort event", () => {
            const handler = new AbortHandler();
            const listener = jest.fn();
            handler.on("abort", listener);

            handler.abort("test reason");

            expect(listener).toHaveBeenCalledWith("test reason");
        });

        it("should be idempotent - calling abort twice only emits once", () => {
            const handler = new AbortHandler();
            const listener = jest.fn();
            handler.on("abort", listener);

            handler.abort("first");
            handler.abort("second");

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith("first");
        });

        it("should pass reason to signal", () => {
            const handler = new AbortHandler();
            handler.abort("custom reason");

            expect(handler.isAborted).toBe(true);
        });
    });

    describe("signal", () => {
        it("should return AbortSignal", () => {
            const handler = new AbortHandler();
            const signal = handler.signal;
            expect(signal).toBeInstanceOf(AbortSignal);
        });

        it("should reflect abort state", () => {
            const handler = new AbortHandler();
            expect(handler.signal.aborted).toBe(false);

            handler.abort();
            expect(handler.signal.aborted).toBe(true);
        });
    });

    describe("reset", () => {
        it("should reset abort state", () => {
            const handler = new AbortHandler();
            handler.abort();
            expect(handler.isAborted).toBe(true);

            handler.reset();
            expect(handler.isAborted).toBe(false);
        });

        it("should create new signal", () => {
            const handler = new AbortHandler();
            const originalSignal = handler.signal;
            handler.abort();

            handler.reset();

            expect(handler.signal).not.toBe(originalSignal);
            expect(handler.signal.aborted).toBe(false);
        });

        it("should allow abort after reset", () => {
            const handler = new AbortHandler();
            const listener = jest.fn();
            handler.on("abort", listener);

            handler.abort("first");
            handler.reset();
            handler.abort("second");

            expect(listener).toHaveBeenCalledTimes(2);
            expect(handler.isAborted).toBe(true);
        });
    });

    describe("EventEmitter behavior", () => {
        it("should support multiple listeners", () => {
            const handler = new AbortHandler();
            const listener1 = jest.fn();
            const listener2 = jest.fn();

            handler.on("abort", listener1);
            handler.on("abort", listener2);
            handler.abort("shared reason");

            expect(listener1).toHaveBeenCalledWith("shared reason");
            expect(listener2).toHaveBeenCalledWith("shared reason");
        });

        it("should support removing listeners", () => {
            const handler = new AbortHandler();
            const listener = jest.fn();

            handler.on("abort", listener);
            handler.off("abort", listener);
            handler.abort();

            expect(listener).not.toHaveBeenCalled();
        });
    });
});
