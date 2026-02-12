# Module Invariants: M05 Execution Engine (Rust)

> **Generated**: 2026-02-11
> **Module**: M05 (titan-execution-rs)

## 1. Safety Invariants

1.  **Risk Pre-Check**: No order shall be routed to an exchange without first passing the `RiskGuard` validation.
2.  **Max Leverage**: The configured `max_leverage` MUST NOT exceed **20.0**. This is a hard-coded safety limit in the configuration validator.
3.  **Positive Loss Limit**: The `daily_loss_limit` MUST be strictly positive (> 0.0).
4.  **Symbol Whitelist**: The `symbol_whitelist` MUST NOT be empty. Orders for symbols not in the whitelist MUST be rejected.
5.  **Fail-Closed Security**: If `HMAC_SECRET` is missing and `HMAC_ALLOW_EMPTY_SECRET` is not strictly `true`, the service MUST refuse to start.

## 2. State Invariants

1.  **Persistence Integrity**: The `Redb` store and Write-Ahead Log (WAL) MUST be consistent. If the WAL cannot be applied or the database is corrupt, the service MUST panic on startup to prevent state divergence.
2.  **Shadow State Truth**: The `ShadowState` is the single source of truth for the engine's internal view of positions. It MUST be updated atomically with event emission.

## 3. Communication Invariants

1.  **NATS Connectivity**: The service MUST NOT process any orders if the NATS connection is lost.
2.  **Canonical Subjects**: All published events MUST use the strict `titan.evt.*` namespace.
3.  **Heartbeat**: The service MUST emit a heartbeat signal periodically (if implemented/configured) to indicate liveness.
WARNING: Existing code doesn't explicitly show a heartbeat loop in `main.rs`, but `EVT_EXECUTION_TRUTH` acts as a liveness signal.
