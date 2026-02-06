# Research & Reproducibility Standards

> **Status**: Canonical
> **Philosophy**: Scientific Skepticism

In Titan, we assume all backtests are overfit until proven otherwise.

## 1. The Burden of Proof

Any new strategy (Phase) or parameter change (AI Quant) must pass the **Triple Gate**:

1.  **Backtest (Simulation)**: Does it work on historical data?
2.  **Forward Test (Paper)**: Does it work on live data without money?
3.  **Canary Test (Live)**: Does it work with $100?

## 2. Methodology

### 2.1 Walk-Forward Optimization
Strategies must be trained on Period A and tested on Period B.
- **Train**: Jan - Jun
- **Test**: Jul - Dec
- **Invariant**: Testing on Training data is forbidden.

### 2.2 Regime Bucketing
Strategies must be tagged with their intended regime.
- `BULL_TREND`
- `BEAR_TREND`
- `CHOP_SIDEWAYS`
- `HIGH_VOLATILITY`

Performance is measured *conditioned on the regime*. A Trend strategy losing money in Chop is acceptable (if Brain allocates 0 to it).

### 2.3 Transaction Costs (The Killer)
Simulations must include:
- **Taker Fee**: 0.055% (Standard) or 0.02% (VIP).
- **Slippage**: Assumed 5bps + volatility impact.
- **Latency**: Assumed 50ms internal + 50ms network.

## 3. Rejection Criteria

A strategy is **REJECTED** if:
- Sharpe Ratio < 1.0 (Annualized).
- Max Drawdown > 20%.
- Correlation to BTC Buy & Hold > 0.8 (We seek alpha, not beta).
