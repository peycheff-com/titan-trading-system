# M14 — Performance and Cost Budgets

## Latency Budget
| Operation | P50 | P95 | P99 | Hard Limit |
|-----------|-----|-----|-----|------------|
| `quality:plan` | <5s | <10s | <15s | 30s |
| `quality:run` (Low tier) | <60s | <120s | <180s | 300s |
| `quality:run` (High tier) | <300s | <600s | <900s | 1200s |
| `quality:fix` | <30s | <60s | <90s | 120s |

## Throughput Target
- Single invocation per CI pipeline run (not a concurrent service)
- SOTA checks run sequentially by design (`executeSeq` in `run.ts:261-268`)

## Resource Budgets
| Resource | Budget | Measurement |
|----------|--------|-------------|
| CPU | 1 core | CLI process |
| Memory | <512MB | Node.js heap (glob scanning is the main consumer) |
| Storage | <50MB | Evidence pack JSON output |

## Trading Cost Budget
N/A — Quality OS is a developer tool with no trading cost impact.

## CI Impact
| Metric | Target | Current |
|--------|--------|---------|
| Plan generation | <10s | ~5s (git diff + graph build) |
| Test execution | <30s per package | Varies by package |
| SOTA checks | <60s each | Timeouts defined in `sota-registry.ts` (30s-600s) |
| Evidence generation | <5s | JSON serialization only |

> **Rule**: If cost is not measured, it is not controlled.
> Quality OS controls cost via the `CostPack` evidence pack which tracks runtime minutes per job.
