# M04 Tests

## 1. Test Strategy
- **Unit Tests**: Coverage for `SentinelCore`, `StatEngine`, `RiskManager`, `VacuumMonitor`.
    - *Goal*: > 80% coverage.
- **Integration Tests**: Wiring tests for `SentinelCore` + `NatsClient` + `ExchangeRouter`.
    - *Goal*: Verify NATS flows (mocked broker).
- **Property Tests**: Fuzzing for `RiskManager` logic and `StatEngine` math.
    - *Goal*: Verify Welford stability and Risk Limits under random inputs.

## 2. Test Execution
- **Unit**: `npm run test:unit`
- **Integration**: `npm run test:integration`
- **Property**: `npm run test:property`

## 3. Critical Test Cases
- [x] **Risk Limits**: Verified `RiskManager` blocks trades when `drawdown > limit`.
- [x] **Vacuum Logic**: Verified `VacuumMonitor` detects opportunity only when liquidity health is good.
- [x] **Basis Signals**: Verified `StatEngine` generates CORRECT signals for known price series.
- [x] **Regime Switching**: Verified `SentinelCore` halts buying in `CRASH` regime.

## 4. Test Results (Feb 2026)
- **Unit Tests**: 100% Pass (200 tests). Covering `PositionTracker`, `PerformanceTracker`, `Rebalancer`, `TransferManager`.
- **Property Tests**: 100% Pass (19 tests). Verified `StatEngine`, `ExecutionEngine`, `Router` properties under fuzzing.
- **Linting**: 0 Errors, 0 Warnings. `standard` + `prettier` compliant.
