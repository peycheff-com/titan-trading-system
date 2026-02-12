# M15 — Failure Modes and Blast Radius

> **Rule**: If you cannot describe recovery deterministically, you do not own the module.
> **Trading context**: Every failure mode must state financial impact.

| # | Failure Mode | Trigger | Detection Signal | Auto Containment | Manual Runbook | Fund Risk? | Customer Impact | Recovery Steps | RTO | RPO |
|---|-------------|---------|-----------------|-----------------|----------------|-----------|----------------|----------------|-----|-----|
| 1 | PostgreSQL connection failure | DB down or bad `DATABASE_URL` | `Pool.connect()` throws | Returns empty data or throws | Fix connection string / restart DB | no — research module | None (offline) | Restart DB, verify `DATABASE_URL` | <1 min | N/A |
| 2 | Corrupted historical data (gaps) | Missing candles in DB | `validateContinuity()` logs warning | Warning emitted, continues with gaps | Investigate data pipeline | no | None | Re-ingest missing candle data | Manual | N/A |
| 3 | ShippingGate false-negative (passes bad config) | Gate thresholds too loose | Post-deployment monitoring | None (gate is pre-deployment) | Review and tighten thresholds | indirect — allows risky config | Potential losses if live | Tighten gate config, re-run backtest | Manual | N/A |
| 4 | BacktestEngine metrics all-zero | TODO stubs not implemented | All metrics read `0` | None | Known limitation | no — known stub | Misleading results if gates rely on them | Implement actual metric calculation | Manual | N/A |
| 5 | Mock-to-real interface drift | Real client API changes without mock update | Runtime error in backtest | Build fails if types diverge (loose) | Update mock to match new interface | no | Backtest produces wrong results | Sync mock interface with real client | Manual | N/A |
| 6 | GoldenPath NATS timeout | Brain or Execution not running | Timeout after 5s → process exits 1 | Process exits non-zero | Start required services | no | CLI reports failure | Start Brain + Execution, re-run harness | <1 min | N/A |
| 7 | GoldenPath rejection test miss | Execution not enforcing policy hash | No rejection event in 3s | Returns `rejected: false` | Investigate Execution service | indirect — unsigned intents accepted | Security gap | Fix hash validation in Execution | Manual | N/A |
