# Titan Power Law Lab (Phase 4 Research)

> **Context**: Service > Research Lab
> **Status**: Experimental / Lab
> **Role**: Research into Fractal Market Analysis and Tail Estimation.

Research environment for power law distribution analysis, market fractal validation, and Gemini AI integration. This service acts as the "Sandbox" for the **Titan AI Quant** phase.

## Purpose

- **Fractal Validation**: Confirming power law scaling in price action.
- **Parameter Optimization**: Using Gemini AI to find optimal parameters for Scavenger/Hunter/Sentinel phases.
- **Backtesting**: Running historical simulations.

## Installation

```bash
npm install
```

## Usage

```bash
# Run fractal analysis
npm run start:prod -- --mode=analyze --symbol=BTCUSDT

# Run AI optimization cycle
npm run optimize:ai
```

## Status
**Production Ready (Jan 2026)**. Consumes NATS events for real-time Hill Alpha calculation.

---

## Architecture Deep Dive

> **Note**: This section was merged from `docs/architecture/titan-powerlaw-lab.md`.

The PowerLaw Lab (`services/titan-powerlaw-lab`) is an experimental service designed to analyze market structure using non-Gaussian statistical methods. It is currently isolated from the hot-path execution loop.

### Core Research Modules

**Source**: `src/`

- **Tail Estimators** (`tail-estimators.ts`): Implements Hill Estimators or similar power-law tail index calculations to detect phase shifts in market volatility.
- **Volatility Clustering** (`volatility-cluster.ts`): Analysis of volatility persistence (GARCH-like or fractal dimension analysis).
- **Estimator** (`estimator.ts`): Base abstractions for statistical estimation.

### Integration Status

- **Trigger**: Currently runs as a standalone analysis service or via manual invocation.
- **Output**: Generates analysis reports/metrics; publishes to `titan.data.powerlaw.metrics.v1.*` and `titan.evt.powerlaw.*` subjects.
- **Purpose**: Validating the "Bulgaria Tax" hypothesis (fat tails) before integration into the Risk Guardian.

### Roadmap

1. **Validation**: Backtest power-law signals against historical crash events.
2. **Integration**: Connect to Brain as a "Veto" signal via `titan.evt.powerlaw.impact.v1` (e.g., "High Tail Risk" → Reduce Leverage).
3. **Production**: Promote to a full "Phase" or specialized Risk Module.
