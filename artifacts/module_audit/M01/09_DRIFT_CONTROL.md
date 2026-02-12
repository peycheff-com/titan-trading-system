# M01 — Drift Control

## Configuration
- **Dynamic Config**: `ConfigManager` + `FeatureManager` (Redis-backed) allows hot-reloading risk params without restart.
- **Schema**: `config.schema.json` enforces config validity at startup.

## State Reconciliation
- **Periodic**: `ReconciliationService` runs roughly minutely (triggered by NATS `titan.evt.exec.truth`).
- **Drift Action**:
    - **Minor**: Warn/Adjust confidence.
    - **Major**: Trip Circuit Breaker.
- **Source of Truth**: `TruthRepository` (DB) vs `ExecutionEngine` (Remote).

## Versioning
- **Policy Hash**: Brain verifies Execution Engine runs same Policy Hash. Fails startup if mismatched.
- **Artifacts**: Docker images tagged by git commit.
