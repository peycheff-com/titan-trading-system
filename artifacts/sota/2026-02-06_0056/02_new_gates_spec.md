# 02 New Gates Spec - Titan SOTA Quality Orchestrator Upgrade

## 2.1 Type and Boundary Correctness

### `sota:typecheck`
- **Command**: `tsc -b --force`
- **Scope**: Monorepo root.
- **Pass Criteria**: Exit code 0. No type errors.
- **Fail Message**: "Type check failed. Run `tsc -b` locally to debug."

### `sota:api:drift`
- **Command**: `npx ts-node scripts/sota/check_api_drift.ts`
- **Scope**: `titan-console-api` vs `specs/openapi.yaml` (if exists) or code-first generation.
- **Pass Criteria**: Generated spec matches committed spec.
- **Fail Message**: "API drift detected. Run `npm run sota:api:fix` to update specs."

### `sota:edge:validation`
- **Command**: `npx ts-node scripts/sota/check_edge_validation.ts`
- **Scope**: Scan all `routes/*.ts` and `NatsConsumer.ts` for validation logic (Zod/.parse).
- **Pass Criteria**: All ingress points must have a corresponding validation step.
- **Fail Message**: "Missing validation at edge boundaries: [list files]"

## 2.2 Event Contract Gates (NATS JetStream)

### `sota:contracts:schemas`
- **Command**: `npx ts-node scripts/sota/check_contracts_schemas.ts`
- **Scope**: `contracts/nats/**/*.schema.json`
- **Pass Criteria**: All schemas are valid JSON Schema draft-07. All NATS publish calls reference a valid schema.
- **Fail Message**: "Invalid schema or unvalidated publisher detected: [list]"

### `sota:contracts:compat`
- **Command**: `npx ts-node scripts/sota/check_contracts_compat.ts`
- **Scope**: Compare current schemas vs previous version (git history or `contracts/nats`).
- **Pass Criteria**: No breaking changes (field removal, type change).
- **Fail Message**: "Breaking contract change detected in [subject]. Bump major version."

### `sota:contracts:dlq`
- **Command**: `npm run test:integration -- --testNamePattern="DLQ Routing"`
- **Scope**: Integration test ensuring poison message routing.
- **Pass Criteria**: Poison message lands in DLQ stream.
- **Fail Message**: "DLQ routing verification failed."

## 2.3 Determinism and Replay Gates

### `sota:replay:determinism`
- **Command**: `npx ts-node scripts/sota/verify_determinism.ts`
- **Input**: `tests/fixtures/determinism_slice.json` (recorded events).
- **Process**:
    1. Reset ephemeral state.
    2. Replay events to `titan-brain`.
    3. Capture final state hash.
    4. Repeat.
- **Pass Criteria**: Hash 1 == Hash 2.
- **Fail Message**: "Non-deterministic behavior detected. State hashes mismatch."

### `sota:idempotency`
- **Command**: `npm run test:integration -- --testNamePattern="Idempotency"`
- **Pass Criteria**: Double-send of command results in single effect and distinct error/status.

## 2.4 Security and Supply Chain Gates

### `sota:secrets:deep`
- **Command**: `trivy fs --scanners secret .`
- **Scope**: Full repo + history.
- **Pass Criteria**: Zero secrets found.

### `sota:sbom`
- **Command**: `syft . -o cyclonedx-json=artifacts/valuation/sbom/titan.sbom.json`
- **Pass Criteria**: SBOM generation successful.

### `sota:vuln`
- **Command**: `trivy sbom artifacts/valuation/sbom/titan.sbom.json --severity CRITICAL,HIGH --ignore-unfixed`
- **Pass Criteria**: Zero Criticals. Highs must be allowlisted.
- **Fail Message**: "Vulnerabilities detected. See `artifacts/valuation/security/vuln_report.json`."

## 2.5 Operability Gates

### `sota:health:deps`
- **Command**: `npx ts-node scripts/sota/check_health_deps.ts`
- **Pass Criteria**: `/health` endpoints return detailed dependency status (NATS, Postgres).

### `sota:metrics:required`
- **Command**: `npx ts-node scripts/sota/check_metrics_probes.ts`
- **Pass Criteria**: `/metrics` exposes `event_lag`, `http_request_duration_seconds`, `error_rate`.

### `sota:runbooks`
- **Command**: `npx ts-node scripts/sota/check_runbooks.ts`
- **Scope**: `docs/runbooks/`
- **Pass Criteria**: Files exist for `nats_outage.md`, `postgres_outage.md`, `rollback.md`.

## 2.6 Rollback and Restore

### `sota:migrations:safety`
- **Command**: `npx ts-node scripts/sota/check_migrations.ts`
- **Pass Criteria**: All migrations have a down script or explicit "irreversible" tag.

### `sota:restore:drill`
- **Command**: `bash scripts/ops/restore_drill.sh`
- **Scope**: CI only.
- **Pass Criteria**: DB restore + App Boot + Smoke Test = Success.

## 2.7 Performance

### `sota:perf`
- **Command**: `npx ts-node scripts/sota/bench_hot_paths.ts`
- **Pass Criteria**: Latency within 10% of baseline.

## 2.8 Mutation (Optional)

### `sota:mutation`
- **Command**: `npx stryker run`
- **Scope**: Risk critical files.
- **Pass Criteria**: Score > 80%.
