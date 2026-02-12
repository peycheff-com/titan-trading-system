# M17 — Observability and Operations

## SLOs and SLIs
| SLI | SLO Target | Measurement | Window |
|-----|-----------|-------------|--------|
| CI pipeline success rate | ≥ 95% | GitHub Actions status | 7d rolling |
| Deploy success rate | 100% (no failed deploys) | `deployment_log.txt` | Per deploy |
| Health check pass rate | 100% post-deploy | `smoke_prod.sh` exit code | Per deploy |
| Backup freshness | < 24h for PG/NATS, < 6h for Redis | Cron log timestamps | Daily |

## Metrics
| Metric Name | Type | Labels | Alert Threshold |
|-------------|------|--------|----------------|
| `ci_pipeline_duration_seconds` | gauge | `workflow`, `job` | > 600s |
| `deploy_duration_seconds` | gauge | `tag`, `result` | > 300s |
| `container_health_status` | gauge | `service` | unhealthy for > 60s |

## Logs
| Structured Field | Required? | Description |
|-----------------|-----------|-------------|
| Deployment tag | yes | Git SHA or version tag in `deployment_log.txt` |
| Backup timestamp | yes | Per-service backup completion time in cron logs |

## Traces
N/A — Infrastructure module; no distributed tracing applicable.

## Dashboards and Alerts
| Dashboard | Tool | SLOs Mapped |
|-----------|------|------------|
| Container health | Grafana (provisioned via `docker-compose.yml`) | Container up/down |
| CI pipeline | GitHub Actions UI | Pipeline success rate |
| Prometheus self-monitoring | Prometheus (`prometheus:9090`) | Scrape target health |

## Prometheus Scrape Config (`infra/monitoring/prometheus.yml`)
| Job | Target | Status |
|-----|--------|--------|
| `prometheus` | `localhost:9090` | ✅ Active |
| `titan-brain` | `titan-brain:3100` | ✅ Active |
| `titan-console-api` | `titan-console-api:3000` | ✅ Active |
| `titan-node` | `node_exporter:9100` | ⚠️ Commented out |

## Backup Schedule (`infra/cron/titan-backups.cron`)
| What | Schedule | Log |
|------|----------|-----|
| JetStream snapshot | Daily 3 AM UTC | `/var/log/titan/backup-jetstream.log` |
| PostgreSQL backup | Daily 4 AM UTC | `/var/log/titan/backup-postgres.log` |
| Redis RDB | Every 6 hours | `/var/log/titan/backup-redis.log` |
| Backup verification | Daily 6 AM UTC | `/var/log/titan/backup-verify.log` |
| Exchange whitelist check | Daily 7 AM UTC | `/var/log/titan/exchange-verify.log` |

> **Rule**: No black boxes. Every production failure must have a first-minute diagnosis path.
