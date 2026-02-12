# M07 Observability: AI Quant

> **Module**: `titan-ai-quant`
> **Date**: 2026-02-11

## 1. Logging
-   **Format**: JSON structured logs (via `ErrorHandler.ts` `ErrorLogger`).
-   **Destination**:
    -   File: `logs/ai-quant-errors.log` (Rotated, max 10MB).
    -   Console: Standard output for container log collectors.
-   **Levels**: Info (Workflow steps), Error (Failures/Exceptions).

## 2. Metrics
### Health Checks
-   `GET /health`: Returns 200 OK if process is running.
-   `GET /status`: Returns:
    -   `uptime`: Process uptime.
    -   `optimizer.running`: Boolean state of workflow.
    -   `optimizer.nextRun`: Next scheduled cron time.

### Business Metrics (via NATS & Logs)
-   `optimization.proposal.generated`: Count of proposals.
-   `optimization.proposal.applied`: Count of applied changes.
-   `optimization.impact.pnl`: Projected PnL improvement.

## 3. Alerting
-   **Critical**:
    -   `ERR_RATE_LIMIT`: Persistent Gemini API rate limits (workflow stalled).
    -   `ERR_CONFIG_WRITE`: Cannot save optimized config (permissions).
-   **Warning**:
    -   `WARN_LOW_CONFIDENCE`: AI proposals consistently rejected by backtester (model drift).
