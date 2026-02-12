# M13 — Contract Inventory

> **Rule**: If an integration exists without a contract listed here, it is a production bug.

## NATS Subjects (this module)
| Subject | Direction | Schema | Signed? | Idempotency |
|---------|-----------|--------|---------|-------------|
| `titan.ops.command.v1` | Subscribe | `OpsCommandSchemaV1` (Zod) | **Yes** (HMAC-SHA256) | `cmd.id` (UUID) |
| `titan.ops.receipt.v1` | Publish | `OpsReceiptSchemaV1` (Zod) | No | `receipt.id` (UUID) |

## Schema Details

### OpsCommandV1 (Input)
| Field | Type | Validation |
|-------|------|-----------|
| `v` | `1` | z.literal(1) |
| `id` | UUID | z.string().uuid() |
| `ts` | ISO8601 | z.string().datetime() |
| `type` | Enum | `restart`, `deploy`, `cancel_all`, `set_risk`, `halt`, `disarm`, `arm`, `export_evidence` |
| `target` | string | Service name or "all" |
| `params` | Record | Optional |
| `meta.initiator_id` | string | User ID |
| `meta.reason` | string | Human-readable reason |
| `meta.signature` | string | HMAC-SHA256 hex digest |

### OpsReceiptV1 (Output)
| Field | Type | Validation |
|-------|------|-----------|
| `v` | `1` | z.literal(1) |
| `id` | UUID | z.string().uuid() |
| `command_id` | UUID | Links to OpsCommand |
| `ts` | ISO8601 | z.string().datetime() |
| `type` | Enum | Mirrors OpsCommandType |
| `status` | Enum | `success`, `failure`, `pending` |
| `result` | Record | Optional |
| `error` | string | Optional |
| `meta.executor_id` | string | `os.hostname()` |
| `meta.duration_ms` | number | Execution time |

## API Contracts
| Endpoint | Method | Auth | Rate Limit | Notes |
|----------|--------|------|------------|-------|
| N/A | — | — | — | Pure NATS Worker — no HTTP |

## DB Tables Owned
| Table | Partitioned? | RLS? | Owner Service |
|-------|-------------|------|---------------|
| None | — | — | — |

## Config and Environment
| Key | Type | Default | Fail-Closed? |
|-----|------|---------|--------------| 
| `OPS_SECRET` | HMAC Key | None (required) | **Yes** — `process.exit(1)` |
| `NATS_URL` | URL | `nats://localhost:4222` | Yes |
| Docker Socket | `/var/run/docker.sock` | Host mount | Yes |
