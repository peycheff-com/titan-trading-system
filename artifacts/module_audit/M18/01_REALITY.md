# M18 — Reality Snapshot

> What the code actually does today vs. what docs claim.

## Build Status
- [x] Cron defined (`titan-backups.cron`) — 5 jobs
- [x] Main backup script (`backup-production.sh`) — 221 lines, handles JetStream/Postgres/Redis/verify
- [x] Exchange whitelist check (`verify-exchange-whitelist.sh`) — Binance/Bybit/MEXC
- [x] Restore drill scripts exist (JetStream + DB)
- [x] In-app state backup (`FileSystemBackupService.ts`) — with directory traversal protection
- [x] Property tests exist (`BackupRecovery.property.test.ts`) — 1109 lines

## Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Daily Backups" (Postgres) | `0 4 * * *` via cron → `backup-production.sh postgres` | ✅ |
| "Daily Backups" (JetStream) | `0 3 * * *` via cron → `backup-production.sh jetstream` | ✅ |
| "Redis Backup" | `0 */6 * * *` via cron → `backup-production.sh redis` | ✅ |
| "Backup Verification" | `0 6 * * *` via cron → `backup-production.sh verify` | ✅ |
| "Exchange Whitelist" | `0 7 * * *` via cron → `verify-exchange-whitelist.sh` | ✅ |
| "05_backup.sh wrapper" | ✅ FIXED — Wrapper uses correct args (`postgres`/`jetstream`/`redis`/`verify`) | ✅ Fixed |
| "Evidence: verify_backup.sh" | ✅ CREATED — `infra/scripts/verify_backup.sh` validates backup integrity (gzip/tar, age, size) | ✅ Fixed |
| "Evidence: restore_db.sh" | ✅ CREATED — `infra/scripts/restore_db.sh` (safety confirm, dry-run, post-restore validation) | ✅ Fixed |
| "3 simple backup scripts" | `backup-production.sh` now uses `set -euo pipefail` | ✅ Fixed |

## Exchange Connectivity
| Exchange | Protocol | Verification Script | Tested Live? |
|----------|----------|---------------------|-------------|
| Binance | REST (HMAC-SHA256) | `verify-exchange-whitelist.sh` L43-79 | Pre-deploy |
| Bybit | REST (HMAC-SHA256) | `verify-exchange-whitelist.sh` L82-122 | Pre-deploy |
| MEXC | REST (HMAC-SHA256) | `verify-exchange-whitelist.sh` L125-158 | Pre-deploy |
