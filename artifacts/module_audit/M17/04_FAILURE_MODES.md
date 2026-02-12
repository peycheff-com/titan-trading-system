# M17 — Failure Modes and Blast Radius

> **Rule**: If you cannot describe recovery deterministically, you do not own the module.
> **Trading context**: Every failure mode must state financial impact.

| # | Failure Mode | Trigger | Detection Signal | Auto Containment | Manual Runbook | Fund Risk? | Customer Impact | Recovery Steps | RTO | RPO |
|---|-------------|---------|-----------------|-----------------|----------------|-----------|----------------|----------------|-----|-----|
| 1 | Smoke test fails post-deploy | Bad image, missing env var, DB migration failure | `smoke_prod.sh` exit 1 | No — logs failure only | Run `rollback.sh <prev-tag>` | No — system halted | Trading stopped | Rollback to previous tag | 5 min | 0 |
| 2 | Health check false positive | Container running but service crashed internally | `wait-for-health.sh` timeout | No — warns only | SSH in, check logs | Yes — stale positions not managed | Trading on stale state | Restart service, verify positions | 2 min | 0 |
| 3 | NATS ACL misconfiguration | Typo in `nats.conf`, wrong permissions | Service publish/subscribe rejected | NATS rejects the message | Update `nats.conf`, reload NATS | Yes — signals/commands not delivered | No trading possible | Fix config, `nats-server --signal reload` | 5 min | 0 |
| 4 | Secret leak via hardcoded values | Committing `.env`, using default passwords in prod | Audit scan, `npm audit` | N/A | Rotate all leaked secrets | Yes — exchange API keys exposed | Potential fund theft | Rotate keys, revoke old, redeploy | 30 min | 0 |
| 5 | Docker registry push failure | GHCR down, auth expired | `build-and-push` job fails | CI stops deploy | Wait for GHCR recovery, retry | No — running version unaffected | No deployment | Retry workflow | Variable | 0 |
| 6 | VPS disk full | JetStream/PG/Redis data growth | Backup cron failure, disk alerts | N/A | Prune old data, expand volume | Yes — new signals not persisted | Trading degraded | Prune, verify backups | 15 min | Per backup window |
