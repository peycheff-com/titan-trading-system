# Evidence Manifest - M13 OpsD

> Verification of SOTA compliance via Code and Configuration.

## 1. Privileged Access
- **Invariant**: Docker Socket mounted.
- **Evidence Type**: Config Reference
- **Location**: `docker-compose.yml`
- **Snippet**:
```yaml
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```
- **Status**: ✅ Verified

## 2. Allowlist Enforcement
- **Invariant**: Only specific services can be restarted.
- **Evidence Type**: Code Reference
- **Location**: `services/titan-opsd/src/CommandExecutor.ts`
- **Snippet**:
```typescript
// Line 41 (Updated)
const ALLOWED = [
  'titan-brain',
  'titan-execution-rs',
  'titan-scavenger',
  'titan-hunter',
  'titan-sentinel',
  'titan-ai-quant',
  'titan-powerlaw-lab',
  'titan-console-api',
];
```
- **Status**: ✅ Verified (Phase 7 Fix)
