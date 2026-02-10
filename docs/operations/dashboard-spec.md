# Operator Command Center — Dashboard Specification

> **Status**: Canonical
> **Source**: Grounded in existing implemented metrics

## Existing Dashboard

Grafana dashboard: `services/titan-brain/monitoring/grafana-dashboard-comprehensive.json`
Prometheus config: `services/titan-brain/monitoring/prometheus-comprehensive.yml` (scrapes 6 targets at 5s intervals)

> [!IMPORTANT]
> This spec references **only metrics that exist in code**. Panels marked 🔴 require implementation first.

## Dashboard Layout (4 rows)

### Row 1 — System Health ("Is the system alive?")

| Panel | Type | Query / Source |
|:------|:-----|:---------------|
| Service Health Matrix | Stat grid | `up{job=~"titan-.*"}` |
| Brain Health | Stat | `GET :3100/health → status` |
| Scavenger Health | Stat | `GET :8081/health → status` |
| Sentinel Health | Stat | `GET :8084/health → status` |
| Execution Health | Stat | `GET :3002/health → status` |
| NATS Health | Stat | `GET :8222/healthz` |
| Circuit Breaker | Stat | `titan_brain_circuit_breaker_active` |
| Risk State | Stat | `titan_execution_risk_state` |

### Row 2 — Risk & Exposure ("Are we within limits?")

| Panel | Type | Query |
|:------|:-----|:------|
| Portfolio Equity | Time series | `titan_brain_current_equity` |
| Daily Drawdown % | Gauge + threshold | `titan_brain_daily_drawdown_percent` |
| High Watermark | Time series | `titan_brain_high_watermark` |
| Leverage | Gauge | `titan_brain_current_leverage` |
| Allocation Weights | Pie / bar | `titan_brain_allocation_weight{phase_id=~".*"}` |
| Active Positions | Stat | `titan_execution_active_positions` |
| Risk Rejections | Counter | `rate(titan_execution_risk_rejections_total[5m])` |
| 🔴 Funding/Basis | — | Not implemented |

### Row 3 — Latency & Throughput ("Are we fast enough?")

| Panel | Type | Query |
|:------|:-----|:------|
| Signal Latency P95/P99 | Time series | `histogram_quantile(0.95, rate(titan_brain_signal_processing_latency_ms_bucket[5m]))` |
| Order Latency P95/P99 | Time series | `histogram_quantile(0.95, rate(titan_execution_order_latency_seconds_bucket[5m]))` |
| Slippage Distribution | Heatmap | `titan_execution_slippage_bps_bucket` |
| Fill Rate | Stat | `rate(titan_execution_filled_orders_total[5m])` |
| Tick Throughput | Time series | `titan_scavenger_tick_processing_rate` |
| NATS Consumer Lag | Time series | `nats_lag_messages` |
| NATS Storage | Time series | `nats_storage_pressure_bytes` |
| DB Query Time P95 | Time series | `histogram_quantile(0.95, rate(titan_brain_database_query_duration_ms_bucket[5m]))` |

### Row 4 — Decisions & Truth ("Are decisions correct?")

| Panel | Type | Query |
|:------|:-----|:------|
| Decision Approval Rate | Time series | `rate(titan_brain_decisions_total{approved="true"}[5m]) / rate(titan_brain_decisions_total[5m])` |
| Sharpe Ratio by Phase | Time series | `titan_brain_sharpe_ratio{phase_id=~".*"}` |
| Truth Confidence | Gauge | `titan_brain_truth_confidence_score` |
| Drift Events | Counter | `rate(titan_brain_truth_drift_events_total[5m])` |
| DLQ Published | Counter | `rate(titan_execution_dlq_published_total[5m])` |
| Invalid Intents | Counter | `rate(titan_execution_invalid_intents_total[5m])` |
| Adverse Selection | Time series | `titan_execution_bulgaria_adverse_selection_bps` |
| Spread Capture | Histogram | `titan_execution_fill_quality_spread_capture_pct` |

## Alert Overlay

| Alert | Condition | Severity | Runbook |
|:------|:----------|:---------|:-------|
| `HighErrorBudgetBurn` | >14.4× error budget burn/1h | critical | [incident_response](../runbooks/incident_response.md) |
| `ExecutionLatencyBreach` | P99 > 100ms for 2m | warning | — |
| `BrainLatencyBreach` | P99 > 500ms for 5m | warning | — |
| `MarketDataStale` | No tick > 5s | critical | [exchange_outage](../runbooks/exchange_outage.md) |
| `ServiceDown` | `up == 0` for 30s | critical | — |
| `HighDrawdown` | > 5% | critical | — |
| `HighCPUUsage` | > 80% for 5m | warning | — |
| `HighMemoryUsage` | > 400MB for 5m | warning | — |
