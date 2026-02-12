# Module: M02

## Identity
- **Name**: Phase 1: Scavenger (Predestination Engine)
- **Purpose**: High-frequency trap-based trading, Bulgaria Protocol
- **Architectural plane**: Reflex (Spinal Cord)

## Code Packages (exhaustive)
- `services/titan-phase1-scavenger/`
- `package.json`

## Owner Surfaces
- **Human-facing**:
    - Terminal UI (Ink): `npm start` (Legacy)
    - Headless Console: `npm start -- --headless`
    - Health API: `:8081/health`
- **Machine-facing**:
    - NATS Publisher: `titan.cmd.execution.>` (via SignalClient)
    - NATS Publisher: `titan.evt.phase.posture.scavenger`
    - Console WebSocket: `ws://localhost:3000` (Push updates)

## Boundaries
- **Inputs**:
    - Binance Spot AggTrades (WebSocket)
    - Bybit Perps Tickers (WebSocket)
    - PowerLaw Metrics (NATS)
- **Outputs**:
    - Execution Intents (NATS/IPC)
    - Trap Status (Console)
- **Dependencies** (other modules):
    - `M06` (NATS), `M10` (Shared)
    - `M11` (Console)
- **Non-goals**:
    - Long-term holding
    - Portfolio balancing (Brain)
