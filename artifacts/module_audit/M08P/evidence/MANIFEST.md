# Evidence Manifest - M08P PowerLaw Lab

> Verification of SOTA compliance via Code and Configuration.

## 1. Hill Estimator Implementation
- **Invariant**: Requires minimum sample size > 20.
- **Evidence Type**: Code Reference
- **Location**: `services/titan-powerlaw-lab/src/tail-estimators.ts`
- **Snippet**:
```typescript
// Line 18
if (data.length < 20) throw new Error("Insufficient data for Hill estimator");
```
- **Status**: ✅ Verified

## 2. Volatility Clustering
- **Invariant**: Detects 'expanding' or 'mean_revert' states.
- **Evidence Type**: Code Reference
- **Location**: `services/titan-powerlaw-lab/src/volatility-cluster.ts`
- **Snippet**:
```typescript
// Line 39
if (acf > 0.4 && currentSigma > this.longTermSigma) return 'expanding';
```
- **Status**: ✅ Verified

## 3. NATS Integration
- **Invariant**: Subscribes to market ticks.
- **Evidence Type**: Code Reference
- **Location**: `services/titan-powerlaw-lab/src/service.ts`
- **Snippet**:
```typescript
// Line 55
this.nats.subscribe('market.data.>', ...);
```
- **Status**: ✅ Verified
