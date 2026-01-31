/**
 * Kimi K2 Provider Unit Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { KimiK2Provider } from "../KimiK2Provider.js";
import type { KimiK2Config } from "../types.js";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("KimiK2Provider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.KIMI_API_KEY = "test-api-key";
    });

    describe("constructor", () => {
        it("should throw if no API key is provided", () => {
            delete process.env.KIMI_API_KEY;
            delete process.env.MOONSHOT_API_KEY;

            expect(() => new KimiK2Provider({ type: "kimi" })).toThrow(
                "KIMI_API_KEY or MOONSHOT_API_KEY environment variable is required",
            );
        });

        it("should accept MOONSHOT_API_KEY as alternative", () => {
            delete process.env.KIMI_API_KEY;
            process.env.MOONSHOT_API_KEY = "moonshot-key";

            const provider = new KimiK2Provider({ type: "kimi" });
            expect(provider.type).toBe("kimi");
        });

        it("should use self-hosted endpoint when configured", () => {
            const config: KimiK2Config = {
                type: "kimi",
                selfHosted: true,
                localEndpoint: "http://localhost:8080/v1",
            };

            const provider = new KimiK2Provider(config);
            expect(provider.isAvailable()).toBe(true);
        });
    });

    describe("isAvailable", () => {
        it("should return true when API key is set and rate limit allows", () => {
            const provider = new KimiK2Provider({ type: "kimi" });
            expect(provider.isAvailable()).toBe(true);
        });
    });

    describe("complete", () => {
        it("should make OpenAI-compatible API call", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: { content: "Hello, world!" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 5,
                        total_tokens: 15,
                    },
                }),
            });

            const provider = new KimiK2Provider({ type: "kimi" });
            const response = await provider.complete({
                messages: [{ role: "user", content: "Hi" }],
            });

            expect(response.content).toBe("Hello, world!");
            expect(response.finishReason).toBe("stop");
            expect(response.usage?.totalTokens).toBe(15);

            expect(mockFetch).toHaveBeenCalledWith(
                "https://api.moonshot.ai/v1/chat/completions",
                expect.objectContaining({
                    method: "POST",
                    headers: expect.objectContaining({
                        Authorization: "Bearer test-api-key",
                    }),
                }),
            );
        });

        it("should handle rate limit errors with retry", async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    text: async () => "Rate limit exceeded",
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        choices: [{
                            message: { content: "Success after retry" },
                            finish_reason: "stop",
                        }],
                    }),
                });

            const provider = new KimiK2Provider({
                type: "kimi",
                maxRetries: 3,
            });

            const response = await provider.complete({
                messages: [{ role: "user", content: "Test" }],
            });

            expect(response.content).toBe("Success after retry");
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe("completeJSON", () => {
        it("should parse JSON response correctly", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: {
                                content:
                                    '```json\n{"name": "test", "value": 42}\n```',
                            },
                            finish_reason: "stop",
                        },
                    ],
                }),
            });

            const provider = new KimiK2Provider({ type: "kimi" });
            const result = await provider.completeJSON<
                { name: string; value: number }
            >({
                messages: [{ role: "user", content: "Give me JSON" }],
            });

            expect(result).toEqual({ name: "test", value: 42 });
        });
    });

    describe("agentSwarm", () => {
        it("should throw when swarm is disabled", async () => {
            const provider = new KimiK2Provider({
                type: "kimi",
                enableSwarm: false,
            });

            await expect(
                provider.agentSwarm({ prompt: "Test task" }),
            ).rejects.toThrow("Agent Swarm is not enabled");
        });

        it("should make swarm orchestration request", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: { content: "Swarm analysis complete" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: { completion_tokens: 100 },
                }),
            });

            const provider = new KimiK2Provider({ type: "kimi" });
            const response = await provider.agentSwarm({
                prompt: "Analyze multiple markets",
                maxSubAgents: 10,
            });

            expect(response.orchestratorSummary).toBe(
                "Swarm analysis complete",
            );
        });
    });

    describe("analyzeImage", () => {
        it("should throw when vision is disabled", async () => {
            const provider = new KimiK2Provider({
                type: "kimi",
                enableVision: false,
            });

            await expect(
                provider.analyzeImage({
                    image: "base64...",
                    prompt: "Analyze",
                }),
            ).rejects.toThrow("Visual analysis is not enabled");
        });

        it("should make vision API request", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: {
                                content:
                                    "I see a trading chart with a bullish pattern",
                            },
                            finish_reason: "stop",
                        },
                    ],
                }),
            });

            const provider = new KimiK2Provider({ type: "kimi" });
            const response = await provider.analyzeImage({
                image: "base64imagedata",
                prompt: "Analyze this chart",
            });

            expect(response.analysis).toContain("trading chart");
        });
    });
});
