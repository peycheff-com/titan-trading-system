# Titan Reliability Audit Report - Jan 2026

**Date:** Jan 21, 2026
**Auditor:** Reliability Engineer (Antigravity)
**Scope:** `titan-brain`, `titan-execution-rs`, Infrastructure, Runbooks

## Executive Summary

The Titan Trading System exhibits a "Tale of Two Cities" reliability posture.

**Strengths:** The **RiskGuard** implementation in `titan-execution-rs` is a standout success, implementing "Fail Closed" logic, heartbeat monitoring, and slippage protections that align perfectly with the "Safe Defaults" mission. Similarly, `titan-brain`'s **StartupManager** provides robust, dependency-aware initialization.

**Weaknesses:** The system utterly fails the **Operator Communication** requirement. `titan-execution-rs` exposes a stubbed `/health` endpoint that returns "ok" even if NATS is disconnected, creating a dangerous "Silent Risk" scenario. Neither service implements the required `/status` semantics (Mode, Operator Actions). Runbooks are generic operational guides rather than specific failure-mode manuals.

**Overall Status:** 🔴 **Partially Compliant (Critical Gaps Identified)**

---

## 1. Health & Status Architecture

### Requirement 1: Dependency-Aware Health
*Mission: `/health` must be a verdict over dependencies (NATS, Postgres, Truth).*

| Service | Status | Findings |
| :--- | :--- | :--- |
| **Titan Brain** | 🟡 **Partial** | `HealthManager` checks Database and Config. Checks Memory. Checks generic "Services". **MISSING:** Explicit Truth Layer confidence check, NATS JetStream consumer lag check. |
| **Titan Execution** | 🔴 **FAIL** | `api.rs` returns hardcoded `{"status": "ok"}`. It does **not** check NATS connection, Redb status, or Market Data internal state. **Critical Risk:** Orchestrator cannot detect Execution zombie state. |

### Requirement 2: Operator-Actionable Status
*Mission: `/status` provides Mode (Normal/Cautious/Halted), Reasons, and Operator Actions.*

| Service | Status | Findings |
| :--- | :--- | :--- |
| **Titan Brain** | 🔴 **FAIL** | `/status` is an alias for `/health`. Returns JSON with component status but **no** `mode`, `operator_actions`, or `unsafe_actions`. |
| **Titan Execution** | 🔴 **FAIL** | Endpoint does not exist. |

---

## 2. Safe Degradation & Risk Controls

### Requirement 3: Safe Defaults Under Uncertainty
*Mission: Stop new risk if truth confidence low or event lag high.*

| Component | Status | Findings |
| :--- | :--- | :--- |
| **RiskGuard (Rust)** | 🟢 **PASS** | **Excellent implementation.** <br>- **Heartbeat:** Fails closed if Brain heartbeat > 5s (auto-switches to Defensive).<br>- **Slippage:** Auto-degrades to Cautious/Defensive on high slippage.<br>- **Allow-Close:** Correctly allows `Close` intents while blocking `Open` in Defensive mode.<br>- **Policies:** Enforces Daily Loss, Max Notional, Whitelists. |
| **Brain CircuitBreaker** | 🟡 **Partial** | Implements Hard (Drawdown) and Soft (Consecutive Loss) breakers. **Gap:** Does not appear to trigger based on *infrastructure* health (e.g., if Postgres is slow, does it stop quoting?). |

### Requirement 4: Reliability Patterns
*Mission: Graceful shutdown, Startup safety, Idempotent retries.*

| Pattern | Status | Findings |
| :--- | :--- | :--- |
| **Startup Safety** | 🟢 **PASS** | `StartupManager` (Brain) and `main.rs` (Rust) both verify dependencies before serving. Rust fails fast if NATS connect fails. |
| **Graceful Shutdown** | 🟢 **PASS** | `StartupManager` handles SIGTERM/SIGINT with handlers. Rust `nats_handle.abort()` is present. |
| **Config Validation** | 🟢 **PASS** | `validateEnvironment` in Brain and `load_secrets_from_files` in Rust ensure valid state at boot. |

