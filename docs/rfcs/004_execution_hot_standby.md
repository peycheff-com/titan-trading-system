# RFC 004: Execution Service High Availability (Hot Standby)

> **Status**: Proposed
> **Date**: 2026-02-02
> **Author**: Antigravity

## 1. Problem Statement
The `titan-execution-rs` service is currently a Single Point of Failure (SPOF). If the instance crashes, order management and position tracking stops. Restarting takes time, during which market risk is unmanaged.

## 2. Proposed Solution: Active-Passive Hot Standby
We propose running two instances of `titan-execution-rs`:
1.  **Active**: Processes orders, manages connections to exchanges, publishes fills.
2.  **Standby**: Subscribes to the same inputs but DOES NOT send orders to exchanges. It maintains local state (Shadow State) in sync with the Active instance via NATS events.

## 3. Architecture

### 3.1 Startup Configuration
Both instances start with the same configuration but different identity tags (e.g., `primary` vs `backup`).
A new flag `--active-standby` or environment variable `EXECUTION_MODE=active|standby` will be introduced.

### 3.2 Leadership Election (Future Scope)
Ideally, we use NATS JetStream KeyValue (KV) for leadership election.
- `KV_ELECTION: { key: "leader", value: "<instance_id>", lease: 5s }`
- If leader lease expires, Standby promotes itself to Active.

### 3.3 State Synchronization
- **Inputs**: Both subscribe to `titan.cmd.exec.place.v1.>`.
- **Outputs**: only Active publishes to `titan.evt.exec.**`.
- **Standby Behavior**:
    - Ingests `titan.cmd.exec.place...` (updates internal intent state).
    - Ingests `titan.evt.exec.fill...` (updates internal position state).
    - If promoted, it already has the latest state.

## 4. Implementation Phase 1: The Flag
Add a startup flag/config to control the behavior.

```rust
struct Config {
    // ...
    /// If true, runs in hot-standby mode (no exchange connectivity)
    pub hot_standby: bool,
}
```

## 5. Risks
- **Split Brain**: Both think they are active. Mitigation: NATS KV atomic logic.
- **State Drift**: Standby misses a fill. Mitigation: Periodic state reconciliation snapshots.

## 6. Action Plan
1.  Add `active_standby` configuration field to `titan-execution-rs`.
2.  Implement logic to suppress exchange writes when `hot_standby` is true.
3.  Deploy 2nd instance in `docker-compose.prod.yml`.
