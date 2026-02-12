# M18 — Tests and Verification Harness

| Category | Exists? | Passes? | Meaningful? | Command (local) | Expected Artifacts | Runtime Budget | Evidence |
|----------|---------|---------|-------------|-----------------|-------------------|---------------|----------|
| Property tests (Backup/Recovery) | ✅ | ✅ | ✅ | `cd packages/shared && npx jest BackupRecovery.property.test.ts` | Test report | < 30s | `BackupRecovery.property.test.ts` (1109 lines) |
| Config validation (backup) | ✅ | ✅ | ✅ | `npx jest scripts/sota/backup-config.test.ts` | Test report | < 5s | `backup-config.test.ts` |
| Script syntax (shellcheck) | ⚠️ | N/A | ✅ | `shellcheck scripts/ops/backup-production.sh` | No errors | < 5s | Manual |
| Restore drill (JetStream) | ✅ | Manual | ✅ | `scripts/ops/restore-drill.sh` | Results file | Quarterly | `restore-drill.sh` |
| Restore drill (DB) | ✅ | Manual | ✅ | `scripts/ops/do/06_restore_drill.sh` | Console output | Quarterly | `06_restore_drill.sh` |
| Cron schedule verification | ✅ | ✅ | ✅ | Config validation test | Pass/fail | < 5s | `backup-config.test.ts` |
