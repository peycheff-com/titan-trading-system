# Reliability Engineering Walkthrough

**Objective:** Verify compliance with Reliability Audit Jan 2026.

## 1. Unified Health & Status Contract

We have standardized the observability layer across all services.

### Titan Execution (Rust)
**Endpoint:** `GET /status`
```json
{
  "mode": "NORMAL",
  "reasons": ["Risk State: Normal"],
  "actions": ["Monitor Logs"],
  "unsafe_actions": []
}
```
*Implementation:* `services/titan-execution-rs/src/api.rs` (Lines 45-80)

### Titan Brain (TypeScript)
**Endpoint:** `GET /status`
```json
{
  "mode": "NORMAL",
  "reasons": [],
  "actions": [],
  "details": {
    "circuitBreaker": { "active": false }
  }
}
```
*Implementation:* `services/titan-brain/src/server/controllers/HealthController.ts`

### Titan Sentinel (TypeScript)
**Endpoint:** `GET /health` (Port 8084)
*Now checks NATS connection and Gateways.*

## 2. Infrastructure Safety

### Docker Resource Limits
We applied caps to prevent host OOM.

**File:** `docker-compose.prod.yml`
```yaml
titan-brain:
  limits:
    memory: 1G
titan-execution:
  limits:
    memory: 512M
```

### NATS Event Bus Hygiene
We enforced retention on the high-volume Execution stream.

**File:** `services/titan-execution-rs/src/main.rs`
```rust
stream::Config {
    max_age: 24h,
    max_bytes: 1GB  // Prevents disk fill
}
```

## 3. Operations Documentation

New Runbooks created for critical failure modes:
1.  **[Truth Confidence Collapse](/docs/operations/reliability/truth-collapse.md):** Handling Logic/Budget disconnects.
2.  **[Event Bus Backlog](/docs/operations/reliability/event-bus-backlog.md):** handling consumer lag.

## Verified By
- [x] Static Analysis (Code Review)
- [x] Linter Pass (Clean Build)
- [x] Configuration Review (Docker/NATS)
