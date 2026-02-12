# Module Scope: M06 NATS JetStream

## 1. Inventory

### Core Configuration
- [x] `config/nats.conf`: Main NATS server configuration (JetStream, Auth, Accounts).
- [x] `config/nats-entrypoint.sh`: Container entrypoint / startup script.
- [x] `config/nats.conf.template`: Template for dynamic config generation.

### Stream Definitions (Infrastructure-as-Code)
- [x] `packages/shared/src/messaging/nats-streams.ts`: Typescript definitions of Streams, KV Buckets, and Consumers.
- [x] `packages/shared/src/messaging/NatsClient.ts` (Partial): Client wrapper, checking for configuration implementation.

### Contracts & Documentation
- [x] `docs/contracts/nats-intent.md`: Intent schema.
- [x] `docs/contracts/nats-intent.v1.schema.json`: JSON Schema for intents.

### Operational Tools
- [x] `scripts/ops/check_nats.js`: Basic NATS library check script (needs improvement).
- [ ] `services/titan-execution-rs/scripts/benchmark_nats_latency.mjs`: Performance testing script.

## 2. Boundaries
- **In-Scope**:
    - NATS Server configuration (ACLs, JetStream limits, Auth).
    - JetStream Topology definitions (Streams, Subjects, Retention policies).
    - NATS Account structure and permissions.
    - Physical storage configuration for JetStream (`/data/jetstream`).
- **Out-of-Scope**:
    - Application-level business logic consuming NATS (handled in M01, M05, etc.).
    - `NatsClient` implementation details (mostly M10/Shared, but configuration is M06).
    - Underlying network infrastructure (except as configured in `nats.conf`).

## 3. External Dependencies
- **Docker/K8s**: Deployment manifests.
- **NATS Server Binary**: Upstream NATS server.
- **FileSystem**: Persistent storage for JetStream.
