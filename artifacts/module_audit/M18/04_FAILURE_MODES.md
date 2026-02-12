# M18 — Failure Modes and Blast Radius

> **Rule**: If you cannot describe recovery deterministically, you do not own the module.
> **Trading context**: Every failure mode must state financial impact.

| # | Failure Mode | Trigger | Detection Signal | Auto Containment | Manual Runbook | Fund Risk? | Customer Impact | Recovery Steps | RTO | RPO |
|---|-------------|---------|-----------------|-----------------|----------------|-----------|----------------|----------------|-----|-----|
| 1 | Postgres backup fails | pg_dump error, disk full, container down | cron MAILTO, backup-verify.log | Next cron retry (24h) | Check logs, manual `backup-production.sh postgres` | No | None | Run backup manually, verify output | < 1h | 24h |
| 2 | JetStream snapshot fails | DO_API_TOKEN missing/expired, volume not found | cron MAILTO, backup-jetstream.log | Return 1, logged | Set token, run `backup-production.sh jetstream` | No | None | Fix credentials, re-run | < 1h | 24h |
| 3 | Redis BGSAVE fails | Redis not running, disk full | cron MAILTO, backup-redis.log | Logs warning, returns 0 (non-fatal) | Restart Redis, check disk | No | None | Restart Redis, verify RDB | < 30m | 6h |
| 4 | S3 upload fails | s3cfg missing, network error | backup-postgres.log warns | Local backup still saved | Fix s3cfg, manual upload | No | None | Re-upload with `s3cmd put` | < 30m | 0 (local exists) |
| 5 | Exchange IP not whitelisted | IP change (reboot, migration) | exchange-verify.log | None — log only | Add IP to exchange dashboard | Yes — trading fails | Orders rejected | Update whitelist on exchange | < 30m | N/A |
| 6 | Backup verification stale | Postgres backup > 25h old | backup-verify.log warns | Return 1 | Investigate cron/disk | Indirect — no recovery point | None until DR needed | Fix cron, run manual backup | < 1h | 24h |
| 7 | Restore drill fails | Snapshot corrupted, DO API error | drill results file | Cleanup trap destroys resources | Debug, re-run with new snapshot | No | None | Fix snapshot, re-drill quarterly | < 4h | N/A |
| 8 | FileSystemBackupService write fails | Disk full, permissions | Logger.error in TypeScript | Exception thrown | Check disk space | No | State not backed up | Free disk, retry | < 30m | N/A |
