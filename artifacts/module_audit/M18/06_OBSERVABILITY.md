# M18 — Observability and Operations

## SLOs and SLIs
| SLI | SLO Target | Measurement | Window |
|-----|-----------|-------------|--------|
| Postgres backup freshness | < 25 hours old | `verify_backups()` age check | Daily |
| JetStream snapshot count | ≥ 1 snapshot exists | `doctl` snapshot list | Daily |
| Exchange whitelist pass rate | 100% exchanges accessible | `verify-exchange-whitelist.sh` exit code | Daily |
| Backup file size | > 0 bytes | `verify_backups()` non-empty check | Daily |

## Metrics
| Metric Name | Type | Labels | Alert Threshold |
|-------------|------|--------|----------------|
| N/A — Cron scripts use log-based monitoring, no Prometheus metrics | — | — | — |

## Logs
| Structured Field | Required? | Description |
|-----------------|-----------|-------------|
| `[INFO]`/`[SUCCESS]`/`[ERROR]`/`[WARN]` | yes | Colored log level prefix in all scripts |
| Timestamp | yes | Cron stdout timestamps via log redirect |
| Backup filename | yes | Logged on success (e.g., `titan_db_20260211_040000.sql.gz`) |
| Exit code | yes | `$FAILED` variable — 0=success, 1=failure |

## Log Files
| File | Writer | Rotation |
|------|--------|----------|
| `/var/log/titan/backup-jetstream.log` | cron → backup-production.sh | Append |
| `/var/log/titan/backup-postgres.log` | cron → backup-production.sh | Append |
| `/var/log/titan/backup-redis.log` | cron → backup-production.sh | Append |
| `/var/log/titan/backup-verify.log` | cron → backup-production.sh | Append |
| `/var/log/titan/exchange-verify.log` | cron → verify-exchange-whitelist.sh | Append |

## Traces
| Span Name | Correlation ID | Parent |
|-----------|---------------|--------|
| N/A — Cron jobs, no distributed tracing | — | — |

## Dashboards and Alerts
| Dashboard | Tool | SLOs Mapped |
|-----------|------|------------|
| N/A — Alert via `MAILTO=ops@titan.trading` in cron | Email | All backup failures |

## On-Call Runbook
- Runbook: Check `/var/log/titan/backup-*.log` for failures
- Backup failure: Re-run `backup-production.sh {postgres|jetstream|redis}`
- Exchange whitelist failure: Add current IP via exchange dashboard
- Restore procedure: `scripts/ops/do/06_restore_drill.sh --execute`

> **Rule**: No black boxes. Every production failure must have a first-minute diagnosis path.
