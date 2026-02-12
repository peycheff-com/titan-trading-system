# M07 Failure Modes: AI Quant

> **Module**: `titan-ai-quant`
> **Date**: 2026-02-11

## 1. External Dependency Failures
### Gemini API Issues
-   **Rate Limited (429)**: `GeminiClient` retries with exponential backoff. If exhausted, the analysis is skipped for the cycle.
-   **Service Unavailable (5xx)**: Handled same as rate limits.
-   **Hallucination/Invalid JSON**: Parser catches invalid JSON. `Guardrails` catch valid JSON with unsafe values.

### Data Feed Issues
-   **Missing OHLCV**: `Backtester` throws `MISSING_OHLCV_DATA`. Workflow aborts gracefully or skips trades (configurable).
-   **Corrupt Trade Logs**: `DataLoader` skips malformed records.

## 2. Infrastructure Failures
### NATS Disconnection
-   **Effect**: Cannot publish `regime.update` or receive `cmd.ai.optimize`.
-   **Recovery**: Service logs warning and continues operation. Cron-based optimization still works.

### File System Permission Denied
-   **Effect**: Cannot update `config/*.json`.
-   **Recovery**: `OptimizationWorkflow` logs error on save attempt. Rollback is implicit (file unchanged).

## 3. Logic Failures
### Optimization Regression
-   **Scenario**: A proposal passes backtest but performs poorly in live trading.
-   **Mitigation**: `DriftControl` (Gate B) and manual monitoring. The module itself only validates on historical data.

### Memory Exhaustion
-   **Scenario**: Loading too many days of 1-minute OHLCV data.
-   **Mitigation**: Hard cap on `backtestPeriodDays`.
