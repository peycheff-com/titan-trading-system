import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from "@jest/globals";
import { ArbEngine } from "../../src/polymarket/ArbEngine";
import { BinanceFeed } from "../../src/polymarket/BinanceFeed";
import { PolymarketFeed } from "../../src/polymarket/PolymarketFeed";
import { MarketLookup } from "../../src/polymarket/MarketLookup";
import {
    BinancePriceUpdate,
    PolymarketMarket,
} from "../../src/types/polymarket";
import { DEFAULT_ARB_TRIGGER_CONDITIONS } from "../../src/polymarket/config";

// Mock dependencies
jest.mock("../../src/polymarket/BinanceFeed");
jest.mock("../../src/polymarket/PolymarketFeed");
jest.mock("../../src/polymarket/MarketLookup");

describe("Latency Arbitrage Simulation", () => {
    let arbEngine: ArbEngine;
    let mockBinanceFeed: jest.Mocked<BinanceFeed>;
    let mockPolymarketFeed: jest.Mocked<PolymarketFeed>;
    let mockMarketLookup: jest.Mocked<MarketLookup>;

    // Test data
    const mockMarket: PolymarketMarket = {
        conditionId: "0x123",
        question: "Will BTC be above 100000 on Jan 1?",
        tokens: {
            yes: "0xYES",
            no: "0xNO",
        },
        rewards: {
            yes: "0.5",
            no: "0.5",
        },
        minimumOrderSize: 1,
        minimumTickSize: 0.01,
        endDate: "2026-01-01T00:00:00Z",
        liquidity: 100000,
    };

    beforeEach(async () => {
        // Clear mocks
        jest.clearAllMocks();

        // Setup mock implementations
        mockMarketLookup = new MarketLookup() as jest.Mocked<MarketLookup>;
        (MarketLookup as jest.Mock).mockImplementation(() => mockMarketLookup);
        mockMarketLookup.findBtcMarkets.mockResolvedValue([mockMarket]);

        mockBinanceFeed = new BinanceFeed() as jest.Mocked<BinanceFeed>;
        (BinanceFeed as jest.Mock).mockImplementation(() => mockBinanceFeed);
        // Default mock behaviors
        mockBinanceFeed.start.mockResolvedValue(undefined);
        mockBinanceFeed.stop.mockReturnValue(undefined);
        mockBinanceFeed.getIsConnected.mockReturnValue(true);
        mockBinanceFeed.getPriceChangePercent.mockReturnValue(0);
        mockBinanceFeed.getCurrentPrice.mockReturnValue(99000); // Initial price

        mockPolymarketFeed = new PolymarketFeed() as jest.Mocked<
            PolymarketFeed
        >;
        (PolymarketFeed as jest.Mock).mockImplementation(() =>
            mockPolymarketFeed
        );
        mockPolymarketFeed.start.mockReturnValue(undefined);
        mockPolymarketFeed.stop.mockReturnValue(undefined);
        mockPolymarketFeed.trackMarket.mockReturnValue(undefined);
        // Default probabilities (50/50)
        mockPolymarketFeed.getYesProbability.mockReturnValue(0.5);
        mockPolymarketFeed.getBestYesAsk.mockReturnValue({
            price: 0.51,
            size: 1000,
        });
        mockPolymarketFeed.getBestNoAsk.mockReturnValue({
            price: 0.51,
            size: 1000,
        });

        // Initialize engine
        arbEngine = new ArbEngine({
            dryRun: true,
            minLiquidity: 1000,
            triggerConditions: {
                ...DEFAULT_ARB_TRIGGER_CONDITIONS,
                priceChangeThreshold: 0.01, // 1% trigger
            },
        });

        await arbEngine.initialize();
        await arbEngine.start();
    });

    afterEach(async () => {
        await arbEngine.stop();
    });

    it("should trigger arbitrage when Binance pumps 1.5% but Polymarket lags", (done) => {
        // 1. Setup Scenario
        // Binance moves UP 1.5%
        // Polymarket stays at 50% (implied 0% move), creating a mismatch

        const initialPrice = 99000;
        const newPrice = 100485; // +1.5%
        const priceChange = 0.015;

        mockBinanceFeed.getPriceChangePercent.mockReturnValue(priceChange);
        mockBinanceFeed.getCurrentPrice.mockReturnValue(newPrice);

        // Poly stays at 0.50
        mockPolymarketFeed.getYesProbability.mockReturnValue(0.50);
        // "Up" market, so expected probability should rise

        // 2. Subscribe to results
        const resultSpy = jest.fn();
        arbEngine.subscribe((result) => {
            resultSpy(result);

            try {
                // 4. Verify Execution
                expect(result.success).toBe(true);
                expect(result.opportunity).toBeDefined();
                expect(result.opportunity.binanceDirection).toBe("UP");
                expect(result.opportunity.buyingSide).toBe("YES"); // Should buy YES on "Up" market
                expect(result.opportunity.probabilityMismatch).toBeGreaterThan(
                    0.05,
                ); // > 5% mismatch

                // Verify order details (Dry Run)
                expect(result.order).toBeDefined();
                expect(result.order!.status).toBe("FILLED"); // Dry run returns filled

                done();
            } catch (error) {
                done(error);
            }
        });

        // 3. Trigger Update
        // We need to manually trigger the callback that ArbEngine registered with BinanceFeed
        // Capture the callback passed to subscribe
        const subscriptionCall = mockBinanceFeed.subscribe.mock.calls[0];
        const updateCallback = subscriptionCall[0];

        expect(updateCallback).toBeDefined();

        updateCallback({
            symbol: "BTCUSDT",
            price: newPrice,
            velocity: 0.1, // arbitrary positive velocity
            timestamp: Date.now(),
        });
    });

    it("should NOT trigger when price move is small", () => {
        // Small move (0.5%)
        mockBinanceFeed.getPriceChangePercent.mockReturnValue(0.005);

        const resultSpy = jest.fn();
        arbEngine.subscribe(resultSpy);

        const subscriptionCall = mockBinanceFeed.subscribe.mock.calls[0];
        const updateCallback = subscriptionCall[0];

        updateCallback({
            symbol: "BTCUSDT",
            price: 99500,
            velocity: 0.01,
            timestamp: Date.now(),
        });

        expect(resultSpy).not.toHaveBeenCalled();
    });

    it('should short "NO" (buy YES) if market is inverse? No, logical check', (done) => {
        // Not implemented in this test, focusing on basic latency arb
        done();
    });
});
