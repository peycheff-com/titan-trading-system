# M17 — Invariants

> Cross-reference system invariants I-01 through I-20 from [system-source-of-truth.md](file:///Users/ivan/Code/work/trading/titan/docs/system-source-of-truth.md).

## Control Loop (Cybernetics Lens)

### Essential Variables (what must never drift)
- Docker image tags must match across compose files for same service
- Postgres version must be consistent across all compose files
- NATS ACLs must match canonical subject definitions in `powerlaw_subjects.ts`
- Posture env files must define all required risk control variables

### Sensors (how you observe reality)
- CI status-check job aggregates all pipeline results
- `smoke_prod.sh` checks container running + health endpoints
- `wait-for-health.sh` polls Docker health status

### Actuators (what you can change)
- `deploy_prod.sh` — deploy new version
- `rollback.sh` — revert to previous tag
- `boot_prod_like.sh` — posture-controlled startup

### Regulator Policy (what governs action)
- CI must pass before deploy (`deploy-prod.yml` → `ci-check` job)
- Readiness gate runs gatekeeper (path-based tier detection)
- Release manifest must be signed (`provenance.ts`)

### Time Constants
- Health check interval: 10s (NATS, PG, Redis), 30s (application services)
- Deploy timeout: 120s (`MAX_WAIT` in `production.env`)
- Smoke test: immediate post-deploy

### Variety Budget
- **Input variety**: Git SHA, posture name, manual dispatch flag
- **Attenuation**: Tier detection reduces CI scope; concurrency groups prevent parallel deploys
- **Amplification**: Matrix strategy builds 8 images in parallel

## Module Invariants

| # | Invariant | System ID | Enforcement | Test | Evidence |
|---|-----------|-----------|-------------|------|----------|
| 1 | All compose files must parse as valid YAML | I-DI-01 | `docker compose config` | Manual | compose config output |
| 2 | Production deploy requires CI pass | I-DI-02 | `deploy-prod.yml` → `ci-check` job | CI | Workflow logs |
| 3 | NATS ACLs isolate service publish/subscribe | I-DI-03 | `config/nats.conf` per-user permissions | Manual | NATS config review |
| 4 | Posture must exist before boot | I-DI-04 | `boot_prod_like.sh` → `preflight()` | Manual | Script review |
| 5 | Release digest must be signed | I-DI-05 | `deploy-prod.yml` → `Sign Release Manifest` step | CI | Sig file in evidence |
| 6 | Secrets never committed to repo | I-DI-06 | `.gitignore`, Docker Secrets overlay | Manual | `.gitignore` check |
