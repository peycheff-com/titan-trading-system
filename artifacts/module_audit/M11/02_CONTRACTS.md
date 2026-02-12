# M11 — Contract Inventory

> **Rule**: If an integration exists without a contract listed here, it is a production bug.

## NATS Subjects (this module)
| Subject | Direction | Schema | Signed? | Idempotency |
|---------|-----------|--------|---------|-------------|
| N/A | — | — | — | — |

## API Contracts
| Endpoint | Method | Auth | Rate Limit | Notes |
|----------|--------|------|------------|-------|
| `/api/*` | REST | JWT | — | Consumes M12 |

## Exchange API Contracts
| Exchange | Protocol | Rate Limit | Error Handling |
|----------|----------|------------|----------------|
| N/A | — | — | — |

## DB Tables Owned
| Table | Partitioned? | RLS? | Owner Service |
|-------|-------------|------|---------------|
| None | — | — | — |

## Config and Environment
| Key | Type | Default | Fail-Closed? |
|-----|------|---------|--------------|
| `API_URL` | URL | /api | Yes |
| `VITE_PORT` | Number | 8080 | No |

