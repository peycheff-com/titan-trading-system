import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Config, Insight } from "../../src/types/index.js";

// define mocks
const mockGenerate = jest.fn<() => Promise<string>>();
const mockGenerateJSON = jest.fn<() => Promise<any>>();
const mockCanMakeRequest = jest.fn<() => boolean>().mockReturnValue(true);
const mockGetCurrentRequestCount = jest.fn<() => number>().mockReturnValue(0);
const mockGetTimeUntilNextSlot = jest.fn<() => number>().mockReturnValue(0);

const mockReadFileSync = jest.fn<(path: any) => string>();
const mockExistsSync = jest.fn<(path: any) => boolean>();

// mock modules
jest.unstable_mockModule("../../src/ai/GeminiClient.js", () => {
    return {
        GeminiClient: jest.fn().mockImplementation(() => {
            return {
                generate: mockGenerate,
                generateJSON: mockGenerateJSON,
                canMakeRequest: mockCanMakeRequest,
                getCurrentRequestCount: mockGetCurrentRequestCount,
                getTimeUntilNextSlot: mockGetTimeUntilNextSlot,
            };
        }),
    };
});

jest.unstable_mockModule("fs", () => {
    return {
        default: {
            readFileSync: mockReadFileSync,
            existsSync: mockExistsSync,
        },
        readFileSync: mockReadFileSync,
        existsSync: mockExistsSync,
    };
});

// Import the module under test dynamically
const { TitanAnalyst } = await import("../../src/ai/TitanAnalyst.js");

describe("TitanAnalyst", () => {
    let analyst: any; // Type as any to avoid complex type reconstruction just for tests

    const mockConfig: Config = {
        traps: {
            oi_wipeout: {
                enabled: true,
                stop_loss: 0.01,
                take_profit: 0.02,
                risk_per_trade: 0.01,
                max_leverage: 5,
                min_confidence: 0.7,
                cooldown_period: 300,
            },
        },
        risk: {
            max_daily_loss: 0.05,
            max_position_size: 0.1,
            max_open_positions: 3,
            emergency_flatten_threshold: 0.1,
        },
        execution: {
            latency_penalty: 100,
            slippage_model: "realistic",
            limit_chaser_enabled: true,
            max_fill_time: 1000,
        },
    } as any;

    beforeEach(() => {
        // Reset mocks
        mockGenerate.mockReset();
        mockGenerateJSON.mockReset();
        mockReadFileSync.mockReset();
        mockExistsSync.mockReset();

        // Setup fs mocks
        mockReadFileSync.mockImplementation((path: any) => {
            const p = path.toString();
            if (p.endsWith("deep_think.txt")) {
                return 'Perform a "Deep Think" analysis on the following context:\n{context}';
            }
            if (p.endsWith("optimization.txt")) {
                return "Optimization Prompt with {insightText} and {configSchema} and {relevantConfigValues}";
            }
            if (p.endsWith("analysis.txt")) {
                return "Analysis Prompt";
            }
            // Default fallback
            return JSON.stringify(mockConfig);
        });
        mockExistsSync.mockReturnValue(true);

        analyst = new TitanAnalyst();
    });

    it("should use Deep Think before optimizing", async () => {
        const insight: Insight = {
            id: 1,
            timestamp: Date.now(),
            topic: "Stop Loss Tightness",
            text: "Stop losses are being hit too frequently in high volatility",
            confidence: 0.9,
        };

        // Mock Deep Think response
        mockGenerate.mockResolvedValue(
            "The volatility suggests we need a wider stop loss.",
        );

        // Mock Optimization response
        mockGenerateJSON.mockResolvedValue({
            targetKey: "traps.oi_wipeout.stop_loss",
            currentValue: 0.01,
            suggestedValue: 0.015,
            reasoning: "Wider stop loss needed",
            expectedImpact: {
                pnlImprovement: 10,
                riskChange: 1,
                confidenceScore: 0.85,
            },
        });

        const proposal = await analyst.proposeOptimization(insight, mockConfig);

        expect(mockGenerate).toHaveBeenCalledTimes(1);
        expect(mockGenerate).toHaveBeenCalledWith(
            expect.stringContaining('Perform a "Deep Think" analysis'),
            expect.anything(),
        );

        expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
        expect(mockGenerateJSON).toHaveBeenCalledWith(
            expect.stringContaining(
                "PREVIOUS REASONING:\nThe volatility suggests we need a wider stop loss.",
            ),
            expect.anything(),
        );

        expect(proposal.targetKey).toBe("traps.oi_wipeout.stop_loss");
        expect(proposal.suggestedValue).toBe(0.015);
    });

    it("should handle Deep Think failure gracefully", async () => {
        const insight: Insight = {
            id: 2,
            timestamp: Date.now(),
            topic: "Test Topic",
            text: "Test Insight",
            confidence: 0.8,
        };

        // Mock Deep Think failure
        mockGenerate.mockRejectedValue(new Error("API Error"));

        // Mock Optimization response
        mockGenerateJSON.mockResolvedValue({
            targetKey: "traps.oi_wipeout.stop_loss",
            currentValue: 0.01,
            suggestedValue: 0.015,
            reasoning: "Standard reasoning",
            expectedImpact: {
                pnlImprovement: 5,
                riskChange: 0,
                confidenceScore: 0.7,
            },
        });

        const proposal = await analyst.proposeOptimization(insight, mockConfig);

        expect(mockGenerate).toHaveBeenCalledTimes(1);

        // Should still proceed to generateJSON even if deep think failed
        expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
        expect(mockGenerateJSON).toHaveBeenCalledWith(
            expect.stringContaining("Analysis skipped due to error"),
            expect.anything(),
        );
    });
});
