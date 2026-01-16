# Titan Microservices Interaction Analysis

**Date:** January 15, 2026
**System:** Titan Trading System (Microservices)

## 1. Executive Summary
The Titan system employs a **Hub-and-Spoke** architecture where `titan-brain` acts as the central orchestrator, with `titan-execution` handling market interactions and `titan-scavenger` acting as a signal generator. Communication is hybrid: **REST** for command/control, **WebSockets** for market data/telemetry, and **IPC** (Unix Domain Sockets) for high-frequency signal delivery.

## 2. Communication Protocols & Data Flow

### A. Signal Pipeline (Fast Path)
**Flow:** `Scavenger` -> `IPC` -> `Execution` -> `Exchange`
1.  **Protocol:** Custom IPC over Unix Socket (`/tmp/titan-ipc.sock`).
2.  **Framing:** Newline-delimited JSON.
3.  **Contract:** `IntentSignal` (Source, Symbol, Direction, Confidence).
4.  **Mechanism:** Two-Phase Commit (`PREPARE` -> `CONFIRM`).
5.  **Latency:** Estimated < 1ms (Localhost).

### B. Feedback Loop (Slow Path)
**Flow:** `Execution` -> `REST` -> `Brain`
1.  **Protocol:** HTTP/1.1 POST (`/webhook/execution-report`).
2.  **Security:** HMAC-SHA256 Signature (`x-signature` header).
3.  **Contract:** `ExecutionReport` (Fill Price, Qty, PnL).
4.  **Latency:** ~5-10ms (HTTP overhead).

### C. State Synchronization
**Flow:** `Brain` -> `Redis` -> `Console`
1.  **Protocol:** Redis Pub/Sub + WebSockets.
2.  **Usage:** Broadcasting `DashboardData` (Equity, Allocation) to UI.

## 3. Dependency Mapping

| Service | Upstream Dependencies | Downstream Consumers | Criticality |
| :--- | :--- | :--- | :--- |
| **Titan Brain** | Postgres, Redis | Execution, Console | **High** (Orchestrator) |
| **Titan Execution** | Exchange API, Redis | Brain, Scavenger | **Critical** (Money at Risk) |
| **Titan Scavenger** | Binance WS | Execution (IPC) | Medium (Signal Gen) |
| **Titan Console** | Brain (WS), Execution (WS) | User | Low (Visibility) |

## 4. API Contracts

### Shared Types (`@titan/shared`)
*   **IntentSignal:** Standardized signal format for all phases.
*   **ExecutionReport:** Normalized fill report from any exchange adapter.

### Failure Modes & Error Handling
1.  **IPC Disconnection:**
    *   *Detection:* Socket `close/error` events.
    *   *Recovery:* `FastPathClient` implements exponential backoff (max 30s).
    *   *Risk:* Signals lost during downtime; Scavenger must handle backpressure.
2.  **Brain Unavailable:**
    *   *Impact:* Execution continues (shadow state), but allocation updates freeze.
    *   *Fallback:* Execution service uses cached allocation or safe defaults.
3.  **Exchange API Rate Limit:**
    *   *Strategy:* `AdaptiveRateLimiter` queues requests locally.
    *   *Circuit Breaker:* Trips after 5 consecutive failures, halting trading.

## 5. Performance Metrics (Estimated)
*   **Throughput:** ~8,000 signals/sec (Execution Service).
*   **IPC Latency:** ~0.2ms (P50).
*   **End-to-End Latency:** ~7ms (Signal to Order Sent).
*   **Error Rate:** < 0.1% (Connection stability).

## 6. Recommendations
1.  **Standardize IPC:** Migrate all inter-service signals (Hunter, Sentinel) to the `FastPathClient` to unify latency characteristics.
2.  **Replace HTTP Feedback:** Convert the `Execution -> Brain` feedback loop to **NATS JetStream** to decouple the services and ensure message durability (replayability).
3.  **Service Mesh:** Implement a lightweight mesh (e.g., Linkerd or simple mTLS) for secure inter-service communication in production.
