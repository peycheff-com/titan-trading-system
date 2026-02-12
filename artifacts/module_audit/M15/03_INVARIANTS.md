# M15 — Invariants

> Cross-reference system invariants I-01 through I-20 from [system-source-of-truth.md](file:///Users/ivan/Code/work/trading/titan/docs/system-source-of-truth.md).

## Control Loop (Cybernetics Lens)

### Essential Variables (what must never drift)
- Backtest fidelity: simulation must replay candles in chronological order without gaps
- Gate thresholds: maxDrawdown, minSharpe must not be bypassed or silently lowered
- Mock-to-real parity: mock exchange clients must surface the same interface as real clients

### Sensors (how you observe reality)
- `HistoricalDataService.validateContinuity()` — detects gaps in candle data > 1.5× interval
- `ShippingGate.evaluate()` — compares proposed metrics against baseline and hard limits
- `GoldenPath.getLatencyStats()` — captures P50/P95/P99 signal-to-execution latency
- `GoldenPath.getRejectionStats()` — tracks rejection events by reason

### Actuators (what you can change)
- `GateConfig` thresholds (maxDrawdown, minSharpe, minSortino, minCalmar, tailRiskCap)
- `SimulationConfig` parameters (symbol, capital, date range)
- Mock config via `MockConfigManager.setConfig()`

### Regulator Policy (what governs action)
- ShippingGate is a hard gate: any threshold failure blocks deployment
- No degradation allowed: proposed maxDrawdown must be ≤ 110% of baseline

### Time Constants
- Backtest candle feed: synchronous, no real clock dependency
- GoldenPath timeout: 5s for signal-to-intent, 3s for rejection event

### Variety Budget
- **Input variety**: Historical candle data (OHLCV), regime snapshots, configurable gate thresholds
- **Attenuation**: Candle gap detection filters out corrupted data
- **Amplification**: ShippingGate evaluates multiple risk dimensions (drawdown, Sharpe, tail risk, degradation)

## Module Invariants

| # | Invariant | System ID | Enforcement | Test | Evidence |
|---|-----------|-----------|-------------|------|----------|
| 1 | Candle data must be chronologically ordered | — | `HistoricalDataService` ORDER BY ASC | Query enforced | SQL `ORDER BY time ASC` |
| 2 | Data gaps > 1.5× interval trigger warning | — | `validateContinuity()` | Implicit | Logger.warn with gap metadata |
| 3 | ShippingGate rejects if maxDrawdown exceeds limit | — | `evaluate()` hard gate check | Testable | `report.passed = false` with reason |
| 4 | ShippingGate rejects if drawdown degrades > 10% vs baseline | — | `evaluate()` degradation check | Testable | Baseline comparison logic |
| 5 | ShippingGate rejects if Sharpe < minimum | — | `evaluate()` soft gate | Testable | `sharpeRatio` check |
| 6 | GoldenPath times out after 5s if no execution intent | — | `setTimeout` in `runScenario()` | Integration | Promise rejection |
| 7 | Mocks implement same public interface as real clients | — | Constructor injection (`as any`) | Compile-time (loose) | TypeScript structural typing |
