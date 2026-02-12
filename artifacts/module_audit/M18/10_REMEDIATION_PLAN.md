# M18 — Remediation Plan

| # | Finding | Impact | Fix Policy | Current Signal | Proposed Change | Tests Added | Evidence to Collect | Gate Target |
|---|---------|--------|------------|----------------|-----------------|-------------|--------------------|---|
| 1 | `05_backup.sh` passes `--db-only`/`--jetstream-only` but main script accepts `postgres`/`jetstream` | Med — wrapper silently falls to usage error | F0 | Wrapper broken in deploy | Align args: `db`→`postgres`, `jetstream`→`jetstream`, `full`→`all` | Config validation test | Updated `05_backup.sh` | A |
| 2 | `backup-db.sh`, `scripts/db/backup.sh`, `backup_db.sh` lack `set -uo pipefail` | Low — silent failures on unset vars | F0 | No detection | Add `set -euo pipefail` | Config validation test | Updated scripts | A |
| 3 | No unit test validates cron schedule or backup script arg dispatch | Med — config drift undetected | F0 | None | Create `backup-config.test.ts` | Self | Test passing | A |
| 4 | `evidence/MANIFEST.md` references non-existent files and wrong cron snippet | Med — false audit evidence | F0 | Stale docs | Rewrite with correct file paths (using `scripts/ops/` and `infra/scripts/` correctly) | N/A | Updated manifest | A | ✅ RESOLVED |
