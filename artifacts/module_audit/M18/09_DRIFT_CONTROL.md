# M18 — Drift Control and Upgrade Strategy

## Cron-to-Script Sync
- Source: `infra/cron/titan-backups.cron` (5 jobs)
- Scripts: `scripts/ops/backup-production.sh`, `scripts/ops/verify-exchange-whitelist.sh`
- Enforcement: Config validation test (`backup-config.test.ts`)
- Evidence: Test verifies cron references valid scripts with correct args

## Wrapper-to-Main Script Sync
- Source: `scripts/ops/do/05_backup.sh` (wrapper)
- Target: `scripts/ops/backup-production.sh` (main)
- Enforcement: Config validation test verifies arg alignment
- Gap fixed: R1 — wrapper now passes `postgres`/`jetstream` (not `--db-only`/`--jetstream-only`)

## Backup Retention Drift
- Postgres: 3 most recent kept locally (`ls -t | tail -n +4 | xargs rm`)
- JetStream snapshots: 7 most recent kept (`head -n -7` pruning)
- Redis: No retention policy on RDB copies (manual cleanup)
- Simple scripts: 7-day retention (`find -mtime +7 -delete`)

## Risk Policy Sync (TS ↔ Rust)
- Not applicable to M18 — no risk policy files in scope.

## NATS Subject Canonicalization
- Not applicable to M18 — no NATS interaction.

## Schema Drift Detection
- Not applicable to M18 — no schema ownership.

## Exchange Adapter Versioning
- Binance API: `fapi/v1` and `fapi/v2` endpoints used in whitelist check
- Bybit API: `v5` endpoint used in whitelist check
- MEXC API: `v1` endpoint used in whitelist check

## Upgrade Playbook
- Cron file: Copy `titan-backups.cron` to `/etc/cron.d/titan-backups` on deployment
- Scripts: Deployed via `/opt/titan/current` symlink
- Backup format: JSON (FileSystemBackupService) — version field in metadata
