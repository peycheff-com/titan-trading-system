# PowerLaw Mode Runbooks

[← Back to Runbooks](README.md)


Operational procedures for Titan's Power Law tail-risk system.

## Mode Overview

| Mode | Constraints Published | Brain Impact | Execution Engine |
|------|----------------------|--------------|------------------|
| **SHADOW** | Yes (no effect) | Logs only | No enforcement |
| **ADVISORY** | Yes (alerts) | Alerts to console | Soft limits, warnings |
| **ENFORCEMENT** | Yes (enforced) | Active alerts | Hard limits, blocks trades |

---

## SHADOW Mode

**Purpose**: Observe PowerLaw metrics without affecting trading.

### Activation

```bash
# Via environment
POWERLAW_MODE=shadow

# Via Brain API
curl -X POST http://brain:8080/api/powerlaw/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "SHADOW"}'
```

### Monitoring

- Check metrics at `/metrics` endpoint
- Watch `titan_powerlaw_tail_alpha` gauge
- Review logs for constraint computation

### Expected Behavior

- Constraints published to NATS
- No trading impact
- Console shows real-time metrics
- Execution engine ignores constraints

---

## ADVISORY Mode

**Purpose**: Alert operators to tail-risk conditions without blocking trades.

### Activation

```bash
POWERLAW_MODE=advisory
```

### Monitoring

- Console alerts for high-risk conditions
- Prometheus alerting on `health_status < 1`
- Impact events in `titan.evt.powerlaw.impact.v1`

### Expected Behavior

- Soft constraints computed
- Warnings in execution engine logs
- Orders not blocked (logged only)
- Impact events record decisions

---

## ENFORCEMENT Mode

**Purpose**: Actively enforce tail-risk constraints on order flow.

### Activation

```bash
POWERLAW_MODE=enforcement
```

### Pre-Flight Checks

1. Verify metrics computation is stable (α in expected range)
2. Confirm TTL settings (`ttl_ms` default: 120000)
3. Check execution engine constraint store is receiving updates
4. Review recent impact events for expected patterns

### Monitoring

- `titan_powerlaw_constraints_published_total` counter
- Execution engine logs for blocked/modified orders
- Console shows active constraints per symbol

### Expected Behavior

- Hard constraints enforced
- Orders exceeding limits rejected
- `reduce_only` blocks new positions when triggered
- Impact events log all enforcement actions

---

## Emergency Procedures

### Disable PowerLaw Enforcement

```bash
# Immediate disable via env
POWERLAW_MODE=shadow

# Or via API
curl -X POST http://brain:8080/api/powerlaw/mode \
  -d '{"mode": "SHADOW"}'
```

### Stale Constraints

If constraints become stale (`ttl_ms` expired):

- Execution engine falls back to defensive defaults
- `reduce_only: true` activated
- Max notional reduced to `100_000`

### Metric Health Degradation

| Status | Action |
|--------|--------|
| `ok` | Normal operation |
| `stale` | Investigate data pipeline |
| `low_sample` | Check market data feed |
| `fit_failed` | Review estimator logs |

---

## Grafana Dashboard Queries

```promql
# Tail Alpha per Symbol
titan_powerlaw_tail_alpha{venue="binance"}

# Health Status Distribution
count by (status) (titan_powerlaw_health_status)

# Constraints Published Rate
rate(titan_powerlaw_constraints_published_total[5m])

# Computation Latency
histogram_quantile(0.95, titan_powerlaw_computation_duration_ms_bucket)
```
