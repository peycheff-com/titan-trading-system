# Module Reality: M05 Execution Engine (Rust)

> **Generated**: 2026-02-11
> **Module**: M05 (titan-execution-rs)
> **Status**: Auditing

## 1. Overview

The **Titan Execution Engine (Rust)** (`titan-execution-rs`) is a high-performance, low-latency execution system designed to manage order lifecycles, enforce risk limits, and maintain a shadow state of positions and balances. It serves as the primary interface between the Titan trading strategy and external exchanges.

## 2. Architecture

### Core Components

1.  **Order Manager**: Central orchestrator for order placement, cancellation, and modification. It validates intents against risk policies before routing.
2.  **Risk Guard**: A pre-trade risk engine that enforces "Check-Determine-Act" logic. It holds the `RiskPolicy` and blocking any unsafe operations.
3.  **Shadow State**: An in-memory, persisted state of all active positions and balances. It serves as the "Truth" for the system, synchronized with exchange data.
4.  **NATS Engine**: Handles all asynchronous messaging (commands, events, market data).
5.  **Market Data Engine**: Ingests real-time market data from NATS and maintains the latest price state for valuation and risk checks.
6.  **Persistence**: Uses `Redb` with a Write-Ahead Log (WAL) to ensure state recovery after restarts.

### Data Flow

1.  **Command Ingestion**: Receives `titan.cmd.execution.place.v1` or Operator commands via NATS.
2.  **Validation**: `OrderManager` validates schema and intent.
3.  **Risk Check**: `RiskGuard` evaluates the intent against `RiskPolicy` and current `ShadowState`.
4.  **Routing**: Valid orders are routed to specific `ExchangeAdapter` implementations (Binance, Bybit, MEXC).
5.  **Execution**: Adapters communicate with exchange APIs.
6.  **State Update**: Order events (fill/reject) update `ShadowState`.
7.  **Emission**: `EVT_EXECUTION_REPORT` and `EVT_EXECUTION_TRUTH` are published.

## 3. Technology Stack

-   **Language**: Rust (2021 edition)
-   **Runtime**: Tokio (Async I/O)
-   **Messaging**: `async-nats` (JetStream)
-   **Web Framework**: `actix-web` (API)
-   **Persistence**: `redb` (Embedded Loop)
-   **Observability**: `opentelemetry`, `tracing`, `prometheus`

## 4. Key Features

-   **Fail-Closed Design**: If risk checks fail or config is invalid, execution is blocked.
-   **Canonical Subjects**: Strictly adheres to `titan.cmd` and `titan.evt` namespaces.
-   **Drift Detection**: Compares internal state with exchange state (if implemented).
-   **Circuit Breakers**: Global halt capability via Operator commands.
