# Evidence Manifest - M03 Hunter

> Verification of SOTA compliance via Code and Configuration.

## 1. Signal Detection
- **Invariant**: Listens to specialized streams.
- **Evidence Type**: Code Reference
- **Location**: `src/index.ts` (Entry Point)
- **Snippet**:
```typescript
// In main index
await hunter.start();
// Subscribes to configured subjects
```
- **Status**: ✅ Verified

## 2. Order Generation
- **Invariant**: Outputs OrderIntent.
- **Evidence Type**: Code Reference
- **Location**: `src/execution/SignalGenerator.ts`
- **Snippet**:
```typescript
// In SignalGenerator
return {
  type: 'market',
  side: side,
  size: this.positionSize(signal)
};
```
- **Status**: ✅ Verified

## 3. Headless Mode
- **Invariant**: Can run without UI.
- **Evidence Type**: Config Reference
- **Location**: `config/phase2.config.json`
- **Snippet**:
```json
{
  "headless": true
}
```
- **Status**: ✅ Verified
