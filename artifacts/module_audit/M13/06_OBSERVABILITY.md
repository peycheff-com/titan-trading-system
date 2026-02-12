# M13 — Observability and Operations

## SLOs and SLIs
| SLI | SLO Target | Measurement | Window |
|-----|-----------|-------------|--------|
| Command execution success rate | >99% | Receipt status counts | 24h rolling |
| Command latency (NATS→Docker→Receipt) | P95 < 10s | `duration_ms` in receipt | 24h rolling |
| OpsD uptime | >99.9% | Process heartbeat | 7d |

## Metrics
| Metric Name | Type | Labels | Alert Threshold |
|-------------|------|--------|----------------|
| `opsd_commands_total` | counter | `type`, `status` | — |
| `opsd_command_duration_ms` | histogram | `type` | P99 > 30s |
| `opsd_hmac_failures_total` | counter | — | >3/hour |

## Logs
| Structured Field | Required? | Description |
|-----------------|-----------|-------------|
| `component` | yes | `titan-opsd` |
| `command_id` | yes | UUID from OpsCommandV1 |
| `command_type` | yes | e.g., `restart`, `halt` |
| `target` | yes | Service name |
| `duration_ms` | yes | Total execution time |

## Traces
| Span Name | Correlation ID | Parent |
|-----------|---------------|--------|
| `opsd.execute` | `cmd.id` | NATS message |

## Dashboards and Alerts
| Dashboard | Tool | SLOs Mapped |
|-----------|------|------------|
| OpsD Command Log | Grafana / logs | Command throughput, failure rate |

## On-Call Runbook
- Emergency halt: Send `OpsCommandV1` with `type: "halt"` via Console
- Manual halt: SSH to host, `docker compose -f docker-compose.prod.yml stop`
- HMAC key rotation: Update `OPS_SECRET` in both Console API and OpsD, restart both

> **Rule**: No black boxes. Every production failure must have a first-minute diagnosis path.
