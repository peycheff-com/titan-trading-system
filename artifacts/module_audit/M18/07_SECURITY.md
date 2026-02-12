# M18 — Security Posture

Reference: [security.md](file:///Users/ivan/Code/work/trading/titan/docs/security.md)

## Threat Model Summary (top threats for this module)
1. **Backup exfiltration**: Backup files contain DB dumps — must be stored with least-privilege access.
2. **Exchange credential exposure**: `verify-exchange-whitelist.sh` handles API keys via env vars — never logged.
3. **Directory traversal**: `FileSystemBackupService.loadBackup()` sanitizes via `path.basename()`.
4. **Stale backups**: Undetected backup failure leaves system without recovery point.

## NATS ACL Boundaries
- Service identity: N/A — M18 is cron-driven, no NATS interaction.
- Trust zone: N/A

## HMAC Signing Coverage
| Boundary | What is Signed | Verification Point |
|----------|----------------|-------------------|
| Binance API | Request params (HMAC-SHA256) | `verify-exchange-whitelist.sh` L63 |
| Bybit API | Timestamp+key+window (HMAC-SHA256) | `verify-exchange-whitelist.sh` L103 |
| MEXC API | Request params (HMAC-SHA256) | `verify-exchange-whitelist.sh` L145 |

## Secrets Handling
| Secret | Storage | Rotation Policy | Fail-Closed? |
|--------|---------|----------------|--------------|
| `DO_API_TOKEN` | `.env` / systemd | Manual | Yes — snapshot skipped |
| `TITAN_DB_PASSWORD` | `.env` / systemd | Manual | Yes — pg_dump fails |
| `BINANCE_API_KEY/SECRET` | `.env` | Manual | No — skips auth check |
| `BYBIT_API_KEY/SECRET` | `.env` | Manual | No — skips auth check |
| `MEXC_API_KEY/SECRET` | `.env` | Manual | No — skips auth check |

## Supply Chain Controls
- `npm audit` + `cargo audit` in CI
- SBOM generation
- License compliance: `npm run sota:license`

## Exchange Credential Isolation
| Control | Mechanism |
|---------|-----------|
| API key scope | Trade-only (no withdrawal) |
| IP whitelist | Production VPS IPs only |
| Verification | Daily cron check via `verify-exchange-whitelist.sh` |

## FileSystemBackupService Security
| Control | Mechanism | Evidence |
|---------|-----------|----------|
| Directory traversal prevention | `path.basename(backupId)` | `FileSystemBackupService.ts` L62 |
| Input validation | `.json` extension enforcement | `FileSystemBackupService.ts` L64 |
| Structured error handling | try/catch with Logger | All methods |
