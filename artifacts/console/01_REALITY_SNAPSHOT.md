# 01 Reality Snapshot (Feb 2026)

## 0.1 Inventory

### UIs
- **titan-console** (`apps/titan-console`):
  - Stack: React, Vite, Tailwind, Shadcn/UI, Lucide React.
  - State: `@tanstack/react-query`.
  - Backend: Connects to `titan-brain` (HTTP + WS).
  - Status: Active, corresponds to "existing console UI".

### Services
- **titan-brain** (`services/titan-brain`):
  - Role: Master Orchestrator & Console Backend.
  - Tech: Node.js, TypeScript.
  - API: HTTP (Express/Fastify) + WS + NATS.
  - Controllers: Admin, Audit, Venues, Dashboard, Ledger, Safety, Signal, Config.
- **titan-execution** (`services/titan-execution-rs`):
  - Role: Execution Engine.
  - Tech: Rust.
- **titan-scavenger** (`services/titan-phase1-scavenger`): Phase 1 Strategy.
- **titan-hunter** (`services/titan-phase2-hunter`): Phase 2 Strategy (Data Ingestion).
- **titan-sentinel** (`services/titan-phase3-sentinel`): Phase 3 Strategy (Guard).
- **titan-ai-quant** (`services/titan-ai-quant`): Phase 4 Strategy.
- **titan-powerlaw-lab** (`services/titan-powerlaw-lab`): Research/Lab.

### Infrastructure
- **Message Bus**: NATS JetStream (referenced in all services).
- **Persistence**: Postgres (`titan-brain`, `titan-execution`?), Redis (Cache).
- **Monitoring**: Prometheus, Grafana, Tempo.
- **Proxy**: Traefik (v3.0).

### Shared Schemas & Libs
- **@titan/shared** (`packages/shared`):
  - Schemas: `venue-status.ts` (Active), `orderbook.ts`.
  - Missing: `OpsCommand` (Requested in Part 2).

### Deployment
- **Canonical**: `docker-compose.prod.yml` (Production Profile).
- **Images**: `ghcr.io/peycheff-com/titan-trading-system/*`.

## 0.2 Current Ops Flow
- **Current**: CLI / Manual env edits implied by request.
- **Desired**: `titan-opsd` (Ops Daemon) + `titan-console-api` (Separated control plane).
- **Gap**:
  - `titan-opsd` does not exist.
  - `titan-console-api` is effectively embedded inside `titan-brain`.

## 0.3 Key Findings
- `titan-brain` is currently the single source of truth for both Trading Logic and Operator Console implementation.
- `VenueStatus` is correctly centralized in `@titan/shared`.
