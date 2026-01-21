# Monitoring and Alerting

## SLOs and KPIs

Baseline SLOs used for alerting:

- **Service availability**: 99.9% uptime for Brain and Execution
- **Signal processing latency**: P95 < 100ms
- **Order latency**: P95 < 1s (exchange-inclusive)
- **Database query latency**: P95 < 1000ms
- **Daily drawdown**: < 5% (critical threshold)

## Alert Thresholds

Alert rules are defined in `monitoring/prometheus/config/alert-rules-comprehensive.yml` and include:

- ServiceDown: `up{job=~"titan-.*"} == 0` for 30s
- HighSignalLatency: P95 > 100ms (Brain)
- HighOrderLatency: P95 > 1s (Execution)
- LowOrderFillRate: < 80%
- HighDrawdown: > 5%
- LowEquity: < $200
- HighCPUUsage: > 80% for 5m
- HighMemoryUsage: > 400MB for 5m
- LowDiskSpace: < 10% free

## Dashboards

Grafana dashboards are provisioned from:

- `monitoring/grafana/dashboards/titan-comprehensive.json`

Use this dashboard for:
- Phase-level signal rates and rejection ratios
- Execution latency and fill rate
- Brain risk metrics and drawdown state

## Operator Workflow

1. Monitor the Grafana overview dashboard during market hours
2. Acknowledge alerts and follow runbooks in `docs/operations/runbooks`
3. Escalate critical alerts to the trading operations manager
