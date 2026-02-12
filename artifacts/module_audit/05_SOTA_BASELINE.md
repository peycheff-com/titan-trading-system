# SOTA Baseline

> **Audit Cycle**: 2026-02-11
> Pin the exact standards being measured. Reference, don't reinvent.

| Dimension | Standard | Canonical Source |
|-----------|----------|------------------|
| Invariants | System Invariants I-01 through I-20 | [system-source-of-truth.md §2](file:///Users/ivan/Code/work/trading/titan/docs/system-source-of-truth.md) |
| Risk Policy | Canonical risk parameters, hash-verified cross-language | [risk_policy.json](file:///Users/ivan/Code/work/trading/titan/packages/shared/risk_policy.json) |
| HMAC Security | Fail-closed signing, envelope validation | [security.md §3](file:///Users/ivan/Code/work/trading/titan/docs/security.md) |
| Circuit Breakers | Normal → Cautious → Defensive → Emergency | [circuit_breakers.md](file:///Users/ivan/Code/work/trading/titan/docs/risk/circuit_breakers.md) |
| NATS ACLs | Per-service publish/subscribe isolation | [nats.conf](file:///Users/ivan/Code/work/trading/titan/config/nats.conf) |
| Reconciliation | Shadow State vs Exchange State every 1 min | [system-source-of-truth.md §10.6](file:///Users/ivan/Code/work/trading/titan/docs/system-source-of-truth.md) |
| Observability | SLOs, metrics, tracing per slos.yaml | [metrics-catalog.md](file:///Users/ivan/Code/work/trading/titan/docs/operations/metrics-catalog.md) |
| Data Integrity | RLS, partitioned tables, fill dedup | [schema.sql](file:///Users/ivan/Code/work/trading/titan/services/titan-brain/src/db/schema.sql) |
| Quality Gates | CI pipeline (7 jobs), SOTA checks | [ci.yml](file:///Users/ivan/Code/work/trading/titan/.github/workflows/ci.yml) |
| Idempotency | Redis signal cache, nonce tracking, fill dedup | [system-source-of-truth.md §9.4](file:///Users/ivan/Code/work/trading/titan/docs/system-source-of-truth.md) |
