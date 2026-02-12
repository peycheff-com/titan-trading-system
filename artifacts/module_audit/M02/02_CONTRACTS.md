# M02 — Contract Inventory

> **Rule**: If an integration exists without a contract listed here, it is a production bug.

## NATS Subjects (this module)
| Subject | Direction | Schema | Signed? | Idempotency |
|---------|-----------|--------|---------|-------------|
| `titan.cmd.execution.place.v1.>` | Publish | `IntentEnvelope` | **Yes (HMAC)** | `signal_id` |
| `titan.evt.phase.posture.scavenger` | Publish | `PhasePosture` | No | State-based |
| `titan.evt.phase.diagnostics.scavenger` | Publish | `PhaseDiagnostics` | No | State-based |
| `titan.data.metrics.powerlaw.>` | Subscribe | `PowerLawMetric` | No | Stream |

## API Contracts
| Endpoint | Method | Auth | Rate Limit | Notes |
|----------|--------|------|------------|-------|
| `/health` | GET | None | — | K8s Probe |
| `ws://console` | WS | Token | — | Trap updates |

## Exchange API Contracts
| Exchange | Protocol | Rate Limit | Error Handling |
|----------|----------|------------|----------------|
| Binance Spot | WS/REST | 1200/min | Retry/Backoff |
| Bybit Perps | WS/REST | — | Read-only |

## Config and Environment
| Key | Type | Default | Fail-Closed? |
|-----|------|---------|--------------|
| `CONSOLE_URL` | URL | — | No |
| `NATS_URL` | URL | localhost:4222 | Yes (Metrics) |
| `NATS_USER` | String | — | Yes |

