# M15 — Remediation Plan

| # | Finding | Impact | Fix Policy | Current Signal | Proposed Change | Tests Added | Evidence to Collect | Gate Target | Status |
|---|---------|--------|------------|----------------|-----------------|-------------|--------------------|-------------|--------|
| 1 | BacktestEngine metrics stubbed to `0` (maxDrawdown, sharpe, winRate) | Low — research module | F1 | TODO comments in code | ✅ Implemented proper metric calculation from trade history | `BacktestEngine.test.ts` validates simulation | Backtest run with real data | A | ✅ RESOLVED |
| 2 | `console.log` used in BacktestEngine and mocks instead of Logger | Low | F0 | Multiple `console.log` calls | ✅ Replaced with `@titan/shared` Logger | Existing tests still pass | Logger output in test | A | ✅ RESOLVED |
| 3 | `as any` casts for mock injection | Low — intentional loose coupling | F1 | 7 `as any` casts in BacktestEngine constructor | ✅ Replaced with `as unknown as TitanDeps[...]` pattern with documentation | Type check passes | `tsc --noEmit` clean | A | ✅ RESOLVED |
| 4 | No ShippingGate unit tests | Med — gate logic untested | F0 | No test file | ✅ Added `ShippingGate.test.ts` with 13 tests | ShippingGate.test.ts (13 tests) | Test evidence | A | ✅ RESOLVED |
| 5 | GoldenPath has no unit tests | Low — integration-only tool | F1 | No test file for harness | ✅ Added `GoldenPath.test.ts` with NATS mock | GoldenPath.test.ts | Test evidence | A | ✅ RESOLVED |
| 6 | Equity curve always empty | Low — research feature | F1 | `equityCurve: []` | ✅ Track equity after each candle in simulation loop | Unit test for curve | Backtest output | A | ✅ RESOLVED |
| 7 | `MockSignalClient.sendSignal` uses `any` param | Low | F0 | `signal: any` | ✅ Typed to `Signal` interface | Type check | `tsc --noEmit` | A | ✅ RESOLVED |

> **All 7 findings resolved.** Gate A achieved.
