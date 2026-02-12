# Module: M01

## Identity
- **Name**: Titan Brain (The Orchestrator)
- **Purpose**: Strategy coordination, capital allocation, high-level risk management
- **Architectural plane**: Cortex (Memory/Decision)

## Code Packages (exhaustive)
- `services/titan-brain/`
- `package.json` (Dependencies: `@titan/shared`, `fastify`, `nats`, `pg`, `redis`, `ioredis`)

## Owner Surfaces
- **Human-facing**:
    - Dashboard API: `:3000/dashboard`
    - Webhook API: `:3000/signal`
    - WebSocket: `:3101/ws/console`
    - Admin API: `:3000/admin` (Guarded)
- **Machine-facing**:
    - NATS Publisher: Commands (`TITAN_CMD`), Risk State (`TITAN_EVT_RISK`)
    - NATS Consumer: Execution Reports, Market Data, Governance Proposals

## Boundaries
- **Inputs**:
    - Market Signals (Webhooks/NATS)
    - Execution Reports (NATS)
    - Operator Overrides (API/NATS)
    - Truth Snapshots (NATS)
    - Governance Proposals (NATS)
- **Outputs**:
    - Broker Intents (NATS - via Execution Engine)
    - Risk State Updates (NATS)
    - Allocations (NATS/API)
    - Notifications (Discord/Slack - via NotificationService)
- **Dependencies** (other modules):
    - `M06` (NATS), `M08` (Postgres), `M05` (Execution)
    - `M10` (Shared Types)
    - `M02` (Scavenger - via Phase Interface)
- **Non-goals**:
    - Low-latency execution (delegated to M05)
    - Exchange connectivity (delegated to M05)
    - Private Key Management (delegated to M05/Vault)
