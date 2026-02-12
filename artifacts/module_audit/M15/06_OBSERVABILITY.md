# M15 — Observability and Operations

## SLOs and SLIs
| SLI | SLO Target | Measurement | Window |
|-----|-----------|-------------|--------|
| Backtest completion | 100% of runs produce a `BacktestResult` | Exit code / result object | Per-run |
| Data gap detection rate | 100% of gaps > 1.5× interval logged | `validateContinuity()` warnings | Per-run |
| Golden path latency | P95 < 500ms | `GoldenPath.getLatencyStats()` | Per-scenario |

## Metrics
| Metric Name | Type | Labels | Alert Threshold |
|-------------|------|--------|----------------|
| `backtest_duration_ms` | gauge | `symbol`, `timeframe` | N/A (research) |
| `backtest_trades_count` | counter | `symbol` | N/A |
| `shipping_gate_passed` | counter | `gate_name` | N/A |
| `shipping_gate_rejected` | counter | `gate_name`, `reason` | N/A |
| `golden_path_latency_ms` | histogram | `scenario` | P95 > 500ms |
| `golden_path_rejections` | counter | `reason` | N/A |

> **Note**: Metrics are not yet instrumented via Prometheus. Currently tracked in-memory via `GoldenPath.getLatencyStats()` and `getRejectionStats()`.

## Logs
| Structured Field | Required? | Description |
|-----------------|-----------|-------------|
| `symbol` | yes | Trading pair under test |
| `candle_count` | yes | Number of candles in simulation |
| `gap_ms` | conditional | Size of detected data gap |
| `signal_id` | yes (harness) | UUID v4 for signal correlation |

> **Note**: Currently uses `console.log` throughout both packages. Logger from `@titan/shared` is only used in `HistoricalDataService`.

## Traces
| Span Name | Correlation ID | Parent |
|-----------|---------------|--------|
| `backtest.run` | simulation ID | — |
| `golden_path.scenario` | signal_id | — |
| `golden_path.rejection_test` | signal_id | — |

> **Note**: No OpenTelemetry tracing instrumented yet.

## Dashboards and Alerts
| Dashboard | Tool | SLOs Mapped |
|-----------|------|------------|
| N/A | — | No production dashboard (research module) |

## On-Call Runbook
- Not applicable for research module — no on-call rotation
- CLI failures: check NATS connectivity, database state, configuration
