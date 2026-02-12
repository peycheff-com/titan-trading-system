# Module Failure Modes: M05 Execution Engine (Rust)

> **Generated**: 2026-02-11
> **Module**: M05 (titan-execution-rs)

## 1. Startup Failures

| Failure | Behavior | Recovery |
| :--- | :--- | :--- |
| **Missing HMAC Secret** | Fatal Exit (Status 1) | Set `HMAC_SECRET` env var. |
| **Invalid Config** | Fatal Exit (Panic) | Fix `config/config.json` or env vars. |
| **NATS Unreachable** | Fatal Exit (Status 1) | Ensure NATS server is running and `NATS_URL` is correct. |
| **Persistence Corrupt** | Fatal Panic | Manual intervention required (audit WAL/Redb). |

## 2. Runtime Failures

| Failure | Behavior | Effect |
| :--- | :--- | :--- |
| **NATS Disconnect** | `Reconnection` (AsyncNats handles this) | Messages may be buffered or lost depending on QoS. Application logic might stall if waiting on replies. |
| **Exchange API Error** | `OrderReject` | The order is rejected, and `EVT_EXECUTION_REJECT` is emitted. Critical for user feedback. |
| **Risk Check Fail** | `OrderReject` | Order is blocked. `EVT_EXECUTION_REJECT` emitted with reason `RiskViolation`. |
| **Drift Detected** | Log/Alert | If internal state diverges from exchange state, an alert is logged. (Future: Auto-halt). |
| **Persistence Write Fail** | Panic/Error | If state cannot be persisted, the engine should halt to prevent split-brain. |

## 3. External Failures

| Failure | Behavior |
| :--- | :--- |
| **Market Data Lag** | **Stale Data** | Risk checks might use old prices. `Staleness` checks (if implemented) should reject orders. |
| **Exchange Outage** | **Connectivity Error** | Adapters will fail to place orders. Logic handles this as a standard execution failure. |
