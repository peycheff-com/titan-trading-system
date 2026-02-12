# M12 — Contract Inventory

> **Rule**: If an integration exists without a contract listed here, it is a production bug.

## NATS Subjects (this module)
| Subject | Direction | Schema | Signed? | Idempotency |
|---------|-----------|--------|---------|-------------|
| `titan.cmd.>` | Publish | `Command` | **Yes (HMAC)** | `trace_id` |

## API Contracts
| Endpoint | Method | Auth | Rate Limit | Notes |
|----------|--------|------|------------|-------|
| `/api/auth/login` | POST | None | 5/min | Returns JWT |
| `/api/proxy/*` | ANY | JWT | 100/min | Proxies NATS/State |

## Exchange API Contracts
| Exchange | Protocol | Rate Limit | Error Handling |
|----------|----------|------------|----------------|
| N/A | — | — | — |

## DB Tables Owned
| Table | Partitioned? | RLS? | Owner Service |
|-------|-------------|------|---------------|
| `users` | No | Yes | Console API |

## Config and Environment
| Key | Type | Default | Fail-Closed? |
|-----|------|---------|--------------|
| `JWT_SECRET` | String | — | Yes |
| `TITAN_MASTER_PASSWORD` | String | — | Yes |
| `NATS_URL` | URL | localhost:4222 | Yes |

