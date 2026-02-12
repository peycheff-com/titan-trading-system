# Module: M01

## Identity
- **Name**: Titan Brain (The Orchestrator)
- **Purpose**: Strategy coordination, capital allocation, high-level risk management
- **Architectural plane**: Cortex (Memory/Decision)

## Code Packages (exhaustive)
- `services/titan-brain/`
- `package.json`

## Owner Surfaces
- **Human-facing**:
    - Dashboard API: `:3000/dashboard`
    - Webhook API: `:3000/signal`
    - WebSocket: `:3101/ws/console`
- **Machine-facing**:
    - NATS Publisher: Commands (`TITAN_CMD`)
    - NATS Consumer: Events (`TITAN_EVT`)

## Boundaries
- **Inputs**:
    - Market Signals (Webhooks)
    - Execution Reports (NATS)
    - Operator Overrides (API)
- **Outputs**:
    - Broker Intents (NATS)
    - Notifications (Discord/Slack)
- **Dependencies** (other modules):
    - `M06` (NATS), `M08` (Postgres), `M05` (Execution)
    - `M10` (Shared Types)
- **Non-goals**:
    - Low-latency execution (delegated to M05)
    - Exchange connectivity (delegated to M05)
