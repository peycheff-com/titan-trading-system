# M17 — Contract Inventory

> **Rule**: If an integration exists without a contract listed here, it is a production bug.

## NATS Subjects (this module)
N/A — M17 does not publish/subscribe to NATS subjects directly. NATS ACL configuration is managed via `config/nats.conf`.

## API Contracts
| Endpoint | Method | Auth | Rate Limit | Notes |
|----------|--------|------|------------|-------|
| `/health` | GET | none | — | All services expose; checked by `smoke_prod.sh`, `wait-for-health.sh` |
| `/metrics` | GET | none | — | Prometheus scrape (`infra/monitoring/prometheus.yml`) |

## NATS ACL Contract (from `config/nats.conf`)
| Service Account | Publish | Subscribe |
|----------------|---------|-----------|
| `brain` | `>`, `$JS.API.>` | `>`, `_INBOX.>` |
| `execution` | `titan.evt.execution.>`, `titan.evt.phase.>` | `titan.cmd.execution.place.v1.>`, `titan.data.market.>`, `titan.cmd.sys.halt.v1` |
| `scavenger` | `titan.evt.scavenger.signal.v1`, `titan.evt.phase.>` | `powerlaw.metrics.>`, `titan.evt.budget.update.v1` |
| `hunter` | `titan.evt.hunter.>`, `titan.evt.phase.>` | `titan.cmd.hunter.>`, `powerlaw.metrics.>`, `titan.ai.>` |
| `sentinel` | `titan.evt.sentinel.>`, `titan.evt.phase.>` | `titan.cmd.sentinel.>`, `powerlaw.metrics.>` |
| `powerlaw` | `titan.evt.powerlaw.>`, `titan.data.powerlaw.>`, `titan.ai.>` | `titan.data.market.>`, `titan.evt.>` |
| `quant` | `titan.evt.quant.>`, `titan.cmd.ai.>` | `titan.cmd.ai.>`, `titan.evt.>`, `titan.data.powerlaw.>` |
| `console` | `$JS.API.>` | `titan.data.>`, `titan.evt.>` |

## Config and Environment
| Key | Type | Default | Fail-Closed? |
|-----|------|---------|--------------|
| `TITAN_TAG` | string | `latest` | No — defaults to latest |
| `POSTGRES_PASSWORD` | string | — (required) | Yes — PG won't start |
| `REDIS_PASSWORD` | string | `redis_password` | No — default dev password |
| `HMAC_SECRET` | string | — (required in prod-like) | Yes — `boot_prod_like.sh` checks |
| `TITAN_POSTURE` | string | `constrained_alpha` | Yes — posture file must exist |
| `NATS_USER` / `NATS_PASS` | string | per-service defaults | No — hardcoded in nats.conf |

## Error Taxonomy
| Code | Retryable | Fail-closed | Financial Impact? | Description |
|------|-----------|-------------|-------------------|-------------|
| Deploy smoke fail | No | Yes — logs failure, does not rollback automatically | No direct | Deployment left in potentially bad state |
| Health check timeout | No | No — warns only | No direct | Services may still be starting |
| Config validation fail | No | Yes — exits 1 | No direct | Prevents deployment with invalid config |