---

## 3. Runbooks & Incident Response

### Requirement 5: Specific Incident Plans
*Mission: Runbooks for Truth Collapse, Backlog, Disconnect Storms.*

| Runbook | Status | Findings |
| :--- | :--- | :--- |
| **Truth Collapse** | 🔴 **Missing** | No documentation on how to handle low confidence scoring or reconciliation failures. |
| **Bus Backlog** | 🔴 **Missing** | No guide on handling NATS JetStream accumulation or redelivery storms. |
| **Adapter Storms** | 🔴 **Missing** | No "Defense against Dark Arts" guide for exchange connection cycling/bans. |
| **Cancel Failure** | 🔴 **Missing** | No emergency manual flattening procedure defined. |
| **General Ops** | 🟡 **Partial** | `runbooks.md` covers "Global Halt" and "Secret Rotation". Useful, but insufficient for Reliability Engineering standards. |

---

## 4. SLO Framework

### Requirement 6: Defined SLOs
*Mission: Define Command-to-Ack, Fill-to-Position, Reconciliation Freshness.*

*   **Status:** 🔴 **FAIL**
*   **Findings:** Metrics libraries (`prom-client`, `actix-web-prom`) are installed, but there is no evidence of defined **SLO Thresholds** or **Error Budget** policies in the codebase.
*   **Implication:** System runs "best effort". No automated tightening of posture when budgets burn.

---

## 5. Infrastructure & Edge Reliability

### Infrastructure (Docker)
*   **Restart Policy:** 🟢 **PASS**. All services use `restart: unless-stopped`.
*   **Dependency Order:** 🟢 **PASS**. `depends_on` uses `condition: service_healthy` for NATS/Redis/Postgres.
*   **Resource Limits:** 🟡 **Partial**. Postgres has CPU/Mem limits defined. Brain/Execution do **not**, risking safe OOM behavior.
*   **Database Config:** 🟢 **PASS**. Postgres tuned with `max_connections=100`, `checkpoint_completion_target=0.9`, `min_wal_size=1GB`.

### Edge Services (Sentinel, Scavenger)
*   **Scavenger:** 🟡 **Partial**. Has `HealthServer.ts` but likely stubbed.
*   **Sentinel:** 🔴 **CRITICAL FAIL**. No `health` or `HealthServer` found in codebase. Service runs blind.

### NATS Configuration
*   **Persistence:** 🟢 **PASS**. Execution stream uses `StorageType::File`.
*   **Retention:** 🔴 **Risk**. Uses `Default::default()` for `stream::Config`. This creates a stream with *default* limits (which might be unlimited size/age), potentially filling disk or memory buffers indefinitely. Must be explicit (`max_age`, `max_bytes`).

---

## Recommendations & Remediation Plan

### Immediate Priority (System Safety)
1.  **Fix Titan Execution Health:**
    *   Update `api.rs` to check:
        *   `nats_client.connection_state()`
        *   `market_data_engine.is_stale()`
        *   `risk_guard.is_defensive()`
    *   Return 503 if NATS is down.
2.  **Unhide Risk State:**
    *   Expose `risk_guard.get_state()` via GET `/status` in Titan Execution.
    *   Show current `Mode` (Normal/Cautious/Defensive).

### High Priority (Operator Usability)
3.  **Implement Standardized `/status` Response:**
    *   Create a shared DTO for:
        ```json
        {
          "mode": "NORMAL",
          "reasons": [],
          "operator_actions": ["Monitor logs"],
          "unsafe_actions": [],
          "dependencies": [...]
        }
        ```
    *   Implement in both Brain and Execution.

### Medium Priority (Process)
4.  **Author Missing Runbooks:**
    *   Draft `TruthConfidenceCollapse.md` and `EventBusBacklog.md`.
    *   Define CLI commands for "Shed Load" and "Flush Queue".
5.  **Define SLOs:**
    *   Create `monitoring/slos.yaml` defining the P99 targets.

---

*Signed,*
*Reliability Engineer*
