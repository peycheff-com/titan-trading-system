# Risk Register

> **Audit Cycle**: 2026-02-11
> Trading-specific risks with financial impact.

| ID | Risk | Module(s) | Likelihood | Impact | Mitigation | Status |
|----|------|-----------|------------|--------|------------|--------|
| R-01 | Shadow State drift from Exchange State | M05, M01 | Medium | Critical (fund loss) | Reconciliation loop (1min), drift detection | Open |
| R-02 | HMAC secret compromise | M05, M01 | Low | Critical (rogue orders) | Fail-closed `panic!`, rotation policy | Open |
| R-03 | Circuit breaker fails to activate | M05, M01 | Low | Critical (drawdown) | Multi-layer enforcement (Brain + Rust) | Open |
| R-04 | Risk policy hash mismatch silent fail | M10, M05 | Low | High | SHA256 handshake at boot | Open |
| R-05 | Exchange WebSocket disconnect undetected | M05 | Medium | High (stale positions) | Health check + stale ticker detection | Open |
| R-06 | NATS stream lag causes stale commands | M06 | Low | High (delayed execution) | Consumer pending monitoring, lag alerts | Open |
| R-07 | Fill deduplication failure | M01, M08 | Low | High (double accounting) | Redis nonce tracking + DB fill dedup | Open |
| R-08 | Rate limiter bypass | M05 | Low | Medium (exchange ban) | 10 RPS cap per exchange, leaky bucket | Open |
| R-09 | Unauthorized operator command | M11, M12 | Low | Critical (rogue orders) | HMAC-signed operator envelopes, ACL | Open |
| R-10 | Database partition overflow | M08 | Low | Medium (data loss) | Monthly partitioning on `fills`, `event_log` | Open |
| R-11 | Exchange API key exposure | M05 | Low | Critical (fund theft) | Trade-only scope, IP whitelist, no logging | Open |
| R-12 | Signal cache (Redis) failure | M09, M01 | Medium | Medium (duplicate signals) | Graceful degradation, signal dedup fallback | Open |
| R-13 | Clock drift across services | M05, M01 | Low | Medium (HMAC rejection) | NTP sync, 5min timestamp tolerance | Open |
| R-14 | NATS ACL misconfiguration | M06 | Low | High (unauthorized pub/sub) | ACL matrix audit, CI verification | Open |
| R-15 | Deployment mismatch (Brain/Execution version) | M17 | Medium | High (contract mismatch) | Coordinated deployment, schema validation | Open |
