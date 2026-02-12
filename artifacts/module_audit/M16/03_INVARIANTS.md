# M16 — Invariants

> Cross-reference system invariants I-01 through I-20 from [system-source-of-truth.md](file:///Users/ivan/Code/work/trading/titan/docs/system-source-of-truth.md).

## Control Loop (Cybernetics Lens)

### Essential Variables (what must never drift)
- Scrape freshness: all targets scraped within their configured interval
- Alert routing: critical alerts delivered within 30s of firing
- Dashboard availability: Grafana reachable during market hours
- SLO burn rate: error budget consumption tracked accurately

### Sensors (how you observe reality)
- Prometheus `up` metric per target (1 = reachable, 0 = down)
- `scrape_duration_seconds` per target
- Alertmanager notification delivery status
- Grafana health endpoint

### Actuators (what you can change)
- Scrape interval adjustment
- Alert threshold tuning
- Dashboard panel configuration
- Retention policy changes

### Regulator Policy (what governs action)
- SLOs in `monitoring/slos.yaml` govern alert thresholds
- Alert rules in `alert-rules.yml` govern notification policy
- Retention policy (30d / 10GB) governs storage

### Time Constants
- Scrape interval: 5s (services) / 15s (infrastructure)
- Alert evaluation: 30s–5m depending on group
- Retention: 30 days

### Variety Budget
- **Input variety**: 7 scrape targets × N metrics each
- **Attenuation**: Aggregation via PromQL, dashboard summarization
- **Amplification**: Alerting rules expand low-level metrics into actionable notifications

## Module Invariants

| # | Invariant | System ID | Enforcement | Test | Evidence |
|---|-----------|-----------|-------------|------|----------|
| 1 | All services expose `/metrics` endpoint | I-16 | PrometheusMetrics class in each service | Brain: 14/14 tests pass | `PrometheusMetrics.test.ts` |
| 2 | Prometheus scrapes all declared targets | I-16 | `prometheus.yml` job definitions | Config validation | `infra/monitoring/prometheus.yml` |
| 3 | Critical alerts fire within 30s of threshold breach | I-16 | `for: 0s` on critical alerts | Alert rule config | `alert-rules.yml` |
| 4 | SLO burn-rate alerts prevent silent budget exhaustion | I-16 | `monitoring/slos.yaml` rules | Config review | `slos.yaml` |
| 5 | Circuit breaker status is always observable | I-05 | `circuit_breaker_active` gauge | Brain metrics test | Dashboard panel #3 |
