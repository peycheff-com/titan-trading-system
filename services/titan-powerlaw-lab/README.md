# Titan Power Law Lab (Phase 4 Research)

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
