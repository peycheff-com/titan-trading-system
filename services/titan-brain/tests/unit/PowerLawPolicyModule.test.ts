import {
    DEFAULT_POLICY_CONFIG,
    PowerLawPolicyConfig,
    PowerLawPolicyModule,
} from "../../src/services/powerlaw/PowerLawPolicyModule.js";
import {
    POWER_LAW_SUBJECTS,
    PowerLawMetricsV1,
    TITAN_SUBJECTS,
} from "@titan/shared";
import type { NatsClient } from "@titan/shared";

// Mock NatsClient
const mockNats = {
    publish: jest.fn(),
    subscribe: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
} as unknown as NatsClient;

describe("PowerLawPolicyModule", () => {
    let module: PowerLawPolicyModule;
    let config: PowerLawPolicyConfig;

    beforeEach(() => {
        jest.clearAllMocks();
        config = { ...DEFAULT_POLICY_CONFIG, mode: "ENFORCEMENT" };
        module = new PowerLawPolicyModule(mockNats, config);
    });

    const baseMetrics: PowerLawMetricsV1 = {
        schema_version: "1",
        venue: "binance",
        symbol: "BTCUSDT",
        tf: "1m",
        window: { start_ts: 0, end_ts: 1000, n: 100 },
        model: { model_id: "hill-v1", params: {} },
        tail: {
            alpha: 3.0,
            confidence: 0.9,
            ci_low: 2.8,
            ci_high: 3.2,
            method: "hill",
            k: 10,
            u: 0,
        },
        exceedance: { prob: 0.01 },
        vol_cluster: { state: "stable", persistence: 0.5, sigma: 0.01 },
        health: { status: "ok", reason: "All good" },
        provenance: {
            code_hash: "abc",
            config_hash: "123",
            data_fingerprint: "xyz",
            calc_ts: 1000,
            trace_id: "uuid",
        },
    };

    it("should enforce fit quality confidence threshold", async () => {
        // Low confidence metrics
        const metrics: PowerLawMetricsV1 = {
            ...baseMetrics,
            tail: { ...baseMetrics.tail, confidence: 0.3 }, // Below 0.5 threshold
        };

        await module.processMetrics(metrics);

        expect(mockNats.publish).toHaveBeenCalledWith(
            POWER_LAW_SUBJECTS.constraintsV1("binance", "default", "BTCUSDT"),
            expect.objectContaining({
                limits: expect.objectContaining({
                    // 0.75x reduction for low confidence
                    max_pos_notional: Math.round(
                        DEFAULT_POLICY_CONFIG.defaultMaxPosNotional * 0.75,
                    ),
                    max_leverage: 2.25, // 3.0 * 0.75
                }),
                origin: expect.objectContaining({
                    reason_codes: expect.arrayContaining(["LOW_CONFIDENCE"]),
                }),
            }),
        );
    });

    it("should enforce critical alpha constraints", async () => {
        // Critical Alpha (< 2.0)
        const metrics: PowerLawMetricsV1 = {
            ...baseMetrics,
            tail: { ...baseMetrics.tail, alpha: 1.5 },
        };

        await module.processMetrics(metrics);

        expect(mockNats.publish).toHaveBeenCalledWith(
            POWER_LAW_SUBJECTS.constraintsV1("binance", "default", "BTCUSDT"),
            expect.objectContaining({
                limits: expect.objectContaining({
                    // 0.25x reduction for critical alpha
                    max_pos_notional: Math.round(
                        DEFAULT_POLICY_CONFIG.defaultMaxPosNotional * 0.25,
                    ),
                    max_leverage: 1.5, // 3.0 * 0.5
                }),
                risk_mode: "EMERGENCY",
            }),
        );
    });

    it("should enforce volatility cluster constraints", async () => {
        const metrics: PowerLawMetricsV1 = {
            ...baseMetrics,
            vol_cluster: { ...baseMetrics.vol_cluster, state: "expanding" },
        };

        await module.processMetrics(metrics);

        expect(mockNats.publish).toHaveBeenCalledWith(
            POWER_LAW_SUBJECTS.constraintsV1("binance", "default", "BTCUSDT"),
            expect.objectContaining({
                limits: expect.objectContaining({
                    // 0.5x reduction for vol cluster
                    max_pos_notional: Math.round(
                        DEFAULT_POLICY_CONFIG.defaultMaxPosNotional * 0.5,
                    ),
                }),
                execution_profile: expect.objectContaining({
                    tif: { type: "IOC", ttl_ms: 5000 }, // IOC enforced
                }),
                origin: expect.objectContaining({
                    reason_codes: expect.arrayContaining(["VOL_EXPANDING"]),
                }),
            }),
        );
    });

    it("should emit impact events in ENFORCEMENT mode", async () => {
        const metrics: PowerLawMetricsV1 = {
            ...baseMetrics,
            tail: { ...baseMetrics.tail, alpha: 1.5 }, // Critical
        };

        await module.processMetrics(metrics);

        expect(mockNats.publish).toHaveBeenCalledWith(
            TITAN_SUBJECTS.EVT.POWERLAW.IMPACT,
            expect.objectContaining({
                severity: "CRITICAL",
                impactType: "CONSTRAINT_TIGHTENED",
                metricsSnapshot: expect.objectContaining({ alpha: 1.5 }),
            }),
        );
    });

    it("should respect SHADOW mode (no publish)", async () => {
        const shadowModule = new PowerLawPolicyModule(mockNats, {
            mode: "SHADOW",
        });
        await shadowModule.processMetrics(baseMetrics);

        // SHADOW mode should log but NOT publish constraints
        expect(mockNats.publish).not.toHaveBeenCalled();
    });
});
