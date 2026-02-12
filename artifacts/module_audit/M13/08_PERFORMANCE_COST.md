# M13 — Performance and Cost Budgets

## Latency Budget
| Operation | P50 | P95 | P99 | Hard Limit |
|-----------|-----|-----|-----|------------|
| HMAC verification | <1ms | <2ms | <5ms | 10ms |
| Docker restart (single service) | ~2s | ~5s | ~10s | 30s |
| Docker halt (all services) | ~3s | ~8s | ~15s | 60s |
| Deploy (pull + up -d) | ~10s | ~30s | ~60s | 120s |

## Throughput Target
- OpsD handles < 10 commands/hour in normal operation. Not throughput-sensitive.

## Resource Budgets
| Resource | Budget | Measurement |
|----------|--------|-------------|
| CPU | <0.1 core idle, <0.5 core during command | Docker stats |
| Memory | <50MB RSS | Docker stats |
| Storage | Negligible (no state) | — |

## Trading Cost Budget
| Unit | Cost | Measurement |
|------|------|-------------|
| N/A | OpsD does not trade | — |
| Daily infra cost | ~$0.50 (container overhead) | DigitalOcean billing |

## CI Impact
| Metric | Target | Current |
|--------|--------|---------|
| Build time | <10s | ~5s (tsc only) |
| Test time | <5s | ~2s |
| SOTA checks | <5s | Included in monorepo lint |

> **Rule**: If cost is not measured, it is not controlled.
