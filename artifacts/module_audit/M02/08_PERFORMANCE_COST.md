# M02 — Performance and Cost Budgets

## Latency Budget
| Operation | P50 | P95 | P99 | Hard Limit |
|-----------|-----|-----|-----|------------|
| <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |

## Throughput Target
- <!-- -->

## Resource Budgets
| Resource | Budget | Measurement |
|----------|--------|-------------|
| CPU | <!-- --> | <!-- --> |
| Memory | <!-- --> | <!-- --> |
| Storage | <!-- --> | <!-- --> |

## Trading Cost Budget
| Unit | Cost | Measurement |
|------|------|-------------|
| Per trade (fees) | Maker/Taker from `fee_schedule.json` | Exchange reports |
| Daily infra cost | <!-- --> | DigitalOcean billing |
| Slippage budget | < 100 bps | Execution quality metrics |

## CI Impact
| Metric | Target | Current |
|--------|--------|---------|
| Build time | <!-- --> | <!-- --> |
| Test time | < 30s | <!-- --> |
| SOTA checks | < 30s | <!-- --> |

> **Rule**: If cost is not measured, it is not controlled.
