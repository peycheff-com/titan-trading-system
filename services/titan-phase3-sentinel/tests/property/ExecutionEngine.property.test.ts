import fc from "fast-check";
import { TwapExecutor } from "../../src/execution/TwapExecutor";
import { AtomicExecutor } from "../../src/execution/AtomicExecutor";
import { AbortHandler } from "../../src/execution/AbortHandler";
import type { IOrderExecutor } from "../../src/execution/interfaces";
import type { Order, OrderResult } from "../../src/types/orders";

// Mock Executor
class MockExecutor implements IOrderExecutor {
    async executeOrder(order: Order): Promise<OrderResult> {
        return {
            orderId: "mock-" + Math.random(),
            status: "FILLED",
            filledSize: order.size,
            avgPrice: 100,
            fees: 0,
            timestamp: Date.now(),
        };
    }
    async getPrice(symbol: string): Promise<number> {
        return 100;
    }
}

describe("ExecutionEngine Property Tests", () => {
    describe("TwapExecutor", () => {
        it("should always fill the total size exactly (sum of clips) if successful", async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.double({ min: 10, max: 10000, noNaN: true }),
                    fc.integer({ min: 100, max: 2000 }), // maxClipSize
                    async (totalSize, maxClipSize) => {
                        const executor = new MockExecutor();
                        const twap = new TwapExecutor(executor, {
                            maxClipSize,
                            minInterval: 0, // minimal delay for test speed
                            maxInterval: 1,
                            maxSlippage: 0.1,
                        });

                        // Override wait to be instant
                        // @ts-ignore
                        twap.wait = async () => {};

                        const result = await twap.execute({
                            symbol: "BTCUSDT",
                            side: "BUY",
                            totalSize,
                            duration: 10,
                        });

                        expect(result.aborted).toBe(false);

                        // Check sum of clips
                        const clipSum = result.clips.reduce(
                            (sum, c) => sum + c.size,
                            0,
                        );

                        // Allow floating point error
                        expect(Math.abs(clipSum - totalSize)).toBeLessThan(
                            1e-9,
                        );
                        expect(Math.abs(result.totalFilled - totalSize))
                            .toBeLessThan(1e-9);

                        // Check max clip size respected for all but potentially last clip (remainder)
                        // Actually implementation spreads remainder, so clips should be close.
                        // But definitely none should be significantly larger than maxClipSize (unless totalSize < maxClipSize)
                        // Wait, logic says: avgClipSize = min(total, maxClip). numClips = ceil(total/avg).
                        // clips = floor(total/num). remainder distributed.
                        // So clips should be <= maxClipSize?
                        // If total=1000, max=100. num=10. clips=100.
                        // If total=1001, max=100. num=11. clips=91.
                        // So clips are often smaller than maxClipSize to ensure consistent sizing.
                        // But they shouldn't be LARGER.
                        // Except wait, if total=100 and max=10. num=10. size=10.
                        // If total=105, max=100. num=2? No min(105, 100)=100. num=2. size=52, 53.

                        result.clips.forEach((clip) => {
                            // Implementation detail: we distribute remainder +1.
                            // Base size = floor(total / num). num = ceil(total / min(total, max)).
                            // If total is large, num = total/max. Base size = max.
                            // So clip size should be <= maxClipSize + 1 (due to remainder distribution)
                            expect(clip.size).toBeLessThanOrEqual(
                                maxClipSize + 1,
                            );
                        });
                    },
                ),
            );
        });

        it("should respect abort signal", async () => {
            const executor = new MockExecutor();
            const twap = new TwapExecutor(executor);
            // We can't easily property test timing-dependent abort in unit test without fake timers,
            // but we can verify that calling abort() sets flag.
            const p = twap.execute({
                symbol: "BTC",
                side: "BUY",
                totalSize: 1000,
                duration: 1000, // Long duration
            });
            twap.abort();
            const result = await p;
            expect(result.aborted).toBe(true);
        });
    });

    describe("AtomicExecutor", () => {
        it("should report success only if both legs fill", async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.boolean(),
                    fc.boolean(),
                    async (leg1Success, leg2Success) => {
                        const executor = {
                            executeOrder: jest.fn()
                                .mockImplementationOnce(async (o) => {
                                    if (!leg1Success) throw new Error("Fail");
                                    return {
                                        status: "FILLED",
                                        filledSize: o.size,
                                        avgPrice: 100,
                                        fees: 1,
                                    };
                                })
                                .mockImplementationOnce(async (o) => {
                                    if (!leg2Success) throw new Error("Fail");
                                    return {
                                        status: "FILLED",
                                        filledSize: o.size,
                                        avgPrice: 100,
                                        fees: 1,
                                    };
                                }),
                            getPrice: async () => 100,
                        };

                        const atomic = new AtomicExecutor(executor, {
                            maxTimeDiff: 1000,
                            revertOnFailure: false,
                        });

                        const result = await atomic.executeDualLeg(
                            {
                                symbol: "A",
                                side: "BUY",
                                type: "MARKET",
                                size: 1,
                            },
                            {
                                symbol: "B",
                                side: "SELL",
                                type: "MARKET",
                                size: 1,
                            },
                        );

                        if (leg1Success && leg2Success) {
                            expect(result.success).toBe(true);
                        } else {
                            expect(result.success).toBe(false);
                        }
                    },
                ),
            );
        });

        it("should attempt revert if one leg fails and revertOnFailure is true", async () => {
            // Manual property logic: randomized scenario of which leg fails
            await fc.assert(
                fc.asyncProperty(fc.boolean(), async (leg1Fails) => {
                    const executor = {
                        executeOrder: jest.fn(),
                        getPrice: async () => 100,
                    };

                    // Setup mock
                    if (leg1Fails) {
                        // Leg 1 fails, Leg 2 succeeds
                        executor.executeOrder
                            .mockRejectedValueOnce(new Error("Leg 1 Fail")) // Leg 1
                            .mockResolvedValueOnce({
                                status: "FILLED",
                                filledSize: 1,
                                avgPrice: 100,
                                fees: 0,
                            }) // Leg 2
                            .mockResolvedValueOnce({
                                status: "FILLED",
                                filledSize: 1,
                                avgPrice: 100,
                                fees: 0,
                            }); // Revert Leg 2
                    } else {
                        // Leg 1 succeeds, Leg 2 fails
                        executor.executeOrder
                            .mockResolvedValueOnce({
                                status: "FILLED",
                                filledSize: 1,
                                avgPrice: 100,
                                fees: 0,
                            }) // Leg 1
                            .mockRejectedValueOnce(new Error("Leg 2 Fail")) // Leg 2
                            .mockResolvedValueOnce({
                                status: "FILLED",
                                filledSize: 1,
                                avgPrice: 100,
                                fees: 0,
                            }); // Revert Leg 1
                    }

                    const atomic = new AtomicExecutor(executor, {
                        maxTimeDiff: 1000,
                        revertOnFailure: true,
                    });

                    const result = await atomic.executeDualLeg(
                        { symbol: "A", side: "BUY", type: "MARKET", size: 1 },
                        { symbol: "B", side: "SELL", type: "MARKET", size: 1 },
                    );

                    expect(result.success).toBe(false);
                    expect(executor.executeOrder).toHaveBeenCalledTimes(3); // 2 legs + 1 revert
                }),
            );
        });
    });
});
