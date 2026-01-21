# Simulation and Replay Engineering Audit - Jan 2026

**Auditor:** Simulation and Replay Engineer
**Date:** 2026-01-21
**Scope:** `titan-execution-rs`, `titan-brain`, `@titan/shared`, `titan-ai-quant`, `titan-backtesting` (New)

## Executive Summary

The Titan Trading System possesses robust **Strategy Backtesting** capabilities (OHLCV-based) via `titan-ai-quant`, but lacks **System Replay** (Event-based) capabilities. 

There is a fundamental "Simulation Gap":
*   **Strategy Layer**: ✅ Solved. Can replay logic against Price History (`titan-ai-quant`).
*   **Execution Layer**: ❌ Missing. Cannot replay the *actual execution binary* against Event History.

The system fails the "Determinism" requirement for the Execution Engine. `titan-execution-rs` is tightly coupled to Wall Clock Time and Randomness, preventing bit-exact state reconstruction from logs.

## 1. Compliance Matrix

| Requirement | Status | Findings |
| :--- | :--- | :--- |
| **Event-Driven State Reconstruction** | ❌ **FAIL** | `titan-ai-quant` simulates *trades* from OHLCV, not *state* from Event Logs. `titan-execution-rs` cannot ingest historical streams deterministically. |
| **Safe Experimentation** | ⚠️ **PARTIAL** | `titan-ai-quant` allows safe strategy experiments. `titan-backtesting` (Scaffold) enables Walk-Forward Analysis. But no "Sandbox Execution" mode exists. |
| **Failure Injection** | ⚠️ **PARTIAL** | `LatencyModel.ts` (in `titan-ai-quant`) simulates "Bulgaria Tax" and Slippage. However, this is a *Javascript Model*, not an *Infrastructure Injection* into the actual Rust pipeline. |
| **Deterministic Replay** | ❌ **FAIL** | `titan-execution-rs` uses `Utc::now()` and `Uuid::new_v4()` internally. Replay is impossible. |

## 2. Detailed Findings

### A. Titan Execution Engine (`titan-execution-rs`)
*   **Determinism Blockers**: Direct calls to `Utc::now()` (30+) and `Uuid::new_v4()`. No `ReplayClock` abstraction.
*   **IO Coupling**: Publishes directly to live NATS subjects. No `EventBus` trait to redirect to "Replay Sink".
*   **Strengths**: "Dual Read" strategy (`nats_engine.rs`) supports schema evolution, which is a prerequisite for replay.

### B. Titan AI Quant (`titan-ai-quant`)
*   **Capabilities**: `Backtester.ts` and `LatencyModel.ts` provide a mature environment for *Strategy Validation*.
*   **Limit**: This is a *Signal Simulator*, not a *System Simulator*. It mocks the Execution Engine (calculating PnL via simple math) rather than running the actual `titan-execution-rs` code. It cannot detect bugs in the Execution Engine itself (e.g., race conditions, state machine errors).

### C. Titan Backtesting (`titan-backtesting`)
*   **Status**: Fresh scaffold.
*   **Intent**: Focuses on "Walk-Forward Analysis" and "Optimization".
*   **Finding**: Reinforces the "Strategy" focus. Does not address the "System Replay" mission.

### D. Titan Brain (`titan-brain`)
*   **Event Storage**: `EventStore.ts` captures the "Truth" (Events), which is the fuel for replay.
*   **Missing Link**: No "Replay Driver" exists to feed these events back into `titan-execution-rs`.

## 3. The "Simulation Gap"

We have two disparate worlds:
1.  **The Lab (`titan-ai-quant`)**: Deterministic, fast, but uses *Mock Execution*. Ideal for Strategy Development.
2.  **The Plant (`titan-execution-rs`)**: Real Execution, but *Non-Deterministic* and *Live-Coupled*.

**The Goal:** We need "The Plant in the Lab" — running the *actual* `titan-execution-rs` binary using *Simulated Time* and *Historical Events*.

## 4. Recommendations & Roadmap

### Phase 1: Determinism Refactor (High Priority)
1.  **Abstract Time in Rust**: Replace `Utc::now()` with `Clock::now()`. Implement `SystemClock` (Live) and `ReplayClock` (Sim).
2.  **Abstract IDs**: Replace `Uuid::new_v4()` with `IdGenerator` (Seeded for Replay).
3.  **Abstract IO**: Replace `async_nats::Client` with `EventBus` trait.

### Phase 2: The Replay Bridge
1.  Build a **Replay Driver** that reads `event_log` from Postgres.
2.  Feeds events into `titan-execution-rs` via the `EventBus` trait (bypassing NATS).
3.  Advances `ReplayClock` based on event timestamps.

### Phase 3: Infrastructure Fault Injection
1.  Move `LatencyModel` logic (currently in JS) into a Rust `FaultProxy` that wraps the `EventBus`.
2.  Allow replaying "Perfect Storms" (high latency, drops) against the *actual* Execution Engine.

## 5. Conclusion

The user's challenge was correct. The existence of `titan-ai-quant` solves *Strategy Backtesting* but effectively masks the lack of *System Replay*.
To achieve the "Simulation and Replay Engineer" mission, we must bridge the gap: refactor `titan-execution-rs` to be deterministic enough to run inside the simulation loop.
