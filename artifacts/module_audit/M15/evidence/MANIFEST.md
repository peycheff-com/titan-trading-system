# Evidence Manifest - M15 Backtesting Harness

> Verification of SOTA compliance via Code and Configuration.

## 1. Build Verification
- **Invariant**: Both packages compile without errors.
- **Evidence Type**: Command output
- **Command**: `cd packages/titan-backtesting && npx tsc --noEmit` + `cd packages/titan-harness && npx tsc --noEmit`
- **Result**: Zero errors for both packages
- **Status**: ✅ Verified

## 2. Unit Test Results
- **Invariant**: All unit tests pass.
- **Evidence Type**: Command output
- **Command**: `cd packages/titan-backtesting && npx jest --config jest.config.cjs`
- **Result**: 2/2 tests pass in 0.221s
- **Status**: ✅ Verified

## 3. Parameterized SQL Queries
- **Invariant**: No SQL injection vectors.
- **Evidence Type**: Code Reference
- **Location**: `packages/titan-backtesting/src/data/HistoricalDataService.ts`
- **Snippet**:
```typescript
// Lines 28-38
const res = await client.query(
  `SELECT time, open, high, low, close, volume
   FROM market_data_ohlcv
   WHERE symbol = $1 AND timeframe = $2
     AND time >= to_timestamp($3::double precision / 1000)
     AND time <= to_timestamp($4::double precision / 1000)
   ORDER BY time ASC`,
  [symbol, timeframe, start, end],
);
```
- **Status**: ✅ Verified — parameterized queries used throughout

## 4. Data Gap Detection
- **Invariant**: Gaps in historical data are detected and logged.
- **Evidence Type**: Code Reference
- **Location**: `packages/titan-backtesting/src/data/HistoricalDataService.ts`
- **Snippet**:
```typescript
// Lines 93-108
private validateContinuity(candles: OHLCV[], timeframe: string) {
  if (candles.length < 2) return;
  const intervalMs = this.parseTimeframe(timeframe);
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].timestamp - candles[i - 1].timestamp;
    if (diff > intervalMs * 1.5) {
      this.logger.warn(`Data Gap detected for ${candles[i].symbol} ${timeframe}`, ...);
    }
  }
}
```
- **Status**: ✅ Verified

## 5. ShippingGate Hard Gates
- **Invariant**: Deployment blocked if maxDrawdown or Sharpe thresholds exceeded.
- **Evidence Type**: Code Reference
- **Location**: `packages/titan-backtesting/src/gate/ShippingGate.ts`
- **Snippet**:
```typescript
// Lines 26-33
if (proposed.metrics.maxDrawdown > this.config.maxDrawdown) {
  report.passed = false;
  report.rejectionReason = `Max Drawdown exceeds limit`;
  return report;
}
```
- **Status**: ✅ Verified

## 6. NATS Canonical Subjects
- **Invariant**: GoldenPath uses canonical NATS subjects from `@titan/shared`.
- **Evidence Type**: Code Reference
- **Location**: `packages/titan-harness/src/GoldenPath.ts`
- **Snippet**:
```typescript
// Lines 58, 65, 130
this.nats.subscribe(TITAN_SUBJECTS.CMD.EXECUTION.ALL, ...);
this.nats.subscribe(TITAN_SUBJECTS.EVT.EXECUTION.REJECT, ...);
await this.nats.publish(TITAN_SUBJECTS.SIGNAL.SUBMIT, signal);
```
- **Status**: ✅ Verified

## 7. Mock Exchange Clients (No Real Credentials)
- **Invariant**: Backtesting never connects to real exchanges.
- **Evidence Type**: Code Reference
- **Location**: `packages/titan-backtesting/src/mocks/`
- **Finding**: All 4 mock files (`MockBinanceSpotClient`, `MockBybitPerpsClient`, `MockConfigManager`, `MockSignalClient`) are in-memory implementations with no external network calls.
- **Status**: ✅ Verified
