# Module: M13

## Identity
- **Name**: M13 — OpsD (Ops Daemon)
- **Purpose**: Privileged Operations Executor — receives signed commands via NATS and executes Docker lifecycle operations (restart, deploy, halt, export evidence).
- **Architectural plane**: Operations (Immune System / Control Plane)

## Code Packages (exhaustive)
- `services/titan-opsd/src/index.ts` — Entry point, NATS subscriber, receipt publisher
- `services/titan-opsd/src/CommandExecutor.ts` — Docker command execution with allowlist
- `services/titan-opsd/Dockerfile` — Multi-stage build, `node:22-alpine`, `docker-cli`
- `services/titan-opsd/package.json` — Dependencies: `@titan/shared`, `dotenv`, `uuid`

## Owner Surfaces
- **Human-facing**: None (triggered via Console M11 → API M12 → NATS)
- **Machine-facing**:
  - NATS Subscriber: `titan.ops.command.v1`
  - NATS Publisher: `titan.ops.receipt.v1`
  - Docker Socket (`/var/run/docker.sock`)

## Boundaries
- **Inputs**: NATS `OpsCommandV1` (Zod-validated, HMAC-signed)
- **Outputs**: Docker lifecycle actions, `OpsReceiptV1` on NATS
- **Dependencies**: `M06` (NATS), `M10` (Shared — schemas, security, subjects), Docker Engine
- **Non-goals**: Trading logic, direct API exposure, database access
