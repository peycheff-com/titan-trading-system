# Module Contracts: M05 Execution Engine (Rust)

> **Generated**: 2026-02-11
> **Module**: M05 (titan-execution-rs)

## 1. NATS Interface

### Ingestion (Commands)

| Subject | Schema | Purpose |
| :--- | :--- | :--- |
| `titan.cmd.operator.arm.v1` | String (Reason) | Arms the execution engine. Required to process orders. |
| `titan.cmd.operator.disarm.v1` | String (Reason) | Disarms the engine. Halts all new order placement. |
| `titan.cmd.execution.place.v1` | JSON (`OrderIntent`) | Request to place a new order. |
| `titan.cmd.risk.policy.v1` | JSON (`RiskPolicy`) | Updates the active risk policy. |
| `titan.data.market.ticker.v1.>` | JSON (`Ticker`) | Real-time market data ingestion. |

### Emission (Events)

| Subject | Schema | Purpose |
| :--- | :--- | :--- |
| `titan.evt.execution.truth.v1` | JSON (`ExecutionSnapshot`) | Periodic snapshot of the internal truth state (positions, policy hash). |
| `titan.evt.execution.report.v1` | JSON (`ExecutionReport`) | Updates on order status (New, Filled, Canceled). |
| `titan.evt.execution.fill.v1` | JSON (`FillEvent`) | Specific event for order fills. |
| `titan.evt.execution.reject.v1` | JSON (`RejectEvent`) | Notification of rejected orders (risk or exchange reject). |
| `titan.sys.heartbeat.v1` | JSON (`Heartbeat`) | Service liveness beacon. |

### Streams

-   **Stream Name**: `TITAN_EXECUTION`
-   **Subjects**: `titan.execution.>`
-   **Storage**: File
-   **Retention**: 24h / 1GB

## 2. API Interface

**Port**: `3002` (Default)

### Endpoints

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Liveness probe. Rerturns status `ok` if NATS connected. |
| `GET` | `/status` | Returns current Risk State (`NORMAL`, `CAUTIOUS`, `DEFENSIVE`, `EMERGENCY`) and allowed actions. |
| `GET` | `/positions` | Returns all active positions from `ShadowState`. |

## 3. Configuration Contracts

The service requires the following environment variables:

| Variable | Required | Description |
| :--- | :--- | :--- |
| `HMAC_SECRET` | **YES** | Secret for signing/verifying internal tokens. |
| `NATS_URL` | No | Defaults to `nats://localhost:4222`. |
| `PERSISTENCE_PATH` | No | Path to Redb file. Defaults to `titan_execution.redb`. |
| `PORT` | No | API Port. Defaults to `3002`. |
| `TITAN_EXCHANGES__*` | No | Exchange configuration overrides. |
