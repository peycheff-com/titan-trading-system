# M03 — Contract Inventory

> **Rule**: If an integration exists without a contract listed here, it is a production bug.

## NATS Subjects (this module)
| Subject | Direction | Schema | Signed? | Idempotency |
|---------|-----------|--------|---------|-------------|
| `titan.cmd.execution.place.v1.>` | Publish | `IntentEnvelope` | **Yes (HMAC)** | `signal_id` |
| `titan.evt.phase.posture.hunter` | Publish | `PhasePosture` | No | State-based |
| `titan.evt.phase.diagnostics.hunter` | Publish | `PhaseDiagnostics` | No | State-based |
| `titan.evt.marketing.regime` | Subscribe | `RegimeState` | No | Stream |
| `titan.evt.finance.budget` | Subscribe | `BudgetUpdate` | No | Stream |

## API Contracts
| Endpoint | Method | Auth | Rate Limit | Notes |
|----------|--------|------|------------|-------|
| `/health` | GET | None | — | K8s Probe |

## Exchange API Contracts
| Exchange | Protocol | Rate Limit | Error Handling |
|----------|----------|------------|----------------|
| Binance Spot | WS (AggTrade) | — | Batching |
| Bybit Perps | REST (Candles) | — | 5m Interval |

## Config and Environment
| Key | Type | Default | Fail-Closed? |
|-----|------|---------|--------------|
| `HEADLESS_MODE` | Boolean | false | No |
| `NATS_URL` | URL | localhost:4222 | Yes |

