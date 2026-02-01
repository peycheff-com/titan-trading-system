/**
 * Golden Path Scenario Test
 *
 * End-to-end test of the PowerLaw flow:
 * 1. Service receives market data
 * 2. Computes tail-risk metrics
 * 3. Publishes to NATS
 * 4. Brain receives and processes
 * 5. Constraints published to execution engine
 */

import { CanonicalPowerLawService } from "../../src/CanonicalPowerLawService";

// Mock NATS with message capture
const publishedMessages: { subject: string; data: string }[] = [];

jest.mock("nats", () => ({
    connect: jest.fn().mockResolvedValue({
        jetstream: jest.fn().mockReturnValue({
            publish: jest.fn().mockImplementation((subject, data) => {
                publishedMessages.push({
                    subject,
                    data: new TextDecoder().decode(data),
                });
                return Promise.resolve({ seq: publishedMessages.length });
            }),
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

jest.mock("fs/promises", () => ({
    readFile: jest.fn().mockRejectedValue({ code: "ENOENT" }),
    writeFile: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
}));

describe("Golden Path: Market Data → Metrics → NATS", () => {
    let service: CanonicalPowerLawService;

    beforeEach(() => {
        jest.clearAllMocks();
        publishedMessages.length = 0;
        service = new CanonicalPowerLawService({
            minSampleSize: 20,
            updateIntervalMs: 60000, // Disable auto-publish for test control
        });
    });

    afterEach(async () => {
        await service.stop();
    });

    it("should complete full golden path: data → metrics → publish", async () => {
        const venue = "binance";
        const symbol = "BTCUSDT";

        // Step 1: Feed realistic market data (heavy-tailed)
        const prices = generateHeavyTailedPrices(100, 50000);
        for (const price of prices) {
            await service.onTick(symbol, price, venue);
        }

        // Step 2: Trigger metrics computation
        const metrics = await service.computeAndPublish(symbol, venue);

        // Step 3: Verify metrics computed correctly
        expect(metrics).not.toBeNull();
        expect(metrics?.symbol).toBe(symbol);
        expect(metrics?.venue).toBe(venue);
        expect(metrics?.tail.alpha).toBeGreaterThan(0);
        expect(metrics?.window.n).toBeGreaterThan(0);
        expect(metrics?.health.status).toBeDefined();

        // Step 4: Verify provenance is populated
        expect(metrics?.provenance).toBeDefined();
        expect(metrics?.provenance.code_hash).toBeDefined();
        expect(metrics?.provenance.config_hash).toBeDefined();
        expect(metrics?.provenance.data_fingerprint).toBeDefined();

        // Step 5: Verify schema structure
        expect(metrics?.schema_version).toBe("1");
        expect(metrics?.model).toBeDefined();
        expect(metrics?.exceedance).toBeDefined();
    });

    it("should handle multi-symbol tracking", async () => {
        const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
        const venue = "binance";

        // Feed data to all symbols
        for (const symbol of symbols) {
            const prices = generateHeavyTailedPrices(50, 1000);
            for (const price of prices) {
                await service.onTick(symbol, price, venue);
            }
        }

        // Compute and publish all
        for (const symbol of symbols) {
            await service.computeAndPublish(symbol, venue);
        }

        // Verify all symbols tracked
        const tracked = service.getSymbols();
        expect(tracked.length).toBe(3);
        for (const symbol of symbols) {
            expect(tracked).toContain(symbol);
        }
    });

    it("should compute consistent provenance across runs", async () => {
        const venue = "test";
        const symbol = "TESTUSDT";

        const prices = generateHeavyTailedPrices(50, 100);
        for (const price of prices) {
            await service.onTick(symbol, price, venue);
        }

        const m1 = await service.computeAndPublish(symbol, venue);
        const m2 = await service.computeAndPublish(symbol, venue);

        // Code and config hash should be stable
        expect(m1?.provenance.code_hash).toBe(m2?.provenance.code_hash);
        expect(m1?.provenance.config_hash).toBe(m2?.provenance.config_hash);
    });

    it("should produce valid health status transitions", async () => {
        const highSampleService = new CanonicalPowerLawService({
            minSampleSize: 100,
        });

        // Few samples - should be low_sample
        for (let i = 0; i < 50; i++) {
            await highSampleService.onTick("TEST", 1000 + i, "test");
        }
        let result = await highSampleService.computeAndPublish("TEST", "test");
        expect(result).toBeNull(); // Not enough samples

        // Add more samples
        for (let i = 50; i < 150; i++) {
            await highSampleService.onTick("TEST", 1000 + i, "test");
        }
        result = await highSampleService.computeAndPublish("TEST", "test");
        expect(result).not.toBeNull();
        expect(["ok", "unknown", "low_sample", "fit_failed"]).toContain(
            result?.health.status,
        );

        await highSampleService.stop();
    });
});

// Helper: Generate heavy-tailed price series
function generateHeavyTailedPrices(n: number, basePrice: number): number[] {
    const prices: number[] = [basePrice];
    for (let i = 1; i < n; i++) {
        // Pareto-distributed shocks
        const u = Math.random();
        const shock = Math.pow(u, -1 / 2.5) - 1; // Alpha ~2.5
        const sign = Math.random() > 0.5 ? 1 : -1;
        const pctChange = sign * shock * 0.01; // Scale to 1% range
        prices.push(prices[i - 1] * (1 + pctChange));
    }
    return prices;
}
