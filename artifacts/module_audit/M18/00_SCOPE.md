# Module: M18

## Identity
- **Name**: M18 — Disaster Recovery (Cron)
- **Purpose**: Backups, Scheduled Maintenance, Exchange Whitelist, Restore Drills
- **Architectural plane**: Operations

## Code Packages (exhaustive)
- `infra/cron/titan-backups.cron` — 5 cron jobs (JetStream, Postgres, Redis, verify, exchange whitelist)
- `scripts/ops/backup-production.sh` — Main backup script (JetStream/Postgres/Redis/verify)
- `scripts/ops/do/05_backup.sh` — DigitalOcean wrapper
- `scripts/ops/verify-exchange-whitelist.sh` — Exchange IP whitelist verification (Binance/Bybit/MEXC)
- `scripts/ops/restore-drill.sh` — JetStream restore drill (quarterly, INV-02)
- `scripts/ops/do/06_restore_drill.sh` — DB restore drill wrapper
- `scripts/restore-db.sh` — Simple DB restore (interactive)
- `scripts/backup-db.sh` — Simple DB backup (Docker-based)
- `scripts/db/backup.sh` — Simple DB backup (Docker-based, alt)
- `services/titan-brain/scripts/backup_db.sh` — Brain-local DB backup
- `services/titan-brain/src/services/backup/FileSystemBackupService.ts` — In-app state backup/restore (122 lines)
- `packages/shared/tests/property/BackupRecovery.property.test.ts` — Property tests (1109 lines)

## Owner Surfaces
- **Human-facing**: Logs (`/var/log/titan/backup-*.log`, `/var/log/titan/exchange-verify.log`)
- **Machine-facing**: Cron Daemon, DigitalOcean Spaces (S3), doctl CLI

## Boundaries
- **Inputs**:
    - File System (Volumes), DB/Redis/NATS state, Exchange API endpoints
- **Outputs**:
    - Backup Files (Local `.sql.gz`, `.rdb`), DigitalOcean Spaces uploads, Volume snapshots
- **Dependencies** (other modules):
    - `M08` (Postgres), `M09` (Redis), `M06` (NATS/JetStream)
- **Non-goals**:
    - Real-time HA (handled by infra layer)
    - Automated failover (manual restore procedures)
