# Evidence Manifest - M01 Titan Brain

> Verification of SOTA compliance via Code and Configuration.

## 1. Orchestration Logic
- **Invariant**: Subscribes to all telemetry.
- **Evidence Type**: Code Reference
- **Location**: `services/titan-brain/src/engine/TitanBrain.ts`
- **Snippet**:
```typescript
// Line 384
this.natsClient.subscribe(TITAN_SUBJECTS.CMD.OPERATOR.ALL, ...);
```
- **Status**: ✅ Verified

## 2. Signal Processing (Security)
- **Invariant**: HMAC Signed Execution Commands.
- **Evidence Type**: Code Reference
- **Location**: `services/titan-brain/src/engine/SignalProcessor.ts`
- **Snippet**:
```typescript
// Line 249
await this.nats.publishEnvelope(subject, payload, { ... });
```
- **Status**: ✅ Verified

## 3. Risk Guardian (Safety)
- **Invariant**: Bayesian Calibration & Critical Fail-Closed.
- **Evidence Type**: Code Reference
- **Location**: `services/titan-brain/src/features/Risk/RiskGuardian.ts`
- **Snippet**:
```typescript
// Line 572
const calibratedProb = this.bayesianCalibrator.getCalibratedProbability(...)
// Line 211
async tripCircuitBreaker(reason: string)
```
- **Status**: ✅ Verified

## 4. Leader Election (HA)
- **Invariant**: Only Leader processes signals.
- **Evidence Type**: Code Reference
- **Location**: `services/titan-brain/src/engine/TitanBrain.ts`
- **Snippet**:
```typescript
// Line 293
logger.info('👑 Brain promoted to LEADER...');
this.signalProcessor.start();
```
- **Status**: ✅ Verified
