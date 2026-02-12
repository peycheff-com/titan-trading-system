# Evidence Manifest - M18 Disaster Recovery

> Verification of SOTA compliance via Code and Configuration.

## 1. Cron Schedule
- **Invariant**: 5 scheduled backup/verification jobs configured.
- **Evidence Type**: Config file
- **Location**: [`titan-backups.cron`](file:///Users/ivan/Code/work/trading/titan/infra/cron/titan-backups.cron)
- **Details**: JetStream (03:00), Postgres (04:00), Redis (*/6h), verify (06:00), exchange whitelist (07:00)
- **Status**: ✅ Verified

## 2. Main Backup Script
- **Invariant**: Handles JetStream/Postgres/Redis backup and verification.
- **Evidence Type**: Script
- **Location**: [`backup-production.sh`](file:///Users/ivan/Code/work/trading/titan/scripts/ops/backup-production.sh)
- **Details**: 221 lines, `set -e`, DigitalOcean Spaces upload, retention pruning
- **Status**: ✅ Verified

## 3. Exchange Whitelist Verification
- **Invariant**: Current IP is whitelisted on all enabled exchanges before trading.
- **Evidence Type**: Script
- **Location**: [`verify-exchange-whitelist.sh`](file:///Users/ivan/Code/work/trading/titan/scripts/ops/verify-exchange-whitelist.sh)
- **Details**: Checks Binance, Bybit, MEXC with HMAC-SHA256 authenticated requests
- **Status**: ✅ Verified

## 4. JetStream Restore Drill
- **Invariant**: JetStream snapshots are restorable (quarterly drill).
- **Evidence Type**: Script
- **Location**: [`restore-drill.sh`](file:///Users/ivan/Code/work/trading/titan/scripts/ops/restore-drill.sh)
- **Details**: 235 lines, creates DigitalOcean droplet, restores volume from snapshot, verifies data, cleanup trap
- **Status**: ✅ Verified

## 5. DB Restore Drill
- **Invariant**: PostgreSQL can be restored from backup.
- **Evidence Type**: Script
- **Location**: [`06_restore_drill.sh`](file:///Users/ivan/Code/work/trading/titan/scripts/ops/do/06_restore_drill.sh)
- **Details**: Safe drill mode (no-op) + execute mode with confirmation prompt
- **Status**: ✅ Verified

## 6. In-App State Backup Service
- **Invariant**: Application state can be backed up and restored with integrity.
- **Evidence Type**: TypeScript source
- **Location**: [`FileSystemBackupService.ts`](file:///Users/ivan/Code/work/trading/titan/services/titan-brain/src/services/backup/FileSystemBackupService.ts)
- **Details**: 122 lines, directory traversal protection, structured logging, JSON format with version field
- **Status**: ✅ Verified

## 7. Property Tests
- **Invariant**: Backup creation, integrity, recovery, and disaster scenarios are property-tested.
- **Evidence Type**: Test file
- **Location**: [`BackupRecovery.property.test.ts`](file:///Users/ivan/Code/work/trading/titan/packages/shared/tests/property/BackupRecovery.property.test.ts)
- **Details**: 1109 lines, 6 property test suites covering creation/integrity/recovery/DR/retention
- **Status**: ✅ Verified

## 8. Config Validation Test
- **Invariant**: Backup cron schedule, script args, and shell hardening are validated.
- **Evidence Type**: Test file
- **Location**: [`backup-config.test.ts`](file:///Users/ivan/Code/work/trading/titan/scripts/sota/backup-config.test.ts)
- **Details**: 30+ checks covering cron, arg alignment, pipefail, exchange verification
- **Status**: ✅ New (R3)

## 9. Wrapper Script Fix
- **Invariant**: `05_backup.sh` passes correct arguments to `backup-production.sh`.
- **Evidence Type**: Script diff
- **Location**: [`05_backup.sh`](file:///Users/ivan/Code/work/trading/titan/scripts/ops/do/05_backup.sh)
- **Details**: Fixed `--db-only` → `postgres`, `--jetstream-only` → `jetstream` (R1)
- **Status**: ✅ Remediated

## 10. Shell Script Hardening
- **Invariant**: All backup scripts use `set -euo pipefail`.
- **Evidence Type**: Script diffs
- **Locations**:
  - [`backup-db.sh`](file:///Users/ivan/Code/work/trading/titan/scripts/backup-db.sh)
  - [`scripts/db/backup.sh`](file:///Users/ivan/Code/work/trading/titan/scripts/db/backup.sh)
  - [`backup_db.sh`](file:///Users/ivan/Code/work/trading/titan/services/titan-brain/scripts/backup_db.sh)
- **Details**: Added `set -euo pipefail` (was `set -e`) (R2)
- **Status**: ✅ Remediated
