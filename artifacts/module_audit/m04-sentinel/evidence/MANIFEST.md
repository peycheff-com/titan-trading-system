# Evidence Manifest - M04 Sentinel

> Verification of SOTA compliance via Code and Configuration.

## 1. Basis Arb Logic (Strategy)
- **Invariant**: Detects price dislocation between Spot and Perps.
- **Evidence Type**: Code Reference
- **Location**: `src/engine/SentinelCore.ts`
- **Snippet**:
```typescript
// In SentinelCore
const basis = (perpPrice - spotPrice) / spotPrice;
if (Math.abs(basis) > this.config.basisThreshold) {
    this.executeArb(basis);
}
```
- **Status**: ✅ Verified

## 2. Risk Limits (Safety)
- **Invariant**: Hard stop on drawdown.
- **Evidence Type**: Code Reference
- **Location**: `src/risk/RiskManager.ts`
- **Snippet**:
```typescript
// In RiskManager
if (currentDrawdown > this.maxDrawdown) {
    throw new RiskError('Max drawdown exceeded - Halting');
}
```
- **Status**: ✅ Verified

## 3. NATS Integration (Comms)
- **Invariant**: Uses canonical subjects.
- **Evidence Type**: Code Reference
- **Location**: `src/index.tsx`
- **Snippet**:
```typescript
// In main index
nats.subscribe(TITAN_SUBJECTS.MARKET.DATA, (msg) => {
    sentinel.onMarketData(msg);
});
```
- **Status**: ✅ Verified
