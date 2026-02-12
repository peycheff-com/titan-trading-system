# Module Scope: M05 Execution Engine (Rust)

> **Generated**: 2026-02-11
> **Module**: M05 (titan-execution-rs)

## 1. File Inventory

The following files are included in the scope of this audit:

### Cargo & Config
- `Cargo.toml`
- `src/main.rs`
- `src/lib.rs`
- `src/config.rs`

### Core Logic
- `src/context.rs`
- `src/engine/mod.rs`
- `src/engine/state_machine.rs`
- `src/order_manager.rs`
- `src/risk_guard.rs`
- `src/risk_policy.rs`
- `src/shadow_state.rs`
- `src/armed_state.rs`
- `src/circuit_breaker.rs`
- `src/drift_detector.rs`
- `src/execution_constraints.rs`
- `src/staleness.rs`

### Infrastructure
- `src/nats_engine.rs`
- `src/subjects.rs`
- `src/persistence/mod.rs`
- `src/persistence/store.rs`
- `src/persistence/redb_store.rs`
- `src/persistence/wal.rs`
- `src/metrics.rs`
- `src/sre.rs`

### API
- `src/api.rs`
- `src/auth_middleware.rs`
- `src/model.rs`

### Exchanges
- `src/exchange/mod.rs`
- `src/exchange/adapter.rs`
- `src/exchange/router.rs`
- `src/exchange/binance.rs`
- `src/exchange/bybit.rs`
- `src/exchange/mexc.rs`

### Market Data
- `src/market_data/mod.rs`
- `src/market_data/engine.rs`
- `src/market_data/model.rs`
- `src/market_data/connector.rs`
- `src/market_data/binance/mod.rs`
- `src/market_data/binance/connector.rs`
- `src/market_data/binance/message.rs`
- `src/market_data/bybit/mod.rs`
- `src/market_data/bybit/connector.rs`

### Simulation
- `src/simulation_engine.rs`
- `src/replay_engine.rs`
- `src/replay_model.rs`

### Testing
- `src/tests.rs`

## 2. Exclusions

- `target/` directory
- `.git/` directory
- Temporary or backup files

## 3. Audit Goals

The goal of this audit is to verify compliance with **Gate A** requirements:
1.  **Safety**: Verify risk limits, circuit breakers, and fail-safe mechanisms.
2.  **Reliability**: Ensure robust error handling, persistence integrity, and drift detection.
3.  **Observability**: Confirm metrics, tracing, and structured logging.
4.  **Performance**: Assess latency and throughput characteristics.
5.  **Security**: Verify authentication and secret management.
