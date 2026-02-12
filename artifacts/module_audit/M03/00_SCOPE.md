# Module: M03

## Identity
- **Name**: Phase 2: Hunter (Holographic Market Structure Engine)
- **Purpose**: Institutional trend following, Swing trading, POI detection
- **Architectural plane**: Instinct (Limbic System)

## Code Packages (exhaustive)
- `services/titan-phase2-hunter/`
- `package.json`

## Owner Surfaces
- **Human-facing**:
    - Headless Console (Logs)
    - Health API: (via HealthServer?)
- **Machine-facing**:
    - NATS Publisher: `titan.cmd.execution.>` (via SignalClient)
    - NATS Publisher: `titan.evt.phase.posture.hunter`
    - NATS Subscriber: `titan.evt.marketing.regime` (Regime Updates)
    - NATS Subscriber: `titan.evt.finance.budget` (Budget Updates)

## Boundaries
- **Inputs**:
    - Binance Spot AggTrades (CVD Validation)
    - Bybit Perps Candles (Hologram Scanning)
    - Market Regime (from M07/Brain)
- **Outputs**:
    - Execution Intents (NATS)
    - Hologram State (Posture)
- **Dependencies** (other modules):
    - `M06` (NATS), `M10` (Shared)
    - `M07` (AI Quant - Regime)
    - `M01` (Brain - Budget)
- **Non-goals**:
    - HFT Scalping (M02)
    - Arbitrage
