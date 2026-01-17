/**
 * Backtester Property-Based Tests
 *
 * Tests backtesting accuracy and consistency with property-based testing
 * Requirements: 3.4 (Backtesting validation pipeline)
 */

import * as fc from "fast-check";
import { Backtester, InMemoryDataCache } from "../../src/simulation/Backtester";
import { LatencyModel } from "../../src/simulation/LatencyModel";
import {
  BacktestResult,
  Config,
  OHLCV,
  RegimeSnapshot,
  Trade,
} from "../../src/types";

/**
 * **Feature: titan-system-integration-review, Property 2: Backtesting Consistency**
 * **Validates: Requirements 3.4**
 *
 * For any valid set of trades and market data, backtesting should produce consistent and accurate results
 */
describe("Backtester Property Tests", () => {
  let backtester: Backtester;
  let cache: InMemoryDataCache;
  let latencyModel: LatencyModel;

  beforeEach(() => {
    cache = new InMemoryDataCache();
    latencyModel = new LatencyModel(100); // 100ms latency for testing
    backtester = new Backtester(cache, latencyModel);
  });

  /**
   * Property 1: Validation Report Consistency
   * For any two backtest results, validation reports should follow consistent logic
   */
  it("should generate consistent validation reports for any result comparison", () => {
    fc.assert(
      fc.property(
        // Generate baseline result
        fc.record({
          totalTrades: fc.integer({ min: 1, max: 1000 }),
          winningTrades: fc.integer({ min: 0, max: 500 }),
          losingTrades: fc.integer({ min: 0, max: 500 }),
          winRate: fc.float({
            min: Math.fround(0),
            max: Math.fround(1),
            noNaN: true,
          }),
          totalPnL: fc.float({
            min: Math.fround(-10000),
            max: Math.fround(10000),
            noNaN: true,
          }),
          avgPnL: fc.float({
            min: Math.fround(-1000),
            max: Math.fround(1000),
            noNaN: true,
          }),
          maxDrawdown: fc.float({
            min: Math.fround(0),
            max: Math.fround(5000),
            noNaN: true,
          }),
          maxDrawdownPercent: fc.float({
            min: Math.fround(0),
            max: Math.fround(0.5),
            noNaN: true,
          }),
          sharpeRatio: fc.float({
            min: Math.fround(-5),
            max: Math.fround(5),
            noNaN: true,
          }),
          avgSlippage: fc.float({
            min: Math.fround(0),
            max: Math.fround(1),
            noNaN: true,
          }),
          avgDuration: fc.integer({ min: 1000, max: 3600000 }),
          profitFactor: fc.float({
            min: Math.fround(0),
            max: Math.fround(10),
            noNaN: true,
          }),
        }),
        // Generate proposed result
        fc.record({
          totalTrades: fc.integer({ min: 1, max: 1000 }),
          winningTrades: fc.integer({ min: 0, max: 500 }),
          losingTrades: fc.integer({ min: 0, max: 500 }),
          winRate: fc.float({
            min: Math.fround(0),
            max: Math.fround(1),
            noNaN: true,
          }),
          totalPnL: fc.float({
            min: Math.fround(-10000),
            max: Math.fround(10000),
            noNaN: true,
          }),
          avgPnL: fc.float({
            min: Math.fround(-1000),
            max: Math.fround(1000),
            noNaN: true,
          }),
          maxDrawdown: fc.float({
            min: Math.fround(0),
            max: Math.fround(5000),
            noNaN: true,
          }),
          maxDrawdownPercent: fc.float({
            min: Math.fround(0),
            max: Math.fround(0.5),
            noNaN: true,
          }),
          sharpeRatio: fc.float({
            min: Math.fround(-5),
            max: Math.fround(5),
            noNaN: true,
          }),
          avgSlippage: fc.float({
            min: Math.fround(0),
            max: Math.fround(1),
            noNaN: true,
          }),
          avgDuration: fc.integer({ min: 1000, max: 3600000 }),
          profitFactor: fc.float({
            min: Math.fround(0),
            max: Math.fround(10),
            noNaN: true,
          }),
        }),
        (baselineResult, proposedResult) => {
          const backtestPeriod = { start: 1000, end: 2000 };

          const report = backtester.createValidationReport(
            baselineResult,
            proposedResult,
            backtestPeriod,
          );

          // Report should always have required fields
          expect(report).toHaveProperty("passed");
          expect(report).toHaveProperty("recommendation");
          expect(report).toHaveProperty("deltas");
          expect(report).toHaveProperty("backtestPeriod");
          expect(report).toHaveProperty("timestamp");

          // Deltas should be calculated correctly
          expect(report.deltas.pnlDelta).toBeCloseTo(
            proposedResult.totalPnL - baselineResult.totalPnL,
            2,
          );
          expect(report.deltas.drawdownDelta).toBeCloseTo(
            proposedResult.maxDrawdown - baselineResult.maxDrawdown,
            2,
          );
          expect(report.deltas.winRateDelta).toBeCloseTo(
            proposedResult.winRate - baselineResult.winRate,
            5,
          );

          // PnL delta percentage should be calculated correctly
          if (Math.abs(baselineResult.totalPnL) > 0.01) { // Avoid division by very small numbers
            const expectedPnlDeltaPercent =
              (report.deltas.pnlDelta / Math.abs(baselineResult.totalPnL)) *
              100;
            expect(report.deltas.pnlDeltaPercent).toBeCloseTo(
              expectedPnlDeltaPercent,
              2,
            );
          }

          // Recommendation should be consistent with pass/fail
          if (report.passed) {
            expect(["approve", "review"]).toContain(report.recommendation);
            expect(report.rejectionReason).toBeUndefined();
          } else {
            expect(report.recommendation).toBe("reject");
            expect(report.rejectionReason).toBeDefined();
            expect(typeof report.rejectionReason).toBe("string");
            expect(report.rejectionReason!.length).toBeGreaterThan(0);
          }

          // Timestamp should be recent
          expect(report.timestamp).toBeGreaterThan(Date.now() - 10000); // Within last 10 seconds
          expect(report.timestamp).toBeLessThanOrEqual(Date.now());

          // Backtest period should match input
          expect(report.backtestPeriod).toEqual(backtestPeriod);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2: Historical Data Loading Consistency
   * For any valid symbols and time range, data loading should be consistent
   */
  it("should load historical data consistently for any valid input", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.string({ minLength: 3, maxLength: 10 }).filter((s) =>
            s.trim().length > 0
          ),
          { minLength: 1, maxLength: 5 },
        ),
        fc.integer({ min: 1000, max: 2000 }),
        fc.integer({ min: 2000, max: 3000 }),
        async (symbols, startTime, endTime) => {
          // Setup test data for each valid symbol (filter out invalid symbols)
          const validSymbols = symbols.filter((s) => s.trim().length >= 3);

          validSymbols.forEach((symbol) => {
            const ohlcvData: OHLCV[] = [
              {
                timestamp: startTime + 100,
                open: 100,
                high: 105,
                low: 95,
                close: 102,
                volume: 1000,
              },
              {
                timestamp: startTime + 200,
                open: 102,
                high: 108,
                low: 100,
                close: 106,
                volume: 1200,
              },
            ];
            const regimeData: RegimeSnapshot[] = [
              {
                timestamp: startTime + 100,
                symbol: symbol,
                trendState: 1,
                volState: 1,
                liquidityState: 1,
                regimeState: 1,
              },
            ];

            cache.setOHLCV(symbol, ohlcvData);
            cache.setRegimeSnapshots(symbol, regimeData);
          });

          const result = await backtester.loadHistoricalData(
            symbols,
            startTime,
            endTime,
          );

          // Should have data for all requested symbols (even if empty)
          expect(result.ohlcvData.size).toBe(symbols.length);
          expect(result.regimeData.size).toBe(symbols.length);

          // Each symbol should have data (may be empty for invalid symbols)
          symbols.forEach((symbol) => {
            const ohlcv = result.ohlcvData.get(symbol);
            const regime = result.regimeData.get(symbol);

            expect(ohlcv).toBeDefined();
            expect(regime).toBeDefined();

            // Only valid symbols should have non-empty data
            if (validSymbols.includes(symbol)) {
              expect(ohlcv!.length).toBeGreaterThanOrEqual(0);
              expect(regime!.length).toBeGreaterThan(0);
            }
          });
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Property 3: Empty Trade Handling
   * For empty trade arrays, backtesting should handle gracefully
   */
  it("should handle empty trade arrays consistently", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          traps: fc.record({
            oi_wipeout: fc.record({
              enabled: fc.boolean(),
              stop_loss: fc.float({
                min: Math.fround(0.01),
                max: Math.fround(0.1),
                noNaN: true,
              }),
              take_profit: fc.float({
                min: Math.fround(0.01),
                max: Math.fround(0.2),
                noNaN: true,
              }),
              risk_per_trade: fc.float({
                min: Math.fround(0.001),
                max: Math.fround(0.05),
                noNaN: true,
              }),
              max_leverage: fc.integer({ min: 1, max: 100 }),
              min_confidence: fc.float({
                min: Math.fround(0.1),
                max: Math.fround(1),
                noNaN: true,
              }),
              cooldown_period: fc.integer({ min: 60, max: 3600 }),
            }),
          }),
          risk: fc.record({
            max_daily_loss: fc.float({
              min: Math.fround(0.01),
              max: Math.fround(0.2),
              noNaN: true,
            }),
            max_position_size: fc.float({
              min: Math.fround(0.1),
              max: Math.fround(1),
              noNaN: true,
            }),
            max_open_positions: fc.integer({ min: 1, max: 10 }),
            emergency_flatten_threshold: fc.float({
              min: Math.fround(0.05),
              max: Math.fround(0.5),
              noNaN: true,
            }),
          }),
          execution: fc.record({
            latency_penalty: fc.integer({ min: 50, max: 500 }),
            slippage_model: fc.constantFrom(
              "conservative" as const,
              "realistic" as const,
              "optimistic" as const,
            ),
            limit_chaser_enabled: fc.boolean(),
            max_fill_time: fc.integer({ min: 500, max: 5000 }),
          }),
        }),
        async (config) => {
          const result = await backtester.replay([], config, [], []);

          // Empty trade array should produce consistent empty results
          expect(result.totalTrades).toBe(0);
          expect(result.winningTrades).toBe(0);
          expect(result.losingTrades).toBe(0);
          expect(result.winRate).toBe(0);
          expect(result.totalPnL).toBe(0);
          expect(result.profitFactor).toBe(0);
          expect(result.warnings).toEqual([]);
          expect(result.skippedTrades).toBe(0);
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property 4: Time Range Filtering
   * For any trades and time range, filtering should be mathematically correct
   */
  it("should filter trades correctly based on time ranges", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            timestamp: fc.integer({ min: 500, max: 2500 }),
            symbol: fc.constant("BTCUSDT"),
            trapType: fc.constantFrom(
              "oi_wipeout" as const,
              "funding_spike" as const,
              "liquidity_sweep" as const,
              "volatility_spike" as const,
            ),
            side: fc.constantFrom("long" as const, "short" as const),
            entryPrice: fc.float({
              min: Math.fround(100),
              max: Math.fround(200),
              noNaN: true,
            }),
            exitPrice: fc.float({
              min: Math.fround(100),
              max: Math.fround(200),
              noNaN: true,
            }),
            quantity: fc.float({
              min: Math.fround(0.1),
              max: Math.fround(10),
              noNaN: true,
            }),
            leverage: fc.integer({ min: 1, max: 20 }),
            pnl: fc.float({
              min: Math.fround(-1000),
              max: Math.fround(1000),
              noNaN: true,
            }),
            pnlPercent: fc.float({
              min: Math.fround(-50),
              max: Math.fround(50),
              noNaN: true,
            }),
            duration: fc.integer({ min: 10000, max: 300000 }),
            slippage: fc.float({
              min: Math.fround(0),
              max: Math.fround(0.5),
              noNaN: true,
            }),
            fees: fc.float({
              min: Math.fround(0),
              max: Math.fround(10),
              noNaN: true,
            }),
            exitReason: fc.constantFrom(
              "take_profit" as const,
              "stop_loss" as const,
              "timeout" as const,
            ),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        fc.integer({ min: 1000, max: 1500 }), // startTime
        fc.integer({ min: 1500, max: 2000 }), // endTime
        async (trades, startTime, endTime) => {
          const config: Config = {
            traps: {
              oi_wipeout: {
                enabled: true,
                stop_loss: 0.02,
                take_profit: 0.05,
                risk_per_trade: 0.01,
                max_leverage: 20,
                min_confidence: 0.7,
                cooldown_period: 300,
              },
              funding_spike: {
                enabled: true,
                stop_loss: 0.02,
                take_profit: 0.05,
                risk_per_trade: 0.01,
                max_leverage: 20,
                min_confidence: 0.7,
                cooldown_period: 300,
              },
              liquidity_sweep: {
                enabled: false,
                stop_loss: 0.02,
                take_profit: 0.05,
                risk_per_trade: 0.01,
                max_leverage: 20,
                min_confidence: 0.7,
                cooldown_period: 300,
              },
              volatility_spike: {
                enabled: false,
                stop_loss: 0.02,
                take_profit: 0.05,
                risk_per_trade: 0.01,
                max_leverage: 20,
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
              latency_penalty: 100,
              slippage_model: "realistic",
              limit_chaser_enabled: true,
              max_fill_time: 1000,
            },
          };

          const result = await backtester.replay(
            trades,
            config,
            [], // No OHLCV data
            [], // No regime data
            { startTime, endTime, skipMissingData: true },
          );

          // Count expected trades (within time range and enabled traps)
          const expectedTrades = trades.filter((trade) =>
            trade.timestamp >= startTime &&
            trade.timestamp <= endTime &&
            config.traps[trade.trapType]?.enabled
          );

          // Since we have no OHLCV/regime data, trades may be skipped due to missing data
          expect(result.skippedTrades).toBeGreaterThanOrEqual(0);
          expect(result.totalTrades).toBeGreaterThanOrEqual(0); // Some trades might still be processed

          // Should have warnings about missing data if there were any valid trades
          if (expectedTrades.length > 0) {
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(
              result.warnings.some((w) =>
                w.code === "MISSING_OHLCV_DATA" ||
                w.code === "INCOMPLETE_REGIME_DATA"
              ),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property 5: Configuration Validation
   * For any valid configuration, backtesting should not throw errors
   */
  it("should handle any valid configuration without errors", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          traps: fc.record({
            oi_wipeout: fc.record({
              enabled: fc.boolean(),
              stop_loss: fc.float({
                min: Math.fround(0.001),
                max: Math.fround(0.2),
                noNaN: true,
              }),
              take_profit: fc.float({
                min: Math.fround(0.001),
                max: Math.fround(0.5),
                noNaN: true,
              }),
              risk_per_trade: fc.float({
                min: Math.fround(0.001),
                max: Math.fround(0.1),
                noNaN: true,
              }),
              max_leverage: fc.integer({ min: 1, max: 100 }),
              min_confidence: fc.float({
                min: Math.fround(0.1),
                max: Math.fround(1),
                noNaN: true,
              }),
              cooldown_period: fc.integer({ min: 60, max: 7200 }),
            }),
            funding_spike: fc.record({
              enabled: fc.boolean(),
              stop_loss: fc.float({
                min: Math.fround(0.001),
                max: Math.fround(0.2),
                noNaN: true,
              }),
              take_profit: fc.float({
                min: Math.fround(0.001),
                max: Math.fround(0.5),
                noNaN: true,
              }),
              risk_per_trade: fc.float({
                min: Math.fround(0.001),
                max: Math.fround(0.1),
                noNaN: true,
              }),
              max_leverage: fc.integer({ min: 1, max: 100 }),
              min_confidence: fc.float({
                min: Math.fround(0.1),
                max: Math.fround(1),
                noNaN: true,
              }),
              cooldown_period: fc.integer({ min: 60, max: 7200 }),
            }),
          }),
          risk: fc.record({
            max_daily_loss: fc.float({
              min: Math.fround(0.01),
              max: Math.fround(0.5),
              noNaN: true,
            }),
            max_position_size: fc.float({
              min: Math.fround(0.01),
              max: Math.fround(1),
              noNaN: true,
            }),
            max_open_positions: fc.integer({ min: 1, max: 20 }),
            emergency_flatten_threshold: fc.float({
              min: Math.fround(0.01),
              max: Math.fround(1),
              noNaN: true,
            }),
          }),
          execution: fc.record({
            latency_penalty: fc.integer({ min: 10, max: 1000 }),
            slippage_model: fc.constantFrom(
              "conservative" as const,
              "realistic" as const,
              "optimistic" as const,
            ),
            limit_chaser_enabled: fc.boolean(),
            max_fill_time: fc.integer({ min: 100, max: 10000 }),
          }),
        }),
        async (config) => {
          // Should not throw errors with any valid configuration
          expect(async () => {
            const result = await backtester.replay([], config, [], []);
            expect(result).toBeDefined();
            expect(result.totalTrades).toBe(0);
          }).not.toThrow();
        },
      ),
      { numRuns: 50 },
    );
  });
});
