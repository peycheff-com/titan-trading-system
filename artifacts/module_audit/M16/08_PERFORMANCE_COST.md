# M16 — Performance and Cost Budgets

## Latency Budget
| Operation | P50 | P95 | P99 | Hard Limit |
|-----------|-----|-----|-----|------------|
| Prometheus scrape (per target) | < 100ms | < 500ms | < 1s | 4s (scrape_timeout) |
| Alert evaluation | < 10ms | < 50ms | < 100ms | — |
| Grafana dashboard render | < 500ms | < 2s | < 5s | — |

## Throughput Target
- 7 scrape targets × 5s interval = ~1.4 scrapes/second
- ~500 time series per target (estimated)
- ~3,500 total active time series

## Resource Budgets
| Resource | Budget | Measurement |
|----------|--------|-------------|
| CPU (Prometheus) | < 0.5 cores | `rate(process_cpu_seconds_total{job="prometheus"}[5m])` |
| Memory (Prometheus) | < 500MB | `process_resident_memory_bytes{job="prometheus"}` |
| Storage (Prometheus) | 10GB max | `retention.size` in config |
| CPU (Grafana) | < 0.25 cores | Container metrics |
| Memory (Grafana) | < 256MB | Container metrics |

## Storage Retention
| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `retention.time` | 30d | Sufficient for monthly review cycles |
| `retention.size` | 10GB | Disk budget for VPS deployment |
| WAL compression | enabled | Reduces I/O and storage overhead |

## Trading Cost Budget
| Unit | Cost | Measurement |
|------|------|-------------|
| Per trade (fees) | N/A — monitoring does not trade | — |
| Daily infra cost | ~$5/month (Prometheus + Grafana containers) | DigitalOcean billing |

## CI Impact
| Metric | Target | Current |
|--------|--------|---------|
| Brain PrometheusMetrics tests | < 5s | ~1s |
| Config validation | < 5s | ~1s |

> **Rule**: If cost is not measured, it is not controlled.
