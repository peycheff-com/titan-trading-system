# M07 Drift Control: AI Quant

> **Module**: `titan-ai-quant`
> **Date**: 2026-02-11

## 1. Strategy Drift
The module is the **primary agent of drift** (intentional optimization). Control mechanisms ensure this drift is positive.

### Controls
1.  **Backtesting Gatekeeper**:
    -   Every proposal MUST pass specific backtest criteria (`PnL > Baseline`, `Drawdown < Baseline * 1.1`).
    -   *Implementation*: `TitanAnalyst.validateProposal`.
2.  **Safety Bounds**:
    -   Hard limits on all parameters (e.g., `max_leverage <= 20`).
    -   *Implementation*: `Guardrails.PARAMETER_BOUNDS`.
3.  **Confidence Threshold**:
    -   Proposals with AI confidence < 0.8 are rejected or flagged for manual review.

## 2. Infrastructure Drift
-   **Config Integrity**: `ConfigSchema.ts` (Zod) ensures `config.json` always matches the expected structure.
-   **State Reconciliation**: `OptimizationWorkflow` reloads config from disk before every run to ensure it works on the latest state.

## 3. Data Drift
-   **Market Regimes**: The module consumes `RegimeSnapshot` to adapt to changing market conditions (e.g., stopping trading during high volatility).
-   **Model Drift**: If Gemini 1.5 performance degrades, `Backtester` validation rates will drop, naturally halting parameter updates.
