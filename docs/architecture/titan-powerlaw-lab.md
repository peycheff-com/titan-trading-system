# Titan PowerLaw Lab (Experimental)

> **Status**: Experimental / Lab
> **Role**: Research into Fractal Market Analysis and Tail Estimation.

The PowerLaw Lab (`services/titan-powerlaw-lab`) is an experimental service designed to analyze market structure using non-Gaussian statistical methods. It is currently isolated from the hot-path execution loop.

## 1. Core Research Modules

**Source**: `src/`

- **Tail Estimators** (`tail-estimators.ts`): Implements Hill Estimators or similar power-law tail index calculations to detect phase shifts in market volatility.
- **Volatility Clustering** (`volatility-cluster.ts`): Analysis of volatility persistence (GARCH-like or fractal dimension analysis).
- **Estimator** (`estimator.ts`): Base abstractions for statistical estimation.

## 2. Integration Status

- **Trigger**: Currently runs as a standalone analysis service or via manual invocation.
- **Output**: Generates analysis reports/metrics; does not currently emit `titan.signal.submit` events to the Brain.
- **Purpose**: Validating the "Bulgaria Tax" hypothesis (fat tails) before integration into the Risk Guardian.

## 3. Roadmap

1. **Validation**: Backtest power-law signals against historical crash events.
2. **Integration**: Connect to `titan.signal.submit` as a "Veto" signal (e.g., "High Tail Risk" -> Reduce Leverage).
3. **Production**: Promote to a full "Phase" or specialized Risk Module.
