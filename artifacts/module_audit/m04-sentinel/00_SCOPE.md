# Module M04: Titan Phase 3 - Sentinel

## 1. Scope
**ID**: M04
**Name**: Titan Phase 3: Sentinel
**Path**: `services/titan-phase3-sentinel`
**Type**: Service
**Owner**: Agent

### Description
Sentinel is a market-neutral hedge fund system designed for basis arbitrage, funding rate collection, and vacuum arbitrage. It operates with a delta-neutral strategy, leveraging off-chain logic for execution and risk management.

### Key Components
- **SentinelCore**: The central engine coordinating the strategy.
- **StatEngine**: Calculates statistical metrics (z-scores, volatility) for signals.
- **PortfolioManager**: Manages positions and balances across exchanges.
- **VacuumMonitor**: Detects and acts on vacuum arbitrage opportunities.
- **PolymarketClient**: Interface for Polymarket interactions (prediction markets).
- **Execution**: Fast-path and TWAP executors.

## 2. Boundaries
- **Inbound**: 
    - Market Data (NATS)
    - Execution Reports (NATS)
    - Control Signals (NATS/RPC)
- **Outbound**:
    - Orders (NATS)
    - Risk Metrics (NATS)
    - Telemetry (NATS)

## 3. Interfaces
- **NATS Subjects**:
    - `market.data.*` (Subscribe)
    - `execution.order.*` (Publish)
    - `risk.limits` (Subscribe)
    - `system.heartbeat` (Publish)

## 4. Dependencies
- `@titan/shared`: Core utilities and types.
- `ink`, `react`: Terminal UI for the dashboard.
- `undici`: HTTP client.
- `fast-check`: Property-based testing.
