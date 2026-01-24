import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Config, Insight } from "../../src/types/index.js";

// define mocks
const mockGenerateContent = jest.fn<() => Promise<any>>();

// mock modules
jest.mock("@google/generative-ai", () => {
    return {
        GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
            getGenerativeModel: jest.fn().mockReturnValue({
                generateContent: mockGenerateContent,
            }),
        })),
    };
});

const mockReadFileSync = jest.fn<(path: any) => string>();
const mockExistsSync = jest.fn<(path: any) => boolean>();
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();

jest.mock("fs", () => {
    return {
        default: {
            readFileSync: (path: any) => mockReadFileSync(path),
            existsSync: (path: any) => mockExistsSync(path),
            mkdirSync: (path: any, options: any) =>
                mockMkdirSync(path, options),
            writeFileSync: (path: any, content: any) =>
                mockWriteFileSync(path, content),
        },
        readFileSync: (path: any) => mockReadFileSync(path),
        existsSync: (path: any) => mockExistsSync(path),
        mkdirSync: (path: any, options: any) => mockMkdirSync(path, options),
        writeFileSync: (path: any, content: any) =>
            mockWriteFileSync(path, content),
    };
});

// Import after mocks
import { TitanAnalyst } from "../../src/ai/TitanAnalyst.js";

describe("TitanAnalyst", () => {
    let analyst: TitanAnalyst;

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
        mockGenerateContent.mockReset();
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

        // Mock responses in sequence: Deep Think (text) -> Optimization (JSON)
        mockGenerateContent
            .mockResolvedValueOnce({
                response: {
                    text: () =>
                        "The volatility suggests we need a wider stop loss.",
                },
            })
            .mockResolvedValueOnce({
                response: {
                    text: () =>
                        JSON.stringify({
                            targetKey: "traps.oi_wipeout.stop_loss",
                            currentValue: 0.01,
                            suggestedValue: 0.015,
                            reasoning:
                                "OBSERVATION: High volatility detected.\nANALYSIS: Current stop loss is too tight.\nCONCLUSION: Wider stop loss needed.",
                            expectedImpact: {
                                pnlImprovement: 10,
                                riskChange: 1,
                                confidenceScore: 0.85,
                            },
                        }),
                },
            });

        const proposal = await analyst.proposeOptimization(insight, mockConfig);

        expect(mockGenerateContent).toHaveBeenCalledTimes(2);

        // Verify Deep Think call
        expect(mockGenerateContent).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                contents: expect.arrayContaining([
                    expect.objectContaining({
                        parts: expect.arrayContaining([
                            expect.objectContaining({
                                text: expect.stringContaining(
                                    'Perform a "Deep Think" analysis',
                                ),
                            }),
                        ]),
                    }),
                ]),
            }),
        );

        // Verify JSON call
        expect(mockGenerateContent).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                contents: expect.arrayContaining([
                    expect.objectContaining({
                        parts: expect.arrayContaining([
                            expect.objectContaining({
                                text: expect.stringContaining(
                                    "PREVIOUS REASONING:\nThe volatility suggests we need a wider stop loss.",
                                ),
                            }),
                        ]),
                    }),
                ]),
            }),
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

        // Mock Deep Think failure then success for Optimization
        mockGenerateContent
            .mockRejectedValueOnce(new Error("API Error"))
            .mockResolvedValueOnce({
                response: {
                    text: () =>
                        JSON.stringify({
                            targetKey: "traps.oi_wipeout.stop_loss",
                            currentValue: 0.01,
                            suggestedValue: 0.015,
                            reasoning: "Standard reasoning",
                            expectedImpact: {
                                pnlImprovement: 5,
                                riskChange: 0,
                                confidenceScore: 0.7,
                            },
                        }),
                },
            });

        const proposal = await analyst.proposeOptimization(insight, mockConfig);

        expect(mockGenerateContent).toHaveBeenCalledTimes(2);

        // Should still proceed to generateJSON even if deep think failed behavior check
        expect(mockGenerateContent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                contents: expect.arrayContaining([
                    expect.objectContaining({
                        parts: expect.arrayContaining([
                            expect.objectContaining({
                                text: expect.stringContaining(
                                    "Analysis skipped due to error",
                                ),
                            }),
                        ]),
                    }),
                ]),
            }),
        );
    });
});
