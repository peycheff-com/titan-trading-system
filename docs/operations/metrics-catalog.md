# Metrics Catalog

> **Status**: Canonical
> **Source**: Inventory from source code

## Health Endpoints

| Service | Port | Path | Dependencies Checked |
|:--------|:-----|:-----|:---------------------|
| titan-brain | 3100 | `/health` | DB, Redis, NATS, Config, Memory, Venues |
| titan-brain | 3100 | `/metrics` | Prometheus prom-client export |
| titan-scavenger | 8081 | `/health` | Binance WS, Execution svc |
| titan-scavenger | 8081 | `/health/live` | (liveness only) |
| titan-scavenger | 8081 | `/health/ready` | Binance connected |
| titan-scavenger | 8081 | `/metrics` | Prometheus text export |
| titan-sentinel | 8084 | `/health` | NATS, Binance, Bybit |
| titan-sentinel | 8084 | `/status` | Regime mode + actions |
| titan-hunter | 8083 | `/metrics` | (configured in Prometheus, unverified) |
| titan-execution-rs | 3002 | `/health` | Internal state |
| titan-execution-rs | 3002 | `/metrics` | Rust prometheus crate |
| NATS | 8222 | `/healthz` | Cluster status |

## Brain Metrics (`titan_brain_*` prefix, prom-client)

| Metric Name | Type | Labels | Meaning |
|:------------|:-----|:-------|:--------|
| `signal_processing_latency_ms` | histogram | `phase_id`, `approved` | Signal evaluation latency end-to-end |
| `decisions_total` | counter | `phase_id`, `approved` | Total decisions (accept / reject) |
| `database_query_duration_ms` | histogram | `operation`, `table` | DB round-trip per query |
| `cache_requests_total` | counter | `cache_name`, `result` | Cache hit / miss breakdown |
| `current_equity` | gauge | — | Portfolio equity USDT |
| `allocation_weight` | gauge | `phase_id` | Allocation per phase (0–1) |
| `circuit_breaker_active` | gauge | — | 1 = tripped, 0 = normal |
| `open_positions_count` | gauge | `phase_id` | Open positions per phase |
| `signal_queue_size` | gauge | — | Pending signal backlog |
| `high_watermark` | gauge | — | Peak equity watermark |
| `daily_drawdown_percent` | gauge | — | Current drawdown vs. HWM |
| `current_leverage` | gauge | — | Combined leverage ratio |
| `performance_modifier` | gauge | `phase_id` | Kelly-style modifier |
| `sharpe_ratio` | gauge | `phase_id` | Rolling Sharpe |
| `sweep_operations_total` | counter | `status` | Sweep success / failure |
| `notifications_sent_total` | counter | `channel`, `type` | Alert dispatch count |
| `truth_confidence_score` | gauge | — | SSOT confidence 0–100 |
| `truth_drift_events_total` | counter | `source` | Reconciliation drift events |

## Execution Metrics (`titan_execution_*` prefix, Rust prometheus)

| Metric Name | Type | Labels | Meaning |
|:------------|:-----|:-------|:--------|
| `order_latency_seconds` | histogram | — | Intent → Fill latency |
| `slippage_bps` | histogram | — | Execution slippage in bps |
| `bulgaria_adverse_selection_bps` | histogram | — | Post-fill adverse selection 1s |
| `fill_quality_spread_capture_pct` | histogram | — | Effective spread capture % |
| `risk_state` | gauge | — | 0=Normal, 1=Cautious, 2=Defensive |
| `active_positions` | gauge | — | Current open position count |
| `filled_orders_total` | counter | — | Successfully filled orders |
| `invalid_intents_total` | counter | — | Schema-invalid intents received |
| `expired_intents_total` | counter | — | Intents rejected (expired) |
| `dlq_published_total` | counter | — | Dead-letter queue publishes |
| `fanout_orders_total` | counter | — | Fan-out child orders created |
| `position_flips_total` | counter | — | Position direction flips |
| `risk_rejections_total` | counter | — | Risk guard rejections |
| `rejection_events_total` | counter | — | Rejection telemetry events |

## NATS Telemetry (Rust side)

| Metric Name | Type | Meaning |
|:------------|:-----|:--------|
| `nats_lag_messages` | gauge | Consumer lag in messages |
| `nats_messages_in_process` | gauge | Messages currently being processed |
| `nats_storage_pressure_bytes` | gauge | JetStream storage usage |

## Scavenger Metrics (`titan_scavenger_*` prefix)

| Metric Name | Type | Labels | Meaning |
|:------------|:-----|:-------|:--------|
| `traps_detected_total` | counter | `trap_type`, `symbol` | Trap detection events |
| `signals_generated_total` | counter | `symbol`, `direction`, `result` | Signal generation rate |
| `ipc_messages_total` | counter | `direction`, `result` | IPC sent/received |
| `ipc_latency_ms` | histogram | `message_type` | IPC round-trip latency |
| `binance_ticks_total` | counter | `symbol` | Raw tick throughput |
| `binance_connected` | gauge | — | WS connection status |
| `active_traps` | gauge | `trap_type` | Active trap count |
| `trap_calculation_duration_ms` | histogram | `calculation_type` | Trap calc latency |
| `tick_processing_rate` | gauge | — | Ticks/sec throughput |
| `health_status` | gauge | `component` | Component health (1/0) |
| `config_reloads_total` | counter | `result` | Config reload count |

## SLO Definitions (from `monitoring/slos.yaml`)

| SLO | Target | Window | Alert |
|:----|:-------|:-------|:------|
| Availability | 99.9% | 28d | Error budget burn >14.4× normal |
| Execution Latency | P99 < 100ms | 5m | `ExecutionLatencyBreach` |
| Brain Latency | P99 < 500ms | 5m | `BrainLatencyBreach` |
| Market Data Freshness | < 5s stale | instant | `MarketDataStale` |
| Daily Drawdown | < 5% | — | `HighDrawdown` (from alert-rules) |

## Known Gaps

| # | Gap | Impact |
|:--|:----|:-------|
| 1 | **No kill-switch metric or endpoint** | Cannot prove kill-switch drill |
| 2 | **Hunter health/metrics endpoint unverified** | Phase 2 may be blind |
| 3 | **Sentinel has no `/metrics` endpoint** | No Prometheus scrape |
| 4 | **No funding rate or basis metrics** | Sentinel strategy metrics invisible |
| 5 | **No per-venue fill rate metric** | Cannot diagnose venue-specific issues |
| 6 | **No event lag metric (brain side)** | Signal-to-execution lag unmeasured |
