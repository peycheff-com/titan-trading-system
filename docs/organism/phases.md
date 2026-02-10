# Organism Phases (Specialized Organs)

> **Status**: Canonical
> **Concept**: Division of Labor

The Titan Organism trades through distinct "Phases" or organs. Each Phase has a specific psychological profile, capital mandate, and kill condition.

## 1. Phase 1: Scavenger (The Trap)

*Detailed in `services/titan-phase1-scavenger`*

- **Profile**: High frequency, low latency, mean reversion.
- **Microstructure**: Order Book Imbalance, Trap detection.
- **Capital**: Minimal ($200 - $5,000). High leverage (up to 10x).
- **Goal**: "Scavenge" small inefficiencies. High win-rate, small R/R.
- **Kill Condition**: consecutive_losses > 5.

## 2. Phase 2: Hunter (The Eye)

*Detailed in `services/titan-phase2-hunter`*

- **Profile**: Trend following, Breakout, Holographic Support/Resistance.
- **Microstructure**: Volume Profile (VPVR), Fibonacci, Market Structure.
- **Capital**: Moderate ($5k - $50k). Medium leverage (3-5x).
- **Goal**: Catch the "Meat" of the move. Looser stops, higher R/R.
- **Kill Condition**: Volatility < Threshold (Market is dead).

## 3. Phase 3: Sentinel (The Shield)

*Detailed in `services/titan-phase3-sentinel`*

- **Profile**: Market Neutral, Basis Arbitrage (Spot vs Perp).
- **Microstructure**: Funding Rate disparity.
- **Capital**: High ($50k+). Low leverage (1x - 3x).
- **Goal**: Yield farming. Fund the other phases.
- **Kill Condition**: Funding Rate flips negative.

## 4. The Brain (The Cortex)

*Detailed in `services/titan-brain`*

- **Profile**: Meta-Strategy.
- **Role**:
  - **Does not generate signals**.
  - **Evaluates signals** from Phases 1-3.
  - **Allocates capital** dynamically based on Regime.
  - **Example**: In "High Volatility Bull", Brain maximizes Phase 2 (Hunter) and minimizes Phase 3 (Sentinel).

## 5. Phase Contracts (The Interface)

All phase services (Scavenger, Hunter, Sentinel) must implement:

1. **Signal Emission**:
    - Subject: `titan.evt.<phase_name>.signal.v1` (e.g., `titan.evt.scavenger.signal.v1`)
    - Payload: `IntentEnvelope<SignalPayload>`
2. **Telemetry**:
    - Subject: `titan.evt.phase.diagnostics.v1`
    - Rate: 1Hz
3. **Command Listener**:
    - Subject: `titan.cmd.<phase_name>.v1.>` (e.g., `titan.cmd.hunter.v1.>`)
    - Action: Update internal parameters (e.g., stop loss width) on the fly.
