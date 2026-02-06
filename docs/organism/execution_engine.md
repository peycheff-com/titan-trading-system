# Execution Engine (Rust)

> **Status**: Canonical
> **Stack**: Rust, Actix, Redb, Tokio

## 1. Core Responsibilities

The Execution Engine (`titan-execution-rs`) is the somatic motor cortex. It moves the money.

1.  **Connector**: Manages WebSocket/REST connections to Exchanges.
2.  **Guardian**: Enforces Risk Policy at the point of trade.
3.  **Ledger**: Records local "Truth" (Shadow State).

## 2. Architecture

### 2.1 Actor System
The engine uses the Actor Model (Tokio channels):
- **NatsActor**: Handles inbound/outbound event bus traffic.
- **ExchangeActor**: Handles specific exchange API mechanics.
- **RiskActor**: Synchronous gatekeeper. The bottleneck by design.
- **StateActor**: Manages Redb reads/writes.

### 2.2 Persistence (Redb)
We use `redb` (Embedded, ACID, pure Rust) for local state.
- **Speed**: < 100µs writes.
- **Safety**: MVCC (Multi-Version Concurrency Control).
- **Path**: `/data/execution.db`.

## 3. The Execution Pipeline

When a Command arrives:

1.  **Decoder**: Validate JSON and HMAC Signature.
2.  **Risk Check**:
    - Load `account_state` (Equity, Positions).
    - `RiskGuard::check(cmd, state)`.
    - If Fail: Respond `RejectEvent` immediately.
3.  **Submission**:
    - Serialize to Exchange format (e.g., CCXT-like payload).
    - HTTP POST to Exchange.
4.  **Confirmation (`EventLoop`)**:
    - Wait for REST response (Order ID).
    - Wait for WS ExecutionReport (Fill Price).
    - Write to Redb.
    - Ack to NATS.

## 4. Shadow State

Execution maintains a local copy of all Open Orders and Positions.
**Why?**
- Speed: Risk checks operate on local RAM, not API calls.
- Resilience: If Exchange goes dark, we know what we *intend* to have.

**Reconciliation**: The Shadow State is periodically (1m) compared against the Exchange State. Discrepancies trigger a **Truth Drift Alert**.
