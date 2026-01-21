# Reliability Engineering Implementation Plan

**Objective:** Address critical reliability gaps identified in the Jan 2026 Audit (missing health/status, blind spots, config risks).

## User Review Required

> [!IMPORTANT]
> **API Contract Change:** `titan-execution-rs` and `titan-brain` endpoints `/health` and `/status` will be standardized.
> - `/health`: Returns 200/503 based on ability to serve. Simple boolean check for Load Balancers.
> - `/status`: Returns 200 with JSON payload containing `mode` (NORMAL, CAUTIOUS, DEFENSIVE), `reasons`, and `actions`.

> [!WARNING]
> **NATS Retention:** We are enforcing explicit limits on the `TITAN_EXECUTION` stream (`max_age=24h`, `max_bytes=1GB`). This will cause old events to be purged, which is desired behavior but technically a change.

> [!WARNING]
> **Sentinel Port Change:** Updating `titan-sentinel` to use `PORT` env var properly (default to 8084 to match docker-compose, was hardcoded 8080 orenv).

## Proposed Changes

### Phase 1: Critical Observability & Safety

#### [Titan Execution (Rust)](/services/titan-execution-rs)
*   **[MODIFY]** `api.rs`: Implement Dependency-Aware Health Check (NATS, RiskGuard).
*   **[MODIFY]** `api.rs`: Implement `/status` endpoint exposing `RiskGuard` state.
*   **[MODIFY]** `main.rs`: Wire up NATS connection state and RiskGuard state to API.
*   **[MODIFY]** `main.rs`: Set explicit NATS Stream retention policy.

#### [Titan Sentinel](/services/titan-phase3-sentinel)
*   **[MODIFY]** `src/index.tsx`: Implement robust `HealthServer` (mirroring Scavenger pattern) checking NATS and Exchange Gateways. Ensure port 8084.

#### [Titan Brain](/services/titan-brain)
*   **[MODIFY]** `src/server/controllers/HealthController.ts`: Split `/health` and `/status`. Implement `SystemMode` logic (Healthy vs Degraded vs Maintenance).

### Phase 2: Infrastructure Hardening

#### [Infrastructure](/docker-compose.prod.yml)
*   **[MODIFY]** `docker-compose.prod.yml`: Add `deploy.resources.limits` to `titan-brain` and `titan-execution`.
    *   Brain: 1GB Mem, 1.0 CPU
    *   Execution: 512MB Mem, 1.0 CPU

### Phase 3: Runbooks & SLOs

#### [Documentation](/docs/operations)
*   **[NEW]** `docs/operations/reliability/truth-collapse.md`: Runbook for Truth Confidence loss.
*   **[NEW]** `docs/operations/reliability/event-bus-backlog.md`: Runbook for NATS backup.
*   **[NEW]** `monitoring/slos.yaml`: Definition of P99 Latency and Availability targets.

## Verification Plan

### Automated Tests
1.  **Health Check Verification:**
    *   Stop NATS: Verify `/health` returns 503 for all services.
    *   Stop Redis: Verify Brain `/health` returns 503.
    *   Start NATS/Redis: Verify `/health` recovers to 200.
2.  **Status Endpoint Verification:**
    *   Curl `/status` on all services, inspect structure `{"mode": "...", "actions": [...]}`.

### Manual Verification
1.  **Sentinel Port:** Verify `titan-sentinel` is reachable on 8084.
2.  **Docker Limits:** Inspect `docker stats` to ensure limits are applied.
3.  **Runbook Review:** Read through new MD files.
