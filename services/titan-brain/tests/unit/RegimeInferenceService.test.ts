import { RegimeInferenceService } from "../../src/services/RegimeInferenceService.js";
import { PowerLawMetricsSchemaV1, RegimeState } from "@titan/shared";
// @ts-ignore
import { NatsClient } from "@titan/shared";

// Define the shape of the mock NatsClient
type MockNatsClient = {
    subscribe: jest.Mock;
    publish: jest.Mock;
    isConnected: jest.Mock<boolean>;
};

describe("RegimeInferenceService", () => {
    let service: RegimeInferenceService;
    let mockNats: MockNatsClient;

    beforeEach(() => {
        mockNats = {
            subscribe: jest.fn(),
            publish: jest.fn(),
            isConnected: jest.fn().mockReturnValue(true),
        };
        // @ts-ignore - Mocking NatsClient
        service = new RegimeInferenceService(mockNats as any);
    });

    it("starts and subscribes to metrics topic", async () => {
        await service.start();
        expect(mockNats.subscribe).toHaveBeenCalledWith(
            "titan.data.powerlaw.metrics.v1.>",
            expect.any(Function),
        );
    });

    describe("inference logic", () => {
        // Helper to trigger processing
        const processMetrics = (metrics: any) => {
            // Access private method for testing
            (service as any).processMetrics(metrics);
        };

        it("infers CRASH when alpha <= 1.5", () => {
            processMetrics({
                symbol: "BTCUSDT",
                tail: { alpha: 1.4, confidence: 0.9 },
                vol_cluster: { state: "stable" },
                health: { status: "ok" },
            });
            expect(service.getCurrentRegime()).toBe(RegimeState.CRASH);
        });

        it("infers STABLE when alpha >= 3.0", () => {
            processMetrics({
                symbol: "BTCUSDT",
                tail: { alpha: 3.1, confidence: 0.9 },
                vol_cluster: { state: "expanding" }, // Alpha dominates
                health: { status: "ok" },
            });
            expect(service.getCurrentRegime()).toBe(RegimeState.STABLE);
        });

        it("infers VOLATILE_BREAKOUT when expanding vol and alpha < 2.5", () => {
            processMetrics({
                symbol: "BTCUSDT",
                tail: { alpha: 2.0, confidence: 0.9 },
                vol_cluster: { state: "expanding" },
                health: { status: "ok" },
            });
            expect(service.getCurrentRegime()).toBe(
                RegimeState.VOLATILE_BREAKOUT,
            );
        });

        it("infers MEAN_REVERSION when none of the above match (default)", () => {
            processMetrics({
                symbol: "BTCUSDT",
                tail: { alpha: 2.0, confidence: 0.9 },
                vol_cluster: { state: "stable" },
                health: { status: "ok" },
            });
            expect(service.getCurrentRegime()).toBe(RegimeState.MEAN_REVERSION);
        });

        it("publishes regime change event on transition", () => {
            // Start STABLE
            processMetrics({
                symbol: "BTCUSDT",
                tail: { alpha: 3.5, confidence: 0.9 },
                vol_cluster: { state: "stable" },
                health: { status: "ok" },
            });
            expect(service.getCurrentRegime()).toBe(RegimeState.STABLE);

            // Transition to CRASH
            processMetrics({
                symbol: "BTCUSDT",
                tail: { alpha: 1.2, confidence: 0.9 },
                vol_cluster: { state: "calm" },
                health: { status: "ok" },
            });
            expect(service.getCurrentRegime()).toBe(RegimeState.CRASH);

            expect(mockNats.publish).toHaveBeenCalledWith(
                "titan.evt.brain.regime.v1",
                expect.objectContaining({
                    regime: "CRASH",
                    source: "regime-inference-service",
                }),
            );
        });

        it("does not publish if regime remains same", () => {
            processMetrics({
                symbol: "BTCUSDT",
                tail: { alpha: 3.5, confidence: 0.9 },
                vol_cluster: { state: "stable" },
                health: { status: "ok" },
            });
            mockNats.publish.mockClear();

            processMetrics({
                symbol: "BTCUSDT",
                tail: { alpha: 3.2, confidence: 0.9 },
                vol_cluster: { state: "stable" },
                health: { status: "ok" },
            });
            expect(service.getCurrentRegime()).toBe(RegimeState.STABLE);
            expect(mockNats.publish).not.toHaveBeenCalled();
        });

        it("ignores non-BTCUSDT symbols", () => {
            processMetrics({
                symbol: "ETHUSDT",
                tail: { alpha: 1.0, confidence: 0.9 },
                vol_cluster: { state: "calm" },
                health: { status: "ok" },
            });
            // Should remain default (STABLE initialized)
            expect(service.getCurrentRegime()).toBe(RegimeState.STABLE);
            expect(mockNats.publish).not.toHaveBeenCalled();
        });
    });
});
