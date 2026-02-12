# M17 — Performance and Cost Budgets

## Latency Budget
| Operation | P50 | P95 | P99 | Hard Limit |
|-----------|-----|-----|-----|------------|
| CI pipeline (full) | ~3 min | ~5 min | ~8 min | 15 min |
| Docker image build (per service) | ~60s | ~120s | ~180s | 300s |
| Production deploy (SSH → running) | ~120s | ~180s | ~240s | 300s |
| Health check convergence | ~30s | ~60s | ~90s | 120s (`MAX_WAIT`) |

## Throughput Target
- Deploy frequency: on-demand (push to main triggers pipeline)
- Nightly security scan: once per day at 07:17 UTC

## Resource Budgets
| Resource | Budget | Measurement |
|----------|--------|-------------|
| CPU (brain) | 0.5 core | `docker-compose.prod.yml` `deploy.resources.limits` |
| CPU (execution) | 1.0 core | `docker-compose.prod.yml` `deploy.resources.limits` |
| Memory (brain) | 1G | `docker-compose.prod.yml` `deploy.resources.limits` |
| Memory (execution) | 512M | `docker-compose.prod.yml` `deploy.resources.limits` |
| Memory (PG, micro) | 256M | `docker-compose.micro.yml` |
| Memory (Redis, micro) | 128M | `docker-compose.micro.yml` |
| Memory (NATS, micro) | 128M | `docker-compose.micro.yml` |
| JetStream storage | 20G max | `config/nats.conf` `max_file` |
| JetStream memory | 1G max | `config/nats.conf` `max_mem` |

## Trading Cost Budget
| Unit | Cost | Measurement |
|------|------|-------------|
| Per trade (fees) | Maker/Taker from `fee_schedule.json` | Exchange reports |
| Daily infra cost | ~$5-10/day (DigitalOcean droplet) | DigitalOcean billing |
| Slippage budget | < 100 bps | Execution quality metrics |

## CI Impact
| Metric | Target | Current |
|--------|--------|---------|
| Build time (node) | < 5 min | ~3 min |
| Build time (rust) | < 10 min | ~5 min (cached) |
| Security scan | < 2 min | ~1 min |
| Quality gate | < 2 min | ~1 min |
| Total pipeline | < 15 min | ~8 min |

> **Rule**: If cost is not measured, it is not controlled.
