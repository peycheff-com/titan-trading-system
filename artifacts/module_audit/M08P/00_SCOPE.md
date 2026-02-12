# Module: M08P

## Identity
- **Name**: M08P — PowerLaw Lab
- **Purpose**: Fat-tail estimation, Volatility clustering, Risk metrics
- **Architectural plane**: Cortex (Math Library)

## Code Packages (exhaustive)
- `services/titan-powerlaw-lab/`
- `package.json`

## Owner Surfaces
- **Human-facing**:
    - None (Library/Service)
- **Machine-facing**:
    - NATS Subscriber: `titan.data.market.trade.>` (feeds estimators)
    - NATS Publisher: `titan.data.metrics.powerlaw.>`

## Boundaries
- **Inputs**:
    - Trade Stream (NATS)
- **Outputs**:
    - Alpha metrics (Power Law exponent, Volatility state)
- **Dependencies** (other modules):
    - `M06` (NATS), `M10` (Shared)
- **Non-goals**:
    - Execution
    - State Persistence (Stateless estimators?)
