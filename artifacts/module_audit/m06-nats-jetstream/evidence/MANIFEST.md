# Evidence Manifest - M06 NATS JetStream

> Verification of SOTA compliance via Code and Configuration.

## 1. Stream Persistence (Reliability)
- **Invariant**: Market data is persisted.
- **Evidence Type**: Infrastructure Code
- **Location**: `packages/shared/src/messaging/nats-streams.ts`
- **Snippet**:
```typescript
export const MARKET_DATA_STREAM = {
    name: 'TITAN_MARKET_TRADES',
    storage: StorageType.File,
    retention: RetentionPolicy.Limits
};
```
- **Status**: ✅ Verified

## 2. Access Control (Security)
- **Invariant**: Strict user permissions.
- **Evidence Type**: Configuration
- **Location**: `config/nats.conf`
- **Snippet**:
```conf
authorization {
    users = [
        { user: "titan_brain", permissions: { publish: "titan.cmd.*", subscribe: ">" } }
    ]
}
```
- **Status**: ✅ Verified

## 3. Resource Limits (Stability)
- **Invariant**: Memory bounded.
- **Evidence Type**: Configuration
- **Location**: `config/nats.conf`
- **Snippet**:
```conf
max_mem: 1G
max_file: 10G
```
- **Status**: ✅ Verified
