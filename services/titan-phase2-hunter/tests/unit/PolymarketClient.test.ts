/**
 * Unit Tests for Polymarket Client
 *
 * Tests API integration, rate limiting, authentication, and error handling
 * for the Polymarket prediction market interface.
 *
 * **Feature: titan-phase2-2026-modernization**
 * **Validates: Requirement 1.1**
 */

import {
    PolymarketClient,
    PolymarketClientConfig,
} from "../../src/oracle/PolymarketClient";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("PolymarketClient", () => {
    let client: PolymarketClient;
    const config: PolymarketClientConfig = {
        apiKey: "test-api-key",
        baseUrl: "https://api.test.polymarket.com",
        maxRequestsPerSecond: 100, // High limit for faster tests
        retryAttempts: 2,
        retryDelay: 10,
    };

    beforeEach(() => {
        mockFetch.mockReset();
        client = new PolymarketClient(config);
    });

    afterEach(() => {
        client.destroy();
    });

    describe("Connection Management", () => {
        it("should successfully connect when API is reachable", async () => {
            // Mock successful response
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [],
            });

            const connected = await client.connect();
            expect(connected).toBe(true);
            expect(client.getConnectionStatus().connected).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it("should fail to connect when API is unreachable", async () => {
            // Mock network error
            mockFetch.mockRejectedValueOnce(new Error("Network error"));

            const connected = await client.connect();
            expect(connected).toBe(false);
            expect(client.getConnectionStatus().connected).toBe(false);
            expect(client.getConnectionStatus().lastError).toBeDefined();
        });
    });

    describe("Market Fetching", () => {
        const mockMarket = {
            id: "market-123",
            question: "Will BTC hit 100k?",
            description: "Bitcoin price prediction",
            outcomes: ["Yes", "No"],
            outcomePrices: ["0.60", "0.40"],
            volume: "1000000",
            liquidity: "500000",
            endDate: "2026-12-31T00:00:00Z",
            active: true,
            closed: false,
            category: "Crypto",
            tags: ["Bitcoin", "BTC"],
        };

        it("should fetch markets with correct parameters", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [mockMarket],
            });

            const markets = await client.fetchMarkets({
                limit: 5,
                active: true,
            });

            expect(markets).toHaveLength(1);
            expect(markets[0].id).toBe("market-123");

            // Verify URL params
            const callArgs = mockFetch.mock.calls[0];
            const url = new URL(callArgs[0]);
            expect(url.searchParams.get("limit")).toBe("5");
            expect(url.searchParams.get("active")).toBe("true");
        });

        it("should fetch specific market by ID", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockMarket,
            });

            const market = await client.fetchMarket("market-123");
            expect(market).toEqual(mockMarket);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("/markets/market-123"),
                expect.anything(),
            );
        });

        it("should return null for non-existent market", async () => {
            // Mock 404 response indirectly via error throwing in client
            // Use mockResolvedValue to persist the 404 response for retries
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: "Not Found",
            });

            const market = await client.fetchMarket("non-existent");
            expect(market).toBeNull();
        });
    });

    describe("Rate Limiting & Retries", () => {
        it("should retry on temporary failures", async () => {
            // Configure client to retry enough times
            // We expect 3 calls (Fail, Fail, Success), so we need at least 3 attempts
            // Since loop is attempt <= retryAttempts
            (client as any).retryAttempts = 3;

            // Fail twice, succeed third time
            mockFetch
                .mockRejectedValueOnce(new Error("Network error 1"))
                .mockRejectedValueOnce(new Error("Network error 2"))
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [],
                });

            await client.fetchMarkets();
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });

        it("should handle 429 Rate Limit responses", async () => {
            // 429 then success
            mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    headers: new Map([["Retry-After", "1"]]),
                    json: async () => ({}),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [],
                });

            // Override sleep to be instant for test
            const sleepSpy = jest.spyOn(client as any, "sleep")
                .mockResolvedValue(undefined);

            await client.fetchMarkets();

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(sleepSpy).toHaveBeenCalled();
        });
    });

    describe("Category Specific Fetching", () => {
        it("should fetch crypto markets using keywords", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [],
            });

            await client.fetchCryptoMarkets();

            // Should search for 'bitcoin', 'btc', 'ethereum', etc.
            // 5 keywords defined in implementation
            expect(mockFetch).toHaveBeenCalledTimes(5);
        });
    });

    describe("Data Transformation", () => {
        it("should correctly convert market to prediction event", () => {
            // Mock market data
            const market = {
                id: "1",
                question: "Will Bitcoin reach $150k?",
                description: "Details...",
                outcomes: ["Yes", "No"],
                outcomePrices: ["0.35", "0.65"],
                volume: "2000000",
                liquidity: "150000",
                endDate: "2026-12-31",
                active: true,
                closed: false,
                category: "Crypto",
                tags: ["Bitcoin"],
            };

            const event = client.convertToPredictionEvent(market);

            expect(event.id).toBe("1");
            expect(event.probability).toBe(35); // 0.35 * 100
            expect(event.volume).toBe(2000000);
            expect(event.source).toBe("polymarket");
        });
    });
});
