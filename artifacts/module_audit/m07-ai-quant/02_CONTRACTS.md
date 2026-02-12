# M07 Contracts: AI Quant

> **Module**: `titan-ai-quant`
> **Date**: 2026-02-11

## 1. API Contracts
### NATS Subjects
| Subject | Direction | Payload | Description |
|---------|-----------|---------|-------------|
| `system.cmd.ai.optimize` | Sub | `{ scope?: string }` | Triggers immediate optimization run. |
| `system.cmd.ai.optimize.proposal` | Pub | `OptimizationProposal` | Broadcasts a generated proposal. |
| `market.evt.regime.update` | Pub | `RegimeSnapshot` | Broadcasts detected market regime changes. |

### HTTP Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Kubernetes readiness probe (200 OK). |
| GET | `/status` | Service status and optimizer state. |
| POST | `/trigger` | Manually triggers the optimization workflow. |

## 2. Configuration Contract
The service consumes and modifies `config/phase1.config.json`.
**Schema Requirements**:
-   `traps.*.stop_loss`: Number (0.001 - 0.05)
-   `traps.*.risk_per_trade`: Number (0.001 - 0.05)
-   `traps.*.enabled`: Boolean

## 3. Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | API key for Google Generative AI. |
| `NATS_URL` | No | Defaults to `nats://localhost:4222`. |
| `PORT` | No | Defaults to 3000. |
