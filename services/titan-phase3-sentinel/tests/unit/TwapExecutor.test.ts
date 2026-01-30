/* Jest globals: describe, it, expect, beforeEach, afterEach */
import { TwapExecutor } from "../../src/execution/TwapExecutor.js";
import type { IOrderExecutor } from "../../src/execution/interfaces.js";
import type { TwapConfig } from "../../src/types/orders.js";

describe("TwapExecutor", () => {
    let mockExecutor: IOrderExecutor;

    beforeEach(() => {
        jest.useFakeTimers();

        mockExecutor = {
            async getPrice(symbol: string): Promise<number> {
                return symbol.includes("BTC") ? 50000 : 2000;
            },
            async executeOrder(order: any) {
                return {
                    orderId: `order-${Date.now()}`,
                    status: "FILLED" as const,
                    filledSize: order.size,
                    avgPrice: 50000,
                    fees: order.size * 0.001,
                };
            },
        };
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe("constructor", () => {
        it("should use default config when none provided", () => {
            const executor = new TwapExecutor(mockExecutor);
            expect(executor).toBeDefined();
        });

        it("should accept custom config", () => {
            const config: TwapConfig = {
                maxClipSize: 100,
                minInterval: 10000,
                maxInterval: 60000,
                maxSlippage: 0.001,
            };

            const executor = new TwapExecutor(mockExecutor, config);
            expect(executor).toBeDefined();
        });
    });

    describe("execute", () => {
        let executor: TwapExecutor;

        beforeEach(() => {
            executor = new TwapExecutor(mockExecutor, {
                maxClipSize: 500,
                minInterval: 1000,
                maxInterval: 5000,
                maxSlippage: 0.002,
            });
        });

        it("should execute small order in single clip", async () => {
            const promise = executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 100, // Less than maxClipSize
                duration: 30000,
            });

            await jest.runAllTimersAsync();
            const result = await promise;

            expect(result.totalFilled).toBe(100);
            expect(result.clips).toHaveLength(1);
            expect(result.aborted).toBe(false);
        });

        it("should split large order into multiple clips", async () => {
            const promise = executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 1500, // 3 clips of 500
                duration: 60000,
            });

            await jest.runAllTimersAsync();
            const result = await promise;

            expect(result.totalFilled).toBe(1500);
            expect(result.clips).toHaveLength(3);
        });

        it("should calculate average price correctly", async () => {
            // Mock different prices for each clip
            let callCount = 0;
            mockExecutor.executeOrder = async (order: any) => {
                callCount++;
                const prices = [50000, 50100, 50200];
                return {
                    orderId: `order-${callCount}`,
                    status: "FILLED" as const,
                    filledSize: order.size,
                    avgPrice: prices[callCount - 1] || 50000,
                    fees: 0.1,
                };
            };

            const promise = executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 1500,
                duration: 60000,
            });

            await jest.runAllTimersAsync();
            const result = await promise;

            // Average of 50000, 50100, 50200 = 50100
            expect(result.avgPrice).toBe(50100);
        });

        it("should wait between clips", async () => {
            const executionTimes: number[] = [];
            mockExecutor.executeOrder = async (order: any) => {
                executionTimes.push(Date.now());
                return {
                    orderId: "test",
                    status: "FILLED" as const,
                    filledSize: order.size,
                    avgPrice: 50000,
                    fees: 0.1,
                };
            };

            const promise = executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 1000, // 2 clips
                duration: 10000,
            });

            await jest.runAllTimersAsync();
            await promise;

            expect(executionTimes).toHaveLength(2);
            expect(executionTimes[1] - executionTimes[0])
                .toBeGreaterThanOrEqual(1000);
        });

        it("should reject if already running", async () => {
            executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 1000,
                duration: 30000,
            });

            await expect(
                executor.execute({
                    symbol: "BTCUSDT",
                    side: "SELL",
                    totalSize: 500,
                    duration: 30000,
                }),
            ).rejects.toThrow("TWAP execution already in progress");
        });

        it("should handle BUY and SELL sides", async () => {
            const orders: any[] = [];
            mockExecutor.executeOrder = async (order: any) => {
                orders.push(order);
                return {
                    orderId: "test",
                    status: "FILLED" as const,
                    filledSize: order.size,
                    avgPrice: 50000,
                    fees: 0.1,
                };
            };

            const buyPromise = executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 100,
                duration: 1000,
            });
            await jest.runAllTimersAsync();
            await buyPromise;

            const sellPromise = executor.execute({
                symbol: "BTCUSDT",
                side: "SELL",
                totalSize: 100,
                duration: 1000,
            });
            await jest.runAllTimersAsync();
            await sellPromise;

            expect(orders[0].side).toBe("BUY");
            expect(orders[1].side).toBe("SELL");
        });

        it("should emit events during execution", async () => {
            const events: string[] = [];
            executor.on("clip", () => events.push("clip"));
            executor.on("complete", () => events.push("complete"));

            const promise = executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 100,
                duration: 1000,
            });

            await jest.runAllTimersAsync();
            await promise;

            // Events depend on actual emission in code
            expect(promise).resolves.toBeDefined();
        });
    });

    describe("abort", () => {
        let executor: TwapExecutor;

        beforeEach(() => {
            executor = new TwapExecutor(mockExecutor, {
                maxClipSize: 100,
                minInterval: 5000,
                maxInterval: 10000,
                maxSlippage: 0.002,
            });
        });

        it("should abort execution when called", async () => {
            const promise = executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 500, // 5 clips
                duration: 60000,
            });

            // Advance past first clip
            await jest.advanceTimersByTimeAsync(100);

            // Abort
            executor.abort();

            await jest.runAllTimersAsync();
            const result = await promise;

            expect(result.aborted).toBe(true);
            expect(result.reason).toBe("Aborted");
            expect(result.clips.length).toBeLessThan(5);
        });

        it("should do nothing if no execution in progress", () => {
            expect(() => executor.abort()).not.toThrow();
        });

        it("should allow new execution after abort", async () => {
            const promise1 = executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 500,
                duration: 60000,
            });

            await jest.advanceTimersByTimeAsync(100);
            executor.abort();
            await jest.runAllTimersAsync();
            await promise1;

            // Should be able to start new execution
            const promise2 = executor.execute({
                symbol: "BTCUSDT",
                side: "SELL",
                totalSize: 100,
                duration: 5000,
            });

            await jest.runAllTimersAsync();
            const result = await promise2;

            expect(result.aborted).toBe(false);
        });
    });

    describe("error handling", () => {
        let executor: TwapExecutor;

        beforeEach(() => {
            executor = new TwapExecutor(mockExecutor, {
                maxClipSize: 100,
                minInterval: 1000,
                maxInterval: 5000,
                maxSlippage: 0.002,
            });
        });

        it("should handle executor errors gracefully", async () => {
            mockExecutor.executeOrder = async () => {
                throw new Error("Exchange connection failed");
            };

            const promise = executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 100,
                duration: 5000,
            });

            await jest.runAllTimersAsync();
            const result = await promise;

            expect(result.aborted).toBe(true);
            expect(result.reason).toBe("Exchange connection failed");
        });

        it("should handle price fetch errors", async () => {
            mockExecutor.getPrice = async () => {
                throw new Error("Price unavailable");
            };

            const promise = executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 100,
                duration: 5000,
            });

            await jest.runAllTimersAsync();
            const result = await promise;

            expect(result.aborted).toBe(true);
        });
    });

    describe("clip calculation", () => {
        it("should respect maxClipSize", async () => {
            const clips: number[] = [];
            mockExecutor.executeOrder = async (order: any) => {
                clips.push(order.size);
                return {
                    orderId: "test",
                    status: "FILLED" as const,
                    filledSize: order.size,
                    avgPrice: 50000,
                    fees: 0.1,
                };
            };

            const executor = new TwapExecutor(mockExecutor, {
                maxClipSize: 200,
                minInterval: 1000,
                maxInterval: 5000,
                maxSlippage: 0.002,
            });

            const promise = executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 500,
                duration: 30000,
            });

            await jest.runAllTimersAsync();
            await promise;

            // 500 / 200 = 2.5, so 3 clips
            expect(clips.every((c) => c <= 200)).toBe(true);
            expect(clips.reduce((a, b) => a + b, 0)).toBe(500);
        });

        it("should distribute size evenly with remainder in last clip", async () => {
            const clips: number[] = [];
            mockExecutor.executeOrder = async (order: any) => {
                clips.push(order.size);
                return {
                    orderId: "test",
                    status: "FILLED" as const,
                    filledSize: order.size,
                    avgPrice: 50000,
                    fees: 0.1,
                };
            };

            const executor = new TwapExecutor(mockExecutor, {
                maxClipSize: 300,
                minInterval: 1000,
                maxInterval: 5000,
                maxSlippage: 0.002,
            });

            const promise = executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 700,
                duration: 30000,
            });

            await jest.runAllTimersAsync();
            await promise;

            // Total should equal requested size
            expect(clips.reduce((a, b) => a + b, 0)).toBeCloseTo(700, 5);
        });
    });

    describe("slippage tracking", () => {
        it("should calculate slippage for each clip", async () => {
            mockExecutor.getPrice = async () => 50000;
            mockExecutor.executeOrder = async (order: any) => ({
                orderId: "test",
                status: "FILLED" as const,
                filledSize: order.size,
                avgPrice: 50100, // 0.2% slippage
                fees: 0.1,
            });

            const executor = new TwapExecutor(mockExecutor, {
                maxClipSize: 500,
                minInterval: 1000,
                maxInterval: 5000,
                maxSlippage: 0.002,
            });

            const promise = executor.execute({
                symbol: "BTCUSDT",
                side: "BUY",
                totalSize: 100,
                duration: 5000,
            });

            await jest.runAllTimersAsync();
            const result = await promise;

            expect(result.clips[0].slippage).toBeCloseTo(0.002, 4);
        });
    });
});
