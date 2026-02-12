# M13 — Drift Control and Upgrade Strategy

## Doc-to-Code Sync
- Enforcement: Audit artifacts in `artifacts/module_audit/2026-02-11/modules/M13/`
- All NATS subjects imported from `@titan/shared` `TITAN_SUBJECTS.OPS.*` — no hardcoded strings

## NATS Subject Canonicalization
- Source: `packages/shared/src/messaging/titan_subjects.ts` → `TITAN_SUBJECTS.OPS`
- Subjects: `titan.ops.command.v1`, `titan.ops.receipt.v1`
- Enforcement: Import from `@titan/shared`, no raw strings in codebase

## Schema Drift Detection
- Input: `OpsCommandSchemaV1` (Zod) from `@titan/shared`
- Output: `OpsReceiptSchemaV1` (Zod) from `@titan/shared`
- Enforcement: Both schemas are centralized in `packages/shared/src/schemas/`

## Dependency Drift
- `@titan/shared` version: workspace link (`^1.0.0`)
- Node.js version: 22 (pinned in Dockerfile)
- Docker CLI: installed via `apk` in Dockerfile (tracks Alpine repo)

## Allowlist Drift
- Restart allowlist in `CommandExecutor.ts` is **hardcoded** — adding new services requires code change + deploy
- Consider: Move to config or derive from `docker-compose.prod.yml`

## Upgrade Playbook
- Rebuild Docker image → deploy via `docker compose up -d titan-opsd`
- Schema changes: Update `@titan/shared` schemas first, then redeploy OpsD
- Secret rotation: Update `OPS_SECRET` env var in both Console API and OpsD simultaneously
