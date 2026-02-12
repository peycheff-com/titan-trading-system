# M18 — Invariants

> Cross-reference system invariants I-01 through I-20.

## Control Loop (Cybernetics Lens)

### Essential Variables
- **Data Integrity**: Valid backups of Postgres/Redis/JetStream exist and are fresh.
- **Recovery Time**: RTO < 4 hours (manual restore procedure).
- **Recovery Point**: RPO < 24 hours (daily backups), RPO < 6 hours for Redis.

### Actuators
- `cron`: Triggers backup scripts on schedule.
- `pg_dump`: Actuator for DB state export.
- `redis-cli BGSAVE`: Actuator for Redis snapshot.
- `doctl compute volume-snapshot`: Actuator for JetStream volume.
- `s3cmd put`: Actuator for off-site upload.

### Regulator Policy
- `verify_backups()`: Checks backups are fresh (< 25 hours old) and non-empty.
- `verify-exchange-whitelist.sh`: Checks current IP is whitelisted on all exchanges.

## Module Invariants

| # | Invariant | System ID | Enforcement | Test | Evidence |
|---|-----------|-----------|-------------|------|----------|
| 1 | Postgres backup runs daily at 04:00 UTC | I-02 | cron schedule | Config validation | `titan-backups.cron` L18-19 |
| 2 | JetStream snapshot runs daily at 03:00 UTC | I-02 | cron schedule | Config validation | `titan-backups.cron` L14-15 |
| 3 | Redis RDB runs every 6 hours | I-02 | cron schedule | Config validation | `titan-backups.cron` L21-22 |
| 4 | Backups verified daily at 06:00 UTC | I-02 | cron schedule | Config validation | `titan-backups.cron` L24-26 |
| 5 | Exchange IPs verified daily at 07:00 UTC | I-XX | cron schedule | Config validation | `titan-backups.cron` L28-30 |
| 6 | Backup files are non-empty (Postgres) | I-02 | `verify_backups()` | Property test | `backup-production.sh` L158-171 |
| 7 | JetStream snapshots exist (count > 0) | I-02 | `verify_backups()` | Property test | `backup-production.sh` L147-156 |
| 8 | Old backups pruned (7-day retention) | I-XX | `find -mtime +7 -delete` | Manual | `backup-db.sh` L24, `backup.sh` L28 |
| 9 | FileSystemBackupService sanitizes backup IDs | I-XX | `path.basename()` | Code review | `FileSystemBackupService.ts` L62 |
| 10 | Restore drill documented and executable | I-02 | Script + cleanup trap | Manual quarterly | `restore-drill.sh` |
