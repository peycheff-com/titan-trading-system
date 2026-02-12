# M08P — Contract Inventory

> **Rule**: If an integration exists without a contract listed here, it is a production bug.

## NATS Subjects (this module)
| Subject | Direction | Schema | Signed? | Idempotency |
|---------|-----------|--------|---------|-------------|
| `titan.data.metrics.powerlaw.>` | Publish | `PowerLawMetric` | No | Stream |
| `titan.data.market.trade.>` | Subscribe | `Trade` | No | Stream |

## API Contracts
| Endpoint | Method | Auth | Rate Limit | Notes |
|----------|--------|------|------------|-------|
| N/A | — | — | — | Pure Worker |

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
| `NATS_URL` | URL | localhost:4222 | Yes |

