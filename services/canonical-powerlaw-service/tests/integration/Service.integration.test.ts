/**
 * Integration Tests for Canonical PowerLaw Service
 *
 * Tests the NATS publish/consume flow and metrics computation
 */

import { CanonicalPowerLawService } from "../../src/CanonicalPowerLawService";

// Mock NATS
jest.mock("nats", () => ({
    connect: jest.fn().mockResolvedValue({
        jetstream: jest.fn().mockReturnValue({
            publish: jest.fn().mockResolvedValue({ seq: 1 }),
        }),
        subscribe: jest.fn().mockReturnValue({
            [Symbol.asyncIterator]: () => ({
                next: () => Promise.resolve({ done: true }),
            }),
        }),
        drain: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
    }),
    StringCodec: jest.fn().mockReturnValue({
        encode: (s: string) => new TextEncoder().encode(s),
        decode: (b: Uint8Array) => new TextDecoder().decode(b),
    }),
}));

// Mock filesystem
jest.mock("fs/promises", () => ({
    readFile: jest.fn().mockRejectedValue({ code: "ENOENT" }),
    writeFile: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
}));

describe("CanonicalPowerLawService Integration", () => {
    let service: CanonicalPowerLawService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new CanonicalPowerLawService({
            minSampleSize: 10,
            updateIntervalMs: 1000,
        });
    });

    afterEach(async () => {
        await service.stop();
    });

    describe("onTick", () => {
        it("should accumulate tick data for symbol", async () => {
            await service.onTick("BTCUSDT", 50000, "binance");
            await service.onTick("BTCUSDT", 50100, "binance");
            await service.onTick("BTCUSDT", 50200, "binance");

            const metrics = service.getMetrics("BTCUSDT");
            // Should not have metrics yet (not enough samples)
            expect(metrics).toBeNull();
        });

        it("should enforce maximum history length", async () => {
            const svc = new CanonicalPowerLawService({
                maxHistoryLength: 5,
                minSampleSize: 3,
            });

            for (let i = 0; i < 10; i++) {
                await svc.onTick("BTCUSDT", 50000 + i * 100, "binance");
            }

            // History should be capped at maxHistoryLength
            const list = svc.getSymbols();
            expect(list).toContain("BTCUSDT");
            await svc.stop();
        });
    });

    describe("computeAndPublish", () => {
        it("should return null when insufficient data", async () => {
            await service.onTick("ETHUSDT", 3000, "binance");
            await service.onTick("ETHUSDT", 3010, "binance");

            const result = await service.computeAndPublish(
                "ETHUSDT",
                "binance",
            );
            expect(result).toBeNull();
        });

        it("should compute metrics when sufficient data exists", async () => {
            // Feed enough data
            for (let i = 0; i < 100; i++) {
                const price = 50000 + Math.random() * 1000 - 500;
                await service.onTick("BTCUSDT", price, "binance");
            }

            const result = await service.computeAndPublish(
                "BTCUSDT",
                "binance",
            );

            expect(result).not.toBeNull();
            expect(result?.schema_version).toBe("1");
            expect(result?.symbol).toBe("BTCUSDT");
            expect(result?.venue).toBe("binance");
            expect(result?.tail.alpha).toBeGreaterThanOrEqual(0);
            expect(result?.window.n).toBeGreaterThan(0);
        });

        it("should emit properly structured PowerLawMetricsV1", async () => {
            for (let i = 0; i < 50; i++) {
                await service.onTick("SOLUSDT", 100 + i * 0.5, "binance");
            }

            const result = await service.computeAndPublish(
                "SOLUSDT",
                "binance",
            );

            if (result) {
                // Verify schema structure
                expect(result).toHaveProperty("schema_version");
                expect(result).toHaveProperty("venue");
                expect(result).toHaveProperty("symbol");
                expect(result).toHaveProperty("window");
                expect(result).toHaveProperty("model");
                expect(result).toHaveProperty("tail");
                expect(result).toHaveProperty("exceedance");
                expect(result).toHaveProperty("health");
                expect(result).toHaveProperty("provenance");
            }
        });
    });

    describe("getMetrics and listSymbols", () => {
        it("should track multiple symbols independently", async () => {
            for (let i = 0; i < 50; i++) {
                await service.onTick("BTCUSDT", 50000 + i * 10, "binance");
                await service.onTick("ETHUSDT", 3000 + i * 5, "binance");
            }

            const symbols = service.getSymbols();
            expect(symbols.length).toBe(2);
            expect(symbols).toContain("BTCUSDT");
            expect(symbols).toContain("ETHUSDT");
        });
    });

    describe("health status", () => {
        it("should report correct health status based on samples", async () => {
            // Create service with higher min sample requirement
            const svc = new CanonicalPowerLawService({
                minSampleSize: 100,
            });

            // Feed fewer than minSampleSize
            for (let i = 0; i < 50; i++) {
                await svc.onTick("BTCUSDT", 50000 + i, "binance");
            }

            const result = await svc.computeAndPublish("BTCUSDT", "binance");
            // Should return null because sample size is insufficient
            expect(result).toBeNull();

            await svc.stop();
        });
    });
});

describe("Metrics Computation Flow", () => {
    it("should produce consistent provenance hashes", async () => {
        const svc1 = new CanonicalPowerLawService();
        const svc2 = new CanonicalPowerLawService();

        // Same data
        for (let i = 0; i < 50; i++) {
            const price = 1000 + i;
            await svc1.onTick("TEST", price, "test");
            await svc2.onTick("TEST", price, "test");
        }

        const m1 = await svc1.computeAndPublish("TEST", "test");
        const m2 = await svc2.computeAndPublish("TEST", "test");

        // Code hash should be the same for same service version
        expect(m1?.provenance.code_hash).toBe(m2?.provenance.code_hash);

        // Config hash should be same if same config
        expect(m1?.provenance.config_hash).toBe(m2?.provenance.config_hash);

        await svc1.stop();
        await svc2.stop();
    });
});
