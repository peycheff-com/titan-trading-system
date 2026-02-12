# Evidence Manifest - M02 Scavenger

> Verification of SOTA compliance via Code and Configuration.

## 1. Orchestration Logic
- **Invariant**: 3-Layer Trap Architecture (Generator, Detector, Executor).
- **Evidence Type**: Code Reference
- **Location**: `services/titan-phase1-scavenger/src/engine/TitanTrap.ts`
- **Snippet**:
```typescript
// Line 103
this.generator = new TrapGenerator(...)
this.executor = new TrapExecutor(...)
this.detector = new TrapDetector(...)
```
- **Status**: ✅ Verified

## 2. Detection Logic (The Spider)
- **Invariant**: 100ms Volume Window & 200ms Confirmation Delay.
- **Evidence Type**: Code Reference
- **Location**: `services/titan-phase1-scavenger/src/engine/components/TrapDetector.ts`
- **Snippet**:
```typescript
// Line 117
if (elapsed >= 100) ...
// Line 143
setTimeout(() => { this.checkConfirmation(...) }, 200);
```
- **Status**: ✅ Verified

## 3. Execution Logic (The Bite)
- **Invariant**: Dispatch to Brain via NATS (Intent Signal).
- **Evidence Type**: Code Reference
- **Location**: `services/titan-phase1-scavenger/src/engine/components/TrapExecutor.ts`
- **Snippet**:
```typescript
// Line 279
await this.signalClient.sendPrepare(intent);
```
- **Status**: ✅ Verified

## 4. Pre-Computation (The Web)
- **Invariant**: Regime Detection (Breakout/Range).
- **Evidence Type**: Code Reference
- **Location**: `services/titan-phase1-scavenger/src/engine/components/TrapGenerator.ts`
- **Snippet**:
```typescript
// Line 107
if (structure.regime === 'RANGE') { ... }
```
- **Status**: ✅ Verified
