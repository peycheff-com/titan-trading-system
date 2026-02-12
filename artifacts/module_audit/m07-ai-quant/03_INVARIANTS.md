# M07 Invariants: AI Quant

> **Module**: `titan-ai-quant`
> **Date**: 2026-02-11

## 1. Safety Invariants
1.  **Risk Cap**: No optimization proposal shall ever suggest `risk_per_trade > 0.05` (5%) or `stop_loss > 0.20` (20%). Enforced by `Guardrails.ts`.
2.  **Validation Requirement**: No configuration change is applied automatically unless:
    -   It passes backtesting (Proposal PnL > Baseline PnL).
    -   Drawdown does not increase by > 10%.
    -   Confidence score >= `autoApplyThreshold` (0.8).
3.  **Rate Limit Adherence**: The service shall never exceed the configured Gemini API rate limits (default 10 RPM). Enforced by `RateLimiter.ts`.

## 2. Structural Invariants
1.  **Config Integrity**: Applications of proposals must result in a valid JSON structure that matches the `Config` interface.
2.  **Atomic Updates**: Configuration updates are atomic (write-replace) to prevent partial reads by other services.

## 3. Operational Invariants
1.  **Graceful Degeneracy**: If NATS is unavailable, the service starts in "standalone" mode (HTTP only).
2.  **Resource Bounding**: Backtests are limited to `maxPeriodDays` (30) to preventing memory exhaustion.
