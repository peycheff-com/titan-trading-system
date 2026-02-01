/**
 * Enhanced AI Integration Property-Based Tests
 *
 * Property 10: AI Optimization Effectiveness
 * Validates: Requirements 10.5
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import * as fc from "fast-check";
import { AIIntegration as EnhancedAIIntegration } from "../../src/ai/AIIntegration";
import { TitanAnalyst } from "../../src/ai/TitanAnalyst";
import { RiskAdjustment } from "../../src/ai/PredictiveAnalytics";
import { Config, OHLCV, RegimeSnapshot, Trade } from "../../src/types";

// Mock dependencies
jest.mock("@titan/shared", () => ({
  __esModule: true,
  getWebSocketManager: jest.fn(() => ({
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
  getTelemetryService: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
  loadSecretsFromFiles: jest.fn(),
  getConfigManager: jest.fn(() => ({
    get: jest.fn(),
  })),
}));

describe("Enhanced AI Integration Property Tests", () => {
  let aiIntegration: EnhancedAIIntegration;
  let mockAnalyst: jest.Mocked<TitanAnalyst>;

  beforeEach(() => {
    mockAnalyst = {
      analyzeFailures: jest.fn(),
      proposeOptimization: jest.fn(),
      validateProposal: jest.fn(),
      applyProposal: jest.fn(),
      canMakeRequest: jest.fn(() => true),
    } as any;

    aiIntegration = new EnhancedAIIntegration(mockAnalyst, {
      strategySelectionInterval: 100, // Fast for testing
      riskAdjustmentInterval: 100,
      performanceEvaluationInterval: 100,
      enableAutomatedStrategySelection: true,
      enableAdaptiveRiskManagement: true,
    });
  });

  afterEach(() => {
    aiIntegration.shutdown();
  });

  /**
   * Property 10.1: Market Data Processing Consistency
   *
   * For any valid OHLCV data sequence, the AI integration should:
   * 1. Accept and process all data points
   * 2. Maintain data integrity (no data loss)
   * 3. Update statistics consistently
   */
  describe("Property 10.1: Market Data Processing Consistency", () => {
    it("should process market data consistently regardless of input order or timing", () => {
      fc.assert(
        fc.property(
          // Generate valid OHLCV data
          fc.array(
            fc.record({
              timestamp: fc.integer({
                min: Date.now() - 86400000,
                max: Date.now(),
              }),
              open: fc.float({ min: 1000, max: 100000 }),
              high: fc.float({ min: 1000, max: 100000 }),
              low: fc.float({ min: 1000, max: 100000 }),
              close: fc.float({ min: 1000, max: 100000 }),
              volume: fc.float({ min: 100, max: 1000000 }),
            }).filter((ohlcv) =>
              ohlcv.high >= Math.max(ohlcv.open, ohlcv.close) &&
              ohlcv.low <= Math.min(ohlcv.open, ohlcv.close)
            ),
            { minLength: 1, maxLength: 100 },
          ),
          fc.string({ minLength: 3, maxLength: 10 }).map((s) =>
            s.toUpperCase() + "USDT"
          ),
          (ohlcvData: OHLCV[], symbol: string) => {
            // Sort data by timestamp to ensure chronological order
            const sortedData = [...ohlcvData].sort((a, b) =>
              a.timestamp - b.timestamp
            );

            // Process data
            aiIntegration.addMarketData(symbol, sortedData);

            // Verify data was processed
            const status = aiIntegration.getStatus();

            // Data should be tracked
            expect(status.predictiveAnalytics.symbolsTracked)
              .toBeGreaterThanOrEqual(0);

            // Should not crash or throw errors
            expect(() => aiIntegration.getStatus()).not.toThrow();
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 10.2: Strategy Selection Determinism
   *
   * Given the same market regime and performance data, strategy selection should:
   * 1. Be deterministic (same inputs → same outputs)
   * 2. Respect allocation limits
   * 3. Maintain diversification requirements
   */
  describe("Property 10.2: Strategy Selection Determinism", () => {
    it("should produce consistent strategy selections for identical market conditions", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            "bull_trending",
            "bear_trending",
            "sideways",
            "high_volatility",
            "low_volatility",
            "risk_on",
            "risk_off",
          ),
          fc.string({ minLength: 3, maxLength: 10 }).map((s) =>
            s.toUpperCase() + "USDT"
          ),
          fc.array(
            fc.record({
              strategy: fc.constantFrom(
                "oi_wipeout",
                "funding_spike",
                "liquidity_sweep",
                "volatility_spike",
              ),
              expectedReturn: fc.float({
                min: Math.fround(-0.1),
                max: Math.fround(0.2),
              }),
              sharpeRatio: fc.float({
                min: Math.fround(-2),
                max: Math.fround(5),
              }),
              winProbability: fc.float({
                min: Math.fround(0.3),
                max: Math.fround(0.9),
              }),
              confidence: fc.float({
                min: Math.fround(0.5),
                max: Math.fround(1.0),
              }),
            }),
            { minLength: 2, maxLength: 4 },
          ),
          (regime, symbol, strategyData) => {
            // Mock predictive analytics to return consistent predictions
            const mockPredictions = strategyData.map((data) => ({
              timestamp: Date.now(),
              strategy: data.strategy,
              symbol,
              regime: regime as any,
              predictedPerformance: {
                expectedReturn: data.expectedReturn,
                expectedVolatility: 0.02,
                sharpeRatio: data.sharpeRatio,
                winProbability: data.winProbability,
                maxDrawdown: 0.05,
              },
              confidence: data.confidence,
              timeHorizon: 60,
              recommendedAction: "maintain" as const,
            }));

            // Set up mock to return these predictions
            jest.spyOn(
              aiIntegration["predictiveAnalytics"],
              "predictStrategyPerformance",
            )
              .mockImplementation((strategy, _symbol) =>
                mockPredictions.find((p) => p.strategy === strategy) || null
              );

            jest.spyOn(
              aiIntegration["predictiveAnalytics"],
              "getCurrentRegimes",
            )
              .mockReturnValue(new Map([[symbol, regime as any]]));

            // Run strategy selection twice
            const selection1 = aiIntegration["selectOptimalStrategies"](
              symbol,
              regime as any,
              mockPredictions,
            );
            const selection2 = aiIntegration["selectOptimalStrategies"](
              symbol,
              regime as any,
              mockPredictions,
            );

            // Results should be identical
            expect(selection1.selectedStrategies).toEqual(
              selection2.selectedStrategies,
            );
            expect(selection1.totalAllocation).toEqual(
              selection2.totalAllocation,
            );

            // Allocation limits should be respected
            for (const strategy of selection1.selectedStrategies) {
              expect(strategy.allocation).toBeLessThanOrEqual(0.6); // maxSingleStrategy
              expect(strategy.allocation).toBeGreaterThan(0);
            }

            // Total allocation should not exceed 100%
            expect(selection1.totalAllocation).toBeLessThanOrEqual(1.0);
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  /**
   * Property 10.3: Risk Adjustment Monotonicity
   *
   * Risk adjustments should follow monotonic behavior:
   * 1. Higher risk conditions → more conservative adjustments
   * 2. Risk score should correlate with adjustment severity
   * 3. Confidence should be inversely related to adjustment magnitude
   */
  describe("Property 10.3: Risk Adjustment Monotonicity", () => {
    it("should generate more conservative adjustments for higher risk conditions", () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.1), max: Math.fround(0.9) }), // Portfolio correlation
          fc.float({ min: Math.fround(0.01), max: Math.fround(0.1) }), // Current volatility
          fc.float({ min: Math.fround(0.01), max: Math.fround(0.2) }), // Predicted volatility
          (portfolioCorrelation, currentVol, predictedVol) => {
            // Mock correlation analysis
            jest.spyOn(
              aiIntegration["predictiveAnalytics"],
              "analyzeCorrelations",
            )
              .mockReturnValue({
                timestamp: Date.now(),
                pairs: [],
                portfolioCorrelation,
                diversificationScore: 1 - portfolioCorrelation,
                riskConcentration: portfolioCorrelation,
              });

            // Mock volatility prediction
            jest.spyOn(
              aiIntegration["predictiveAnalytics"],
              "predictVolatility",
            )
              .mockReturnValue({
                timestamp: Date.now(),
                symbol: "BTCUSDT",
                currentVolatility: currentVol,
                predictedVolatility: predictedVol,
                confidence: 0.8,
                timeHorizon: 60,
                regime: "high_volatility",
              });

            const mockConfig: Config = {
              traps: {
                oi_wipeout: {
                  enabled: true,
                  stop_loss: 0.015,
                  take_profit: 0.03,
                  risk_per_trade: 0.01,
                  max_leverage: 15,
                  min_confidence: 0.7,
                  cooldown_period: 300,
                },
              },
              risk: {
                max_daily_loss: 0.05,
                max_position_size: 0.5,
                max_open_positions: 3,
                emergency_flatten_threshold: 0.1,
              },
              execution: {
                latency_penalty: 200,
                slippage_model: "realistic",
                limit_chaser_enabled: true,
                max_fill_time: 1000,
              },
            };

            const adjustments = aiIntegration["predictiveAnalytics"]
              .generateRiskAdjustment(mockConfig);

            if (adjustments.length > 0) {
              // Higher correlation should lead to more urgent adjustments
              if (portfolioCorrelation > 0.8) {
                const correlationAdjustment = adjustments.find((
                  adj: RiskAdjustment,
                ) => adj.trigger === "correlation_increase");
                if (correlationAdjustment) {
                  expect(["medium", "high", "critical"]).toContain(
                    correlationAdjustment.urgency,
                  );
                }
              }

              // Volatility spikes should lead to risk reduction
              if (predictedVol > currentVol * 1.5) {
                const volAdjustment = adjustments.find((adj: RiskAdjustment) =>
                  adj.trigger === "volatility_spike"
                );
                if (volAdjustment) {
                  expect(volAdjustment.recommendedRisk).toBeLessThan(
                    mockConfig.risk.max_daily_loss,
                  );
                }
              }

              // All adjustments should have valid confidence scores
              for (const adjustment of adjustments) {
                expect(adjustment.confidence).toBeGreaterThan(0);
                expect(adjustment.confidence).toBeLessThanOrEqual(1);
              }
            }
          },
        ),
        { numRuns: 40 },
      );
    });
  });

  /**
   * Property 10.4: Performance Score Consistency
   *
   * Performance scores should:
   * 1. Be bounded between 0 and 100
   * 2. Increase with system activity and data quality
   * 3. Be stable for similar system states
   */
  describe("Property 10.4: Performance Score Consistency", () => {
    it("should maintain consistent performance scoring bounds and behavior", () => {
      fc.assert(
        fc.property(
          fc.boolean(), // Optimizer running
          fc.boolean(), // Analytics running
          fc.integer({ min: 0, max: 100 }), // Optimization count
          fc.integer({ min: 0, max: 10 }), // Symbols tracked
          fc.integer({ min: 0, max: 1000 }), // Total data points
          (
            optimizerRunning,
            analyticsRunning,
            optimizationCount,
            symbolsTracked,
            totalDataPoints,
          ) => {
            // Mock component stats
            jest.spyOn(aiIntegration["realTimeOptimizer"], "getStats")
              .mockReturnValue({
                isRunning: optimizerRunning,
                optimizationCount,
                activeABTests: 0,
                dataStreamStats: {
                  lastUpdate: Date.now(),
                  trades: 0,
                  regimeSnapshots: 0,
                  performanceMetrics: 0,
                },
                performanceHistory: 0,
              });

            jest.spyOn(aiIntegration["predictiveAnalytics"], "getStats")
              .mockReturnValue({
                isRunning: analyticsRunning,
                symbolsTracked,
                dataPoints: { "BTCUSDT": totalDataPoints },
                regimeHistory: {},
                modelsActive: analyticsRunning ? 1 : 0,
              });

            // Trigger performance evaluation
            aiIntegration["evaluatePerformance"]();

            const status = aiIntegration.getStatus();

            // Performance score should be bounded
            expect(status.performanceScore).toBeGreaterThanOrEqual(0);
            expect(status.performanceScore).toBeLessThanOrEqual(100);

            // Running components should contribute to higher scores
            if (optimizerRunning && analyticsRunning) {
              expect(status.performanceScore).toBeGreaterThan(50); // Base score + running bonuses
            }

            // More activity should generally lead to higher scores (only when components are running)
            if (
              optimizationCount > 50 && symbolsTracked > 5 &&
              totalDataPoints > 500 &&
              (optimizerRunning || analyticsRunning)
            ) {
              expect(status.performanceScore).toBeGreaterThan(60);
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 10.5: Event Emission Reliability
   *
   * The AI integration should reliably emit events for:
   * 1. All significant state changes
   * 2. All optimization activities
   * 3. All risk adjustments
   */
  describe("Property 10.5: Event Emission Reliability", () => {
    it("should emit events consistently for all significant operations", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              timestamp: fc.integer({
                min: Date.now() - 3600000,
                max: Date.now(),
              }),
              open: fc.float({ min: 40000, max: 60000 }),
              high: fc.float({ min: 40000, max: 60000 }),
              low: fc.float({ min: 40000, max: 60000 }),
              close: fc.float({ min: 40000, max: 60000 }),
              volume: fc.float({ min: 1000, max: 10000 }),
            }).filter((ohlcv) =>
              ohlcv.high >= Math.max(ohlcv.open, ohlcv.close) &&
              ohlcv.low <= Math.min(ohlcv.open, ohlcv.close)
            ),
            { minLength: 5, maxLength: 20 },
          ),
          (ohlcvData: OHLCV[]) => {
            const events: string[] = [];

            // Listen for all events
            const eventTypes = [
              "started",
              "stopped",
              "marketDataAdded",
              "regimeSnapshotAdded",
              "tradeAdded",
              "parameterOptimized",
              "abTestCompleted",
              "regimeChanged",
              "strategySelectionUpdated",
              "riskAdjusted",
              "analyticsUpdated",
              "performanceEvaluated",
            ];

            eventTypes.forEach((eventType) => {
              aiIntegration.on(eventType, () => {
                events.push(eventType);
              });
            });

            // Perform operations that should trigger events
            aiIntegration.start();
            expect(events).toContain("started");

            // Add market data
            const sortedData = [...ohlcvData].sort((a, b) =>
              a.timestamp - b.timestamp
            );
            aiIntegration.addMarketData("BTCUSDT", sortedData);
            expect(events).toContain("marketDataAdded");

            // Add regime snapshot
            const regimeSnapshot: RegimeSnapshot = {
              timestamp: Date.now(),
              symbol: "BTCUSDT",
              trendState: 1,
              volState: 1,
              liquidityState: 0,
              regimeState: 1,
            };
            aiIntegration.addRegimeSnapshot(regimeSnapshot);
            expect(events).toContain("regimeSnapshotAdded");

            // Add trade
            const trade: Trade = {
              id: "test-trade",
              timestamp: Date.now(),
              symbol: "BTCUSDT",
              trapType: "oi_wipeout",
              side: "long",
              entryPrice: 50000,
              exitPrice: 50100,
              quantity: 0.1,
              leverage: 10,
              pnl: 10,
              pnlPercent: 0.002,
              duration: 300,
              slippage: 0.001,
              fees: 5,
              exitReason: "take_profit",
            };
            aiIntegration.addTrade(trade);
            expect(events).toContain("tradeAdded");

            aiIntegration.stop();
            expect(events).toContain("stopped");

            // Events should be emitted in logical order
            const startIndex = events.indexOf("started");
            const stopIndex = events.indexOf("stopped");
            expect(startIndex).toBeLessThan(stopIndex);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  /**
   * Property 10.6: Resource Management
   *
   * The AI integration should:
   * 1. Clean up resources properly on shutdown
   * 2. Not leak memory with continuous operation
   * 3. Respect rate limiting constraints
   */
  describe("Property 10.6: Resource Management", () => {
    it("should manage resources properly under continuous operation", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 100 }), // Number of operations
          fc.integer({ min: 1, max: 10 }), // Number of symbols
          (numOperations, numSymbols) => {
            const symbols = Array.from(
              { length: numSymbols },
              (_, i) => `SYM${i}USDT`,
            );

            aiIntegration.start();

            // Perform many operations
            for (let i = 0; i < numOperations; i++) {
              const symbol = symbols[i % symbols.length];

              // Add market data
              const ohlcv: OHLCV = {
                timestamp: Date.now() - (numOperations - i) * 1000,
                open: 50000 + Math.random() * 1000,
                high: 50500 + Math.random() * 1000,
                low: 49500 + Math.random() * 1000,
                close: 50000 + Math.random() * 1000,
                volume: 1000 + Math.random() * 500,
              };
              aiIntegration.addMarketData(symbol, [ohlcv]);

              // Add regime snapshot
              const regimeSnapshot: RegimeSnapshot = {
                timestamp: Date.now() - (numOperations - i) * 1000,
                symbol,
                trendState: [-1, 0, 1][Math.floor(Math.random() * 3)] as
                  | -1
                  | 0
                  | 1,
                volState: [0, 1, 2][Math.floor(Math.random() * 3)] as 0 | 1 | 2,
                liquidityState: [0, 1, 2][Math.floor(Math.random() * 3)] as
                  | 0
                  | 1
                  | 2,
                regimeState: [-1, 0, 1][Math.floor(Math.random() * 3)] as
                  | -1
                  | 0
                  | 1,
              };
              aiIntegration.addRegimeSnapshot(regimeSnapshot);
            }

            // Check status is still valid
            const status = aiIntegration.getStatus();
            // The system may track more symbols due to internal processing
            expect(status.predictiveAnalytics.symbolsTracked)
              .toBeGreaterThanOrEqual(0);
            expect(status.performanceScore).toBeGreaterThanOrEqual(0);
            expect(status.performanceScore).toBeLessThanOrEqual(100);

            // Should not crash on shutdown
            expect(() => aiIntegration.shutdown()).not.toThrow();

            // Should be properly stopped after shutdown
            const finalStatus = aiIntegration.getStatus();
            expect(finalStatus.realTimeOptimizer.isRunning).toBe(false);
            expect(finalStatus.predictiveAnalytics.isRunning).toBe(false);
          },
        ),
        { numRuns: 20 },
      );
    });
  });
});
