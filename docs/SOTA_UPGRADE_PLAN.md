# Titan SOTA Upgrade Plan

## 1. Discovery & Inventory (Current State)

### 1.1 Service Map
From `docker-compose.prod.yml`:

| Service | Technology | Port | Dependencies |
|---------|------------|------|--------------|
| `titan-brain` | Node.js (TS) | 3100 | NATS, Redis, Postgres |
| `titan-execution` | Rust | 3002 | NATS |
| `titan-console` | React/Vite | 8080 | Brain (HTTP/WS) |
| `titan-ai-quant` | Node.js | 8082 | NATS, Weaviate |
| `titan-scavenger` (P1) | Node.js | 8081 | Brain, Binance/Bybit |
| `titan-hunter` (P2) | Node.js | 8083 | Brain, NATS |
| `titan-sentinel` (P3) | Node.js | 8084 | Brain |
| `titan-powerlaw-lab` | Node.js | - | NATS |

### 1.2 Infrastructure
*   **Messaging**: NATS JetStream (Port 4222)
*   **Storage**: Postgres (5432), Redis (6379)
*   **Observability**: Prometheus (9090), Grafana (3000), Tempo (Traces)
*   **Proxy**: Traefik (80/443)

### 1.3 Baseline Capabilities

*   **Risk Policy**:
    *   **Rust**: Embeds `risk_policy.json` at compile time. Has SHA256 hash logic (`RiskPolicy::get_hash()`).
    *   **Brain**: Verifies Execution policy hash on leadership promotion (Handshake).
    *   **Gap**: No per-command policy hash enforcement in `titan.execution` commands. Runtime drift is possible if Execution restarts with old image.

*   **Truth & Reconciliation**:
    *   `titan-brain` has `ReconciliationService` and `TruthRepository`.
    *   `titan-execution` has `MarketDataEngine` acting as local truth.
    *   **Gap**: No formalized "Truth Score" (0-100) visible to operators. No hard-gating of *new* risk based on score (currently relies on generic health checks or manual intervention).

*   **JetStream**:
    *   Stream `TITAN_EXECUTION` created in `main.rs`.
    *   **Gap**: No boot-time "Spec Verification" (Integrity Check). If stream config drifts in NATS, app might behave unpredictably. No alerts on redelivery/lag.

*   **DLQ**:
    *   **Gap**: No dedicated DLQ handling or schema found in discovery. Default NATS behavior (drop or block) likely active.

*   **Observability**:
    *   OpenTelemetry initialized in Rust.
    *   **Gap**: Need standardized `titan.*` attributes across all spans (Brain/Rust/Phases) for coherent traces.

*   **Deployment**:
    *   CI builds -> GHCR -> Deploy Script.
    *   **Gap**: No image signing (Cosign). No provenance attestation. Deploy script trusts whatever digest it downloads.

---

## 2. Workstreams & Implementation Plan

### A) Truth Layer Dominance
**Objective**: Automate the "Stop Trading" decision when state is uncertain.
*   [ ] **Truth Score**: Implement `CalculationEngine` in Brain to aggregate discrepancies (Position, Orders, Latency) into a 0-100 score.
*   [ ] **Gating**: Brain `RiskGuardian` must reject `OpenPosition` commands if Score < Threshold.
*   [ ] **Signals**: Execution must publish `titan.execution.truth` periodic snapshots.

### B) Risk Immune System Hardening
**Objective**: Mathematical constraints that cannot be bypassed.
*   [ ] **Hash Enforcement**: Add `policy_hash` to `titan.cmd.execution.place`. Rust `NatsEngine` rejects mismatch.
*   [ ] **Circuit Breakers**: Formalize `BreakerState` in NATS events (`NORMAL` -> `DEFENSIVE` -> `HALTED`).
*   [ ] **Budgets**: Brain `BudgetService` to enforce daily loss/drawdown *before* sending orders.

### C) DLQ (Dead Letter Queue)
**Objective**: Operational triage for failed messages.
*   [ ] **Schema**: Create `titan.dlq.v1` event schema.
*   [ ] **Routing**: Configure NATS consumers to send max-deliver-exceeded msgs to `$JS.API.DIRECT.GET` or explicit DLQ subject.
*   [ ] **Tooling**: CLI/UI to replay or purge DLQ.

### D) JetStream Correctness
**Objective**: Deterministic messaging.
*   [ ] **Integrity Boot Check**: Service fails start if Stream Config != Expected Spec.
*   [ ] **Metrics**: Export `nats_consumer_lag`, `nats_redelivery_count`.

### E) Unified Observability
**Objective**: " One Trace to Rule Them All".
*   [ ] **Conventions**: Enforce `titan.intent_id`, `titan.phase_id` in all OTel spans.
*   [ ] **Dashboard**: Standardize Grafana "Service View".

### F) Execution Quality Gating
**Objective**: Don't trade if the venue is broken.
*   [ ] **Scoring**: Compute `slippage_bps` and `ack_latency_ms` rolling averages.
*   [ ] **Reaction**: If Quality < Threshold, reduce size or halt venue.

### G) Regime-aware Allocation
**Objective**: Adapt to market conditions.
*   [ ] **Inference**: Wire `titan-ai-quant` regime signals to Brain `AllocationEngine`.
*   [ ] **Mapping**: Regime -> Allowed Phase / Leverage.

### H) Power-law Tail-risk
**Objective**: Survive the black swan.
*   [ ] **Integration**: Brain subscribes to `titan.risk.powerlaw`.
*   [ ] **Defensive**: If Tail Risk > Threshold, force `DEFENSIVE` mode.

### I) Operator Console
**Objective**: High-context control.
*   [ ] **Views**: "Explain Decision" trace visualizer.
*   [ ] **Actions**: Authenticated "Halt", "Flatten", "Resume" buttons.

### J) Provable Deployment
**Objective**: Trust the artifact, not the pipe.
*   [ ] **Signing**: Use Cosign in CI to sign images.
*   [ ] **Gate**: `deploy.sh` verifies signature before `docker-compose up`.
