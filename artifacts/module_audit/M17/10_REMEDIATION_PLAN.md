# M17 — Remediation Plan

| # | Finding | Impact | Fix Policy | Current Signal | Proposed Change | Tests Added | Evidence to Collect | Gate Target |
|---|---------|--------|------------|----------------|-----------------|-------------|--------------------|------------|
| 1 | `docker-compose.dev.yml` uses deprecated `version: '3.8'` | Low — Compose V2 ignores it with warning | F0 | Warning on `docker compose up` | Remove `version: '3.8'` line | `docker compose config` validates | Compose config output | A |
| 2 | `docker-compose.dev.yml` NATS uses `nats:latest` (unpinned) | Med — version drift risk | F0 | Unpinned | Pin to `nats:2.10.22-alpine` | `docker compose config` validates | Compose config output | A |
| 3 | `docker-compose.prod.yml` Redis has no `requirepass` | Med — unauthenticated Redis in prod | F0 | No auth | Add `--requirepass ${REDIS_PASSWORD}` to Redis command | `docker compose config` validates | Compose config output | A |
| 4 | ~~`docker-compose.prod.yml` missing healthchecks~~ | ✅ RESOLVED — All 7 services now have healthchecks (Brain, NATS added in Phase 2 remediation) | F0 | ✅ Fixed | Brain + NATS healthchecks added | `docker compose config` validates | Compose config output | A |
| 5 | Postgres version drift: dev/micro use `15-alpine`, others use `16-alpine` | Low — potential compatibility issues | F0 | Inconsistent | Standardize to `postgres:16-alpine` in `docker-compose.dev.yml` and `docker-compose.micro.yml` | `docker compose config` validates | Compose config output | A |
| 6 | `boot_prod_like.sh` health check URL uses wrong port (3000 → 3100) | Med — health check always fails | F0 | Wrong port | Change port 3000 → 3100 in health_check function | `bash -n` syntax check | Script review | A |
| 7 | `smoke_prod.sh` useless use of cat pattern | Low — shell anti-pattern | F0 | `$(docker ps \| grep ... \| wc -l)` | Use `docker ps \| grep -q` pattern | `bash -n` syntax check | Script review | A |
