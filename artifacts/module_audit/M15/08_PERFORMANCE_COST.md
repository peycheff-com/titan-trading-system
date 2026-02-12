# M15 — Performance and Cost Budgets

## Latency Budget
| Operation | P50 | P95 | P99 | Hard Limit |
|-----------|-----|-----|-----|------------|
| BacktestEngine.runSimulation (2 candles) | ~1ms | ~2ms | ~5ms | <30s |
| HistoricalDataService.getCandles (1000 rows) | ~50ms | ~100ms | ~200ms | <5s |
| ShippingGate.evaluate | <1ms | <1ms | <1ms | <100ms |
| GoldenPath signal-to-intent | ~50ms | ~200ms | ~500ms | 5s (timeout) |

## Throughput Target
- BacktestEngine: process 10,000+ candles per simulation run
- HistoricalDataService: handle datasets up to 1M rows via PostgreSQL pagination (not yet implemented)
- ShippingGate: evaluate in constant time (O(1) per metric check)

## Resource Budgets
| Resource | Budget | Measurement |
|----------|--------|-------------|
| CPU | Minimal — single-threaded candle loop | `time` command on backtest run |
| Memory | <256MB for typical simulation | Node.js heap usage |
| Storage | Read-only from PostgreSQL | No local storage requirements |

## Trading Cost Budget
| Unit | Cost | Measurement |
|------|------|-------------|
| Per simulation run | 0 (no real trades) | N/A |
| DB queries per run | 1-2 queries (candles + regimes) | PostgreSQL query count |
| NATS messages per harness run | 2-3 (signal + intent + rejection) | NATS message count |

## CI Impact
| Metric | Target | Current |
|--------|--------|---------|
| Build time (`tsc`) | <10s | ~3s |
| Test time (jest) | <30s | 0.221s |
| Total package CI | <60s | <10s |

> **Rule**: If cost is not measured, it is not controlled.
