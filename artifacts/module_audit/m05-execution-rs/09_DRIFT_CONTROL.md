# Module Drift Control: M05 Execution Engine (Rust)

> **Generated**: 2026-02-11
> **Module**: M05 (titan-execution-rs)

## 1. Definition

Drift is the divergence between the **Shadow State** (Internal Truth) and the **Exchange State** (External Truth).

## 2. Detection Mechanism

-   **Component**: `DriftDetector`.
-   **Strategy**:
    -   Periodically polls exchange APIs (via `SreMonitor` or dedicated loop - currently implies `SreMonitor` handles checks).
    -   Compares:
        -   Position Size.
        -   Entry Price.
        -   Balance.
    -   **Thresholds**:
        -   Spread: 20bps (default).
        -   Latency: 2000ms.
        -   Correlation: 80bps.

## 3. Resolution Policy (Gate B+)

*Currently Manual.*

-   **Action**: If drift > threshold:
    1.  Log `WARN/ERROR` with drift details.
    2.  Emit `EVT_SYS_ALARM` (implied).
    3.  Operation: Manual reconciliation required.

## 4. Prevention

-   **Atomic Updates**: Shadow State is updated immediately upon Event emission.
-   **Idempotency**: NATS consumer processing should be idempotent to prevent double-counting fills (handled by `OrderManager` state checks).
