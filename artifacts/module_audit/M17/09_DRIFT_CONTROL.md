# M17 — Drift Control and Upgrade Strategy

## Docker Image Version Pinning
| Service | Base | dev | prod | micro | test | Consistent? |
|---------|------|-----|------|-------|------|-------------|
| NATS | `2.10.22-alpine` | `latest` ⚠️ | `2.10.22-alpine` | `2.10-alpine` ⚠️ | `2.10.22-alpine` | ❌ — dev unpinned, micro uses minor-only |
| PostgreSQL | `16-alpine` | `15-alpine` ⚠️ | `16-alpine` | `15-alpine` ⚠️ | `16-alpine` | ❌ — dev/micro use 15 |
| Redis | `7.2.4-alpine3.19` | `7-alpine` | `alpine` ⚠️ | `7-alpine` | N/A | ❌ — prod unpinned |
| Prometheus | `latest` ⚠️ | N/A | N/A | N/A | N/A | ⚠️ — should pin |
| Grafana | `latest` ⚠️ | N/A | N/A | N/A | N/A | ⚠️ — should pin |

## Doc-to-Code Sync
- Enforcement: `scripts/verify-docs.sh`
- CI gate: `preflight` job → `Verify Documentation Invariants`

## Risk Policy Sync (TS ↔ Rust)
- Source: `packages/shared/risk_policy.json`
- Copy: `services/titan-execution-rs/src/risk_policy.json`
- Enforcement: SHA256 hash comparison at boot
- Evidence: `shasum -a 256 packages/shared/risk_policy.json services/titan-execution-rs/src/risk_policy.json`

## NATS Subject Canonicalization
- Source: `packages/shared/src/messaging/powerlaw_subjects.ts`
- Enforcement: `scripts/sota/check_nats_subjects.sh`

## Schema Drift Detection
- DB schema: `services/titan-brain/src/db/schema.sql`
- NATS intent schema: `contracts/nats/nats-intent.v1.schema.json`
- Enforcement: `contract-check` CI job

## GitHub Actions Version Pinning
- All actions pinned to SHA ✅ (e.g., `actions/checkout@34e114876b0...`)
- `cargo-audit` version pinned to `0.22.1` ✅
- Node/npm/Rust versions pinned in CI env vars ✅

## Upgrade Playbook
- Rolling upgrade: image pull → stop → migrate → start via `scripts/deploy_prod.sh`
- Risk policy change: requires both Brain + Execution redeployment
- NATS config change: requires `nats-server --signal reload`
- Posture change: re-run `boot_prod_like.sh` with new posture name
