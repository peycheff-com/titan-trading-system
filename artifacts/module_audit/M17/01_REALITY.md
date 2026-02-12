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

## Key Observations
1. **NATS passwords in prod**: ✅ FIXED — `docker-compose.prod.yml` now uses `nats.conf.template` with `envsubst` to inject `$NATS_*_PASSWORD` env vars at startup. Dev `nats.conf` is never mounted in prod.
2. **Deploy is stop-migrate-start, not blue/green** — Accepted trade-off with documented rollback in `deploy_prod.sh` header.
3. **`smoke_prod.sh` checks Brain on port 3100** — Correct port, uses `docker compose exec` to curl health endpoints
4. **Redis with auth in prod** — `docker-compose.prod.yml` redis uses `--requirepass ${REDIS_PASSWORD}`
5. **Pre-deploy env validation** — `validate_prod_env.sh` checks 14 required vars, rejects ALL dev defaults (including 9 NATS service passwords), validates compose config
6. **POSTGRES_PASSWORD fail-fast** — Uses `:?` syntax to abort compose if unset
7. **Grafana password env-ified** — No longer hardcoded `admin` default
8. **Idempotent DB migrations** — `run_migrations.sh` tracks via `_titan_migrations` table with SHA256 drift detection
