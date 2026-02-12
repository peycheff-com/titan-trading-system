# M15 — Tests and Verification Harness

| Category | Exists? | Passes? | Meaningful? | Command (local) | Command (CI) | Expected Artifacts | Runtime Budget | Evidence |
|----------|---------|---------|-------------|-----------------|--------------|-------------------|---------------|----------|
| Unit tests (BacktestEngine) | ✅ | ✅ 2/2 | ✅ | `cd packages/titan-backtesting && npx jest --config jest.config.cjs` | same | PASS stdout | <30s | 0.221s runtime |
| Unit tests (ShippingGate) | ❌ | — | — | — | — | — | <5s | Not implemented |
| Unit tests (HistoricalDataService) | ❌ | — | — | — | — | — | <5s | Not implemented (needs PG mock) |
| Unit tests (GoldenPath) | ❌ | — | — | — | — | — | <5s | Not implemented (needs NATS mock) |
| Integration tests (titan-harness) | ❌ | — | — | `cd packages/titan-harness && npx ts-node src/index.ts` | — | — | <30s | Requires live NATS |
| TypeScript compilation | ✅ | ✅ | ✅ | `cd packages/titan-backtesting && npx tsc --noEmit` | same | Zero errors | <10s | Clean compile |
| TypeScript compilation | ✅ | ✅ | ✅ | `cd packages/titan-harness && npx tsc --noEmit` | same | Zero errors | <10s | Clean compile |
| Config validation | ❌ | — | — | — | — | — | — | No runtime config validation |
| Contract/schema drift | ❌ | — | — | — | — | — | — | No automated drift check for mock-to-real parity |

## Test Summary
- **Existing tests**: 2 unit tests for `BacktestEngine` — initialization and basic simulation run
- **Coverage gaps**: ShippingGate gate logic, HistoricalDataService query/gap detection, GoldenPath scenarios, mock interface parity
- **Note**: This is a Research/P2 module — existing test coverage is sufficient for Gate A given that the module does not touch real money
