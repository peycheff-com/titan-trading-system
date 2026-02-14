# M17 — Reality Snapshot

> What the code actually does today vs. what docs claim.

## Build Status
- [x] Docker Compose configs parse cleanly (all 7 files valid YAML)
- [x] Shell scripts pass `bash -n` syntax check
- [x] CI workflows are valid YAML with pinned action SHAs
- [x] `validate-configs.ts` compiles

## Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| Blue/green deployment | `deploy_prod.sh` does stop → migrate → start (not blue/green). Accepted trade-off — documented in script header. Rollback automated. | ℹ️ Accepted |
| Automatic rollback on failure | `deploy_prod.sh` stops + restarts on smoke failure (automated) | ✅ Implemented |
| Docker Secrets for prod | `docker-compose.secrets.yml` overlay exists and is comprehensive | ✅ Implemented |
| NATS ACLs per service | `config/nats.conf` defines 8 service accounts with permissions | ✅ Implemented |
| Posture-based deployment | `boot_prod_like.sh` loads posture env files | ✅ Implemented |
| CI pipeline with tier detection | `ci.yml` uses `changed_paths.sh` for risk tier | ✅ Implemented |
| Signed release manifests | `deploy-prod.yml` signs digests with `provenance.ts` | ✅ Implemented |
| Nightly security scan + SBOM | `ci.yml` has `nightly-security` job with SBOM generation | ✅ Implemented |
| Health checks on all services | All 7 services in prod compose have healthchecks (Brain, NATS, Execution, Strategies, Sentinel, Scavenger, Hunter) | ✅ Implemented |
| Config validation in CI | `preflight` job runs `config_validate.sh` | ✅ Implemented |

## Staging Deployment (Micro-Capital)

> Added: 2026-02-14 — First successful staging deployment

### Build Status
- [x] `deploy_staging.sh` builds and deploys all 5 service images via `docker-compose.micro.yml`
- [x] All services start successfully with health checks passing
- [x] Rust execution engine compiles on `rust:latest` (1.93.1) — upgraded from `rust:1.85-slim-bookworm` to satisfy `time` crate MSRV

### Env Vars Required for Staging
| Variable | Service(s) | Default |
|----------|-----------|---------|
| `HMAC_SECRET` | Brain, Execution, Hunter | `supersecretkey_staging_only` |
| `SAFETY_SECRET` | Brain | `safety_dance_staging_only` |
| `TITAN_HMAC_SECRET` | Sentinel | Uses `HMAC_SECRET` default |
| `BINANCE_API_KEY/SECRET` | Execution, Scavenger, Hunter | `dummy_key_staging` |
| `BYBIT_API_KEY/SECRET` | Scavenger | `dummy_key_staging` |
| `PORT` | Brain | `3100` |
| `DB_HOST/NAME/USER/PASSWORD` | Brain | Derived from postgres service |

### Issues Resolved During First Staging Deploy (2026-02-14)
1. Build context paths corrected to `.` with explicit `dockerfile:` paths
2. `titan-phase2-hunter` missing `uuid` and `zod` dependencies — added to `package.json`
3. `titan-execution-rs` MSRV mismatch — upgraded Docker base image to `rust:latest`
4. NATS health check required `-m 8222` monitoring port
5. `titan-brain` missing `PORT`, `DB_*`, `HMAC_SECRET`, `SAFETY_SECRET` env vars
6. `titan-brain` Dockerfile missing `schema.sql` copy to `dist/`
7. `titan-execution` missing `HMAC_SECRET` default
8. `titan-scavenger` missing `BINANCE_*` and `BYBIT_*` credentials
9. `titan-sentinel` missing `TITAN_HMAC_SECRET`

## Key Observations
1. **NATS passwords in prod**: ✅ FIXED — `docker-compose.prod.yml` now uses `nats.conf.template` with `envsubst` to inject `$NATS_*_PASSWORD` env vars at startup. Dev `nats.conf` is never mounted in prod.
2. **Deploy is stop-migrate-start, not blue/green** — Accepted trade-off with documented rollback in `deploy_prod.sh` header.
3. **`smoke_prod.sh` checks Brain on port 3100** — Correct port, uses `docker compose exec` to curl health endpoints
4. **Redis with auth in prod** — `docker-compose.prod.yml` redis uses `--requirepass ${REDIS_PASSWORD}`
5. **Pre-deploy env validation** — `validate_prod_env.sh` checks 14 required vars, rejects ALL dev defaults (including 9 NATS service passwords), validates compose config
6. **POSTGRES_PASSWORD fail-fast** — Uses `:?` syntax to abort compose if unset
7. **Grafana password env-ified** — No longer hardcoded `admin` default
8. **Idempotent DB migrations** — `run_migrations.sh` tracks via `_titan_migrations` table with SHA256 drift detection
9. **Staging deploy requires lockfile sync** — `npm ci` in Docker fails if `package-lock.json` is out of sync with `package.json`. Always run `npm install` locally before pushing dependency changes.
