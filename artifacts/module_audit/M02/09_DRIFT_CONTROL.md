# M02 — Drift Control and Upgrade Strategy

## Doc-to-Code Sync
- Enforcement: `scripts/verify-docs.sh`
- CI gate: `contract-check` job

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

## Exchange Adapter Versioning
- Bybit API version pin: <!-- -->
- Binance API version pin: <!-- -->

## Upgrade Playbook
- Rolling upgrade: blue/green via `scripts/deploy_prod.sh`
- Risk policy change: requires both Brain + Execution redeployment
- NATS config change: requires `nats-server --signal reload`
