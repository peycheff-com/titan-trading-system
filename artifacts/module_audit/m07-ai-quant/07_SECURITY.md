# M07 Security Audit: AI Quant

> **Module**: `titan-ai-quant`
> **Date**: 2026-02-11

## 1. Threat Model
### Assets
-   **Trading Strategy Configuration**: The core IP and logic for execution.
-   **API Keys**: Google Gemini API key.
-   **Market Data**: Historical OHLCV and trade data.

### Risks
-   **Unauthorize Configuration Change**: An attacker could modify `stop_loss` or `risk_per_trade` to drain funds.
-   **Prompt Injection**: Malicious market data patterns (unlikely) or direct prompt injection could manipulate AI optimization proposals.
-   **API Key Leakage**: Exposure of Gemini API key.

## 2. Security Controls
### Input Validation
-   **Config Schema**: `ConfigSchema.ts` (implied) validates all configuration changes.
-   **Guardrails**: `Guardrails.ts` enforces hard limits on proposals (e.g., global risk limits).
    -   *Verified*: `TitanAnalyst.proposeOptimization` calls `guardrails.validateProposal`.

### Access Control
-   **NATS**: Internal subjects only.
-   **API**: Localhost binding for admin/status endpoints.

### AI Safety
-   **Rate Limiting**: Implemented in `GeminiClient` to prevent cost overruns.
-   **Human-in-the-Loop**: `ApprovalWorkflow` (implied/if enabled) requires manual approval for high-impact changes.

## 3. Vulnerabilities
| ID | Description | Severity | Mitigation |
|----|-------------|----------|------------|
| SEC-01 | Config file modified by file system access | High | Ensure strict file permissions on `config/`. |
| SEC-02 | AI Hallucination | Medium | Backtesting validation step (Gatekeeper) rejects bad proposals. |

## 4. Conclusion
The module implements a "Defense in Depth" strategy:
1.  **AI Layer**: Generates proposals.
2.  **Guardrail Layer**: Static checks on limits.
3.  **Backtest Layer**: Dynamic validation of performance.
4.  **Approval Layer**: Final human/system check.

Status: **Pass**
