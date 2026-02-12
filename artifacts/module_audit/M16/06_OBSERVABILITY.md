# M16 — Observability and Operations

## SLOs and SLIs
| SLI | SLO Target | Measurement | Window |
|-----|-----------|-------------|--------|
| Service availability | 99.9% | `up == 1` for all titan-* jobs | 28d rolling |
| Signal processing latency (Brain) | P99 < 500ms | `histogram_quantile(0.99, rate(titan_brain_signal_processing_latency_ms_bucket[5m]))` | 5m |
| Execution latency (Rust) | P99 < 100ms | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="titan-execution"}[5m]))` | 5m |
| Market data freshness | < 5s lag | `time() - timestamp(titan_last_tick_timestamp_seconds)` | Real-time |

## Metrics (Brain PrometheusMetrics — prom-client)
| Metric Name | Type | Labels | Alert Threshold |
|-------------|------|--------|----------------|
| `titan_brain_signal_processing_latency_ms` | histogram | `phase_id`, `approved` | P95 > 100ms |
| `titan_brain_decisions_total` | counter | `phase_id`, `approved` | Approval rate < 30% |
| `titan_brain_database_query_duration_ms` | histogram | `operation`, `table` | P95 > 500ms |
| `titan_brain_cache_requests_total` | counter | `cache_name`, `result` | Hit rate < 70% |
| `titan_brain_current_equity` | gauge | — | — |
| `titan_brain_circuit_breaker_active` | gauge | — | == 1 → critical |
| `titan_brain_daily_drawdown_percent` | gauge | — | > 5% warning, > 10% critical |
| `titan_brain_current_leverage` | gauge | — | > 50x critical |

## Metrics (Scavenger PrometheusMetrics — manual)
| Metric Name | Type | Labels | Alert Threshold |
|-------------|------|--------|----------------|
| `titan_scavenger_traps_detected_total` | counter | `trap_type`, `symbol` | None in 30m |
| `titan_scavenger_signals_generated_total` | counter | `symbol`, `direction`, `result` | None in 15m |
| `titan_scavenger_ipc_latency_ms` | histogram | `message_type` | P95 > 50ms |
| `titan_scavenger_health_status` | gauge | `component` | == 0 |
| `titan_scavenger_binance_connection_status` | gauge | — | == 0 → critical |

## Logs
| Structured Field | Required? | Description |
|-----------------|-----------|-------------|
| `signal_id` | yes | UUID v4 end-to-end tracking |
| `correlation_id` | yes | UUID v4 request correlation |
| `component` | yes | Service component name |
| `level` | yes | debug/info/warn/error |

## Dashboards and Alerts
| Dashboard | Tool | Panels | SLOs Mapped |
|-----------|------|--------|------------|
| Titan Trading System — Comprehensive | Grafana | 14 panels | Availability, latency, freshness, drawdown |

## On-Call Runbook
- Runbook entries: `docs/operations/runbooks/…`
- Operator commands: ARM, DISARM, HALT via `titan.cmd.operator.*`
- Alert escalation path documented in `docs/operations/monitoring-alerting.md`

> **Rule**: No black boxes. Every production failure must have a first-minute diagnosis path.
