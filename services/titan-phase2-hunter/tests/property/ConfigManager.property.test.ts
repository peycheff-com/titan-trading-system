/**
 * Property Tests for Enhanced 2026 Configuration Manager
 *
 * Verifies that the configuration validation logic holds true for the entire
 * range of possible inputs, ensuring system stability under any configuration.
 *
 * **Feature: titan-phase2-2026-modernization**
 * **Property 20: Configuration Parameter Validation**
 * **Validates: Requirements 16.1-16.7**
 */

import fc from "fast-check";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { ConfigManager as Enhanced2026ConfigManager } from "../../src/config/ConfigManager";

// Mock @titan/shared to avoid crypto/environment issues in ConfigVersionHistory
jest.mock("@titan/shared", () => {
    const mockSharedManager = {
        loadPhaseConfig: jest.fn().mockResolvedValue(undefined),
        getPhaseConfig: jest.fn().mockReturnValue({}),
        savePhaseConfig: jest.fn(),
        on: jest.fn(),
        emit: jest.fn(),
    };
    return {
        getConfigManager: jest.fn().mockReturnValue(mockSharedManager),
        ConfigManager: jest.fn(),
        PhaseConfig: {},
    };
});

describe("Enhanced2026ConfigManager Property Tests", () => {
    const testConfigDir = "./test-config-property-2026";

    beforeEach(() => {
        if (existsSync(testConfigDir)) {
            rmSync(testConfigDir, { recursive: true, force: true });
        }
        mkdirSync(testConfigDir, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(testConfigDir)) {
            rmSync(testConfigDir, { recursive: true, force: true });
        }
    });

    // Requirement 16.1: Oracle Veto Threshold (30-70%)
    it("should only accept valid Oracle veto thresholds (30-70%)", () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 100 }), (threshold) => {
                const manager = new Enhanced2026ConfigManager(testConfigDir);
                // Ensure fresh state
                manager.resetToDefaults();

                const isValid = threshold >= 30 && threshold <= 70;

                if (isValid) {
                    expect(() =>
                        manager.updateOracleConfig({ vetoThreshold: threshold })
                    ).not.toThrow();
                    expect(manager.getConfig().oracle.vetoThreshold).toBe(
                        threshold,
                    );
                } else {
                    expect(() =>
                        manager.updateOracleConfig({ vetoThreshold: threshold })
                    ).toThrow();
                }
            }),
        );
    });

    // Requirement 16.1: Oracle Conviction Multiplier Max (1.0-2.0)
    it("should only accept valid Oracle conviction multipliers (1.0-2.0)", () => {
        fc.assert(
            fc.property(fc.double({ min: 0.1, max: 3.0 }), (multiplier) => {
                const manager = new Enhanced2026ConfigManager(testConfigDir);
                manager.resetToDefaults();

                const isValid = multiplier >= 1.0 && multiplier <= 2.0;

                if (isValid) {
                    expect(() =>
                        manager.updateOracleConfig({
                            convictionMultiplierMax: multiplier,
                        })
                    ).not.toThrow();
                } else {
                    expect(() =>
                        manager.updateOracleConfig({
                            convictionMultiplierMax: multiplier,
                        })
                    ).toThrow();
                }
            }),
        );
    });

    // Requirement 16.2: Flow Validator Sweep Threshold (3-10 levels)
    it("should only accept valid sweep thresholds (3-10)", () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 20 }), (threshold) => {
                const manager = new Enhanced2026ConfigManager(testConfigDir);
                manager.resetToDefaults();

                const isValid = threshold >= 3 && threshold <= 10;

                if (isValid) {
                    expect(() =>
                        manager.updateFlowValidatorConfig({
                            sweepThreshold: threshold,
                        })
                    ).not.toThrow();
                } else {
                    expect(() =>
                        manager.updateFlowValidatorConfig({
                            sweepThreshold: threshold,
                        })
                    ).toThrow();
                }
            }),
        );
    });

    // Requirement 16.3: Bot Trap Precision Threshold (0.1-1.0%)
    it("should only accept valid precision thresholds (0.1-1.0%)", () => {
        fc.assert(
            fc.property(fc.double({ min: 0.01, max: 2.0 }), (threshold) => {
                const manager = new Enhanced2026ConfigManager(testConfigDir);
                manager.resetToDefaults();

                const isValid = threshold >= 0.1 && threshold <= 1.0;

                if (isValid) {
                    expect(() =>
                        manager.updateBotTrapConfig({
                            precisionThreshold: threshold,
                        })
                    ).not.toThrow();
                } else {
                    expect(() =>
                        manager.updateBotTrapConfig({
                            precisionThreshold: threshold,
                        })
                    ).toThrow();
                }
            }),
        );
    });

    // Requirement 16.4: Global Exchange Weights (20-50%)
    it("should validate exchange weights sum to 100% and are within range", () => {
        // Generator for valid weights
        const validWeightsArb = fc.tuple(
            fc.integer({ min: 20, max: 50 }),
            fc.integer({ min: 20, max: 50 }),
            fc.integer({ min: 20, max: 50 }),
        ).filter(([w1, w2, w3]) => w1 + w2 + w3 === 100);

        fc.assert(
            fc.property(validWeightsArb, ([w1, w2, w3]) => {
                const manager = new Enhanced2026ConfigManager(testConfigDir);
                manager.resetToDefaults();

                expect(() =>
                    manager.updateGlobalAggregatorConfig({
                        exchangeWeights: {
                            binance: w1,
                            coinbase: w2,
                            kraken: w3,
                        },
                    })
                ).not.toThrow();
            }),
        );

        // Generator for invalid weights (sum != 100)
        const invalidSumArb = fc.tuple(
            fc.integer({ min: 20, max: 50 }),
            fc.integer({ min: 20, max: 50 }),
            fc.integer({ min: 20, max: 50 }),
        ).filter(([w1, w2, w3]) => w1 + w2 + w3 !== 100);

        fc.assert(
            fc.property(invalidSumArb, ([w1, w2, w3]) => {
                const manager = new Enhanced2026ConfigManager(testConfigDir);
                manager.resetToDefaults();

                expect(() =>
                    manager.updateGlobalAggregatorConfig({
                        exchangeWeights: {
                            binance: w1,
                            coinbase: w2,
                            kraken: w3,
                        },
                    })
                ).toThrow();
            }),
        );
    });

    // Requirement 16.5: Conviction Multiplier Range
    it("should enforce min multiplier < max multiplier", () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0.5, max: 1.5 }),
                fc.double({ min: 1.0, max: 2.0 }),
                (min, max) => {
                    const manager = new Enhanced2026ConfigManager(
                        testConfigDir,
                    );
                    manager.resetToDefaults();

                    const isValid = min < max;

                    if (isValid) {
                        expect(() =>
                            manager.updateConvictionConfig({
                                minMultiplier: min,
                                maxMultiplier: max,
                            })
                        ).not.toThrow();
                    } else {
                        expect(() =>
                            manager.updateConvictionConfig({
                                minMultiplier: min,
                                maxMultiplier: max,
                            })
                        ).toThrow();
                    }
                },
            ),
        );
    });

    // Requirement 16.6: Integrity Preservation
    it("should maintain configuration integrity through randomized partial updates", () => {
        // Generate valid partial updates
        const oracleUpdateArb = fc.record({
            vetoThreshold: fc.integer({ min: 30, max: 70 }),
            convictionMultiplierMax: fc.double({
                min: 1.0,
                max: 2.0,
                noNaN: true,
            }),
        }, { requiredKeys: [] });

        const flowUpdateArb = fc.record({
            sweepThreshold: fc.integer({ min: 3, max: 10 }),
            icebergDensityThreshold: fc.integer({ min: 0, max: 100 }),
        }, { requiredKeys: [] });

        fc.assert(
            fc.property(
                oracleUpdateArb,
                flowUpdateArb,
                (oracleUpdate, flowUpdate) => {
                    const manager = new Enhanced2026ConfigManager(
                        testConfigDir,
                    );
                    manager.resetToDefaults();

                    // Apply updates
                    if (Object.keys(oracleUpdate).length > 0) {
                        manager.updateOracleConfig(oracleUpdate);
                    }

                    if (Object.keys(flowUpdate).length > 0) {
                        manager.updateFlowValidatorConfig(flowUpdate);
                    }

                    // Verify state is valid
                    const config = manager.getConfig();

                    // Validation is implicit in update/save - if we get here and config is updated, it's valid
                    expect(config).toBeDefined();

                    // Verify updates persisted
                    if (oracleUpdate.vetoThreshold) {
                        expect(config.oracle.vetoThreshold).toBe(
                            oracleUpdate.vetoThreshold,
                        );
                    }
                    if (flowUpdate.sweepThreshold) {
                        expect(config.flowValidator.sweepThreshold).toBe(
                            flowUpdate.sweepThreshold,
                        );
                    }
                },
            ),
        );
    });
});
