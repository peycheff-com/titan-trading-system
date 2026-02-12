# M15 — Reality Snapshot

> What the code actually does today vs. what docs claim.

## Build Status
- [x] Compiles cleanly — `tsc --noEmit` passes for both `titan-backtesting` and `titan-harness`
- [x] Lint passes — no ESLint errors (eslint-disable comments present for functional/immutable-data)
- [x] Tests pass — 2/2 in `BacktestEngine.test.ts`

## Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| Walk-forward simulation | `BacktestEngine.runSimulation()` feeds candles sequentially through TitanTrap mock | ✅ Implemented |
| Shipping gate enforcement | `ShippingGate.evaluate()` checks maxDrawdown, Sharpe, degradation, tail risk | ✅ Implemented |
| Historical data replay | `HistoricalDataService.getCandles()` queries PostgreSQL with gap detection | ✅ Implemented |
| Sharpe/Sortino/Calmar metrics | `BacktestEngine.calculateSharpeRatio()` computes annualized Sharpe from equity curve | ✅ Implemented |
| Max drawdown calculation | Tracked in-loop: peak equity vs current equity, stored as ratio | ✅ Implemented |
| Equity curve tracking | Built in `runSimulation()` loop, records `{timestamp, equity}` per candle | ✅ Implemented |
| Golden path verification | `GoldenPath` injects signal via NATS, tracks execution latency | ✅ Implemented |
| Rejection scenario testing | `GoldenPath.runRejectionScenario()` tests policy hash mismatch | ✅ Implemented |

## Key Observations
1. **BacktestEngine metrics are real** — `maxDrawdown`, `sharpeRatio`, `winRate` all computed from simulation data. `equityCurve` populated per-candle.
2. **`as unknown as TitanDeps[...]` casts** — BacktestEngine uses typed reinterpretation casts (not `as any`) for mock injection. This is the documented backtesting adapter boundary.
3. **Uses shared Logger** — `Logger.getInstance('backtesting')` replaces previous `console.log` usage.
4. **No GoldenPath tests** — `titan-harness` has no unit tests and relies on live NATS for integration testing.

## Exchange Connectivity (if applicable)
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| Binance (mock) | WebSocket simulation | `MockBinanceSpotClient.ts` | N/A (simulation only) |
| Bybit (mock) | REST simulation | `MockBybitPerpsClient.ts` | N/A (simulation only) |
