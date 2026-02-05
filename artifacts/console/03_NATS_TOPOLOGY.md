# NATS Topology: Operator Console Control Plane

## Overview
The Operator Console communicates with the system via a dedicated NATS overlay using `titan.ops.*` subjects. This ensures separation from the high-frequency trading bus (`titan.data.*`).

## Subjects

### 1. Operations (titan.ops.*)
| Subject | Payload Schema | Purpose |
| :--- | :--- | :--- |
| `titan.ops.command.v1` | `OpsCommandV1` | Requesting privileged actions (deploy, restart, etc.). |
| `titan.ops.receipt.v1` | `OpsReceiptV1` | Async receipts acknowledging command reception/completion. |
| `titan.console.audit.v1` | `OpsCommandV1` | Audit log stream for all console actions (read-only for auditing). |

## Payload Strictness
All payloads MUST be validated against the shared Zod schemas in `@titan/shared`.
- **Command**: `OpsCommandSchemaV1`
- **Receipt**: `OpsReceiptSchemaV1`

## Security
- **HMAC Signature**: All commands must include an HMAC signature in `meta.signature` derived from the payload + Secret Key.
- **Deduplication**: `id` (UUID) is used for idempotency.
