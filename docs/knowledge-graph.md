# Titan Knowledge Graph

**Purpose:** This file maps high-level concepts to their concrete implementation files. Use this to quickly find the code responsible for a specific feature or domain.

| Domain | Concept | Implementation File | Documentation |
| :--- | :--- | :--- | :--- |
| **Orchestration** | Brain Service Entry | `services/titan-brain/src/index.ts` | `docs/components/titan-brain.md` |
| | Signal Processing | `services/titan-brain/src/flow/Signalprocessor.ts` | |
| | Circuit Breaker (State) | `services/titan-brain/src/risk/CircuitBreaker.ts` | `docs/risk/circuit_breakers.md` |
| | Database Schema | `services/titan-brain/src/db/schema.sql` | |
| **Execution** | Execution Engine Entry | `services/titan-execution-rs/src/main.rs` | `services/titan-execution-rs/README.md` |
| | Order Placement | `services/titan-execution-rs/src/main.rs` | `docs/explanation/execution-routing.md` |
| | Risk Guard (Rust) | `services/titan-execution-rs/src/risk_guard.rs` | |
| | HMAC Verification | `services/titan-execution-rs/src/security.rs` | `docs/security.md` |
| | Rate Limiting | `services/titan-execution-rs/src/rate_limiter.rs` | `docs/system-source-of-truth.md` |
| **Strategy** | Phase 1 (Scavenger) | `services/titan-phase1-scavenger/src/index.tsx` | |
| | Phase 2 (Hunter) | `services/titan-phase2-hunter/src/index.ts` | |
| | Phase 3 (Sentinel) | `services/titan-phase3-sentinel/src/index.tsx` | |
| | Risk Policy (Canonical) | `packages/shared/risk_policy.json` | `docs/risk/risk_policy.md` |
| **Infrastructure** | Docker Compose (Prod) | `docker-compose.prod.yml` | `docs/deployment-standard.md` |
| | NATS Configuration | `config/nats.conf` | `packages/shared/src/messaging/NatsClient.ts` |
| | CI Pipeline | `.github/workflows/ci.yml` | `docs/dev/quality-gates.md` |
| **Shared** | NATS Subjects | `packages/shared/src/messaging/powerlaw_subjects.ts` | |
| | Types & Schemas | `packages/shared/src/schemas/` | |
