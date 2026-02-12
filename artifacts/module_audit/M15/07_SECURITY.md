# M15 — Security Posture

Reference: [security.md](file:///Users/ivan/Code/work/trading/titan/docs/security.md)

## Threat Model Summary (top threats for this module)
1. **SQL injection via symbol/timeframe** — Mitigated: `HistoricalDataService` uses parameterized queries (`$1`, `$2`, etc.)
2. **Mock-to-real parity drift** — Mock clients could diverge from real exchange APIs, producing misleading backtest results. Mitigated by structural type compatibility (loose `as any` casting).
3. **Unsigned NATS intents in GoldenPath** — Harness intentionally publishes unsigned intents for rejection testing. Not a threat since harness is research-only.
4. **Database credential exposure** — `DATABASE_URL` read from `process.env` or hardcoded default. Mitigated: default is localhost-only.

## NATS ACL Boundaries
- Service identity: `titan-harness` (client name in NATS connect)
- Trust zone: Full Access (publish signals, subscribe to execution intents and rejections)
- Note: Harness should only run in development/staging environments

## HMAC Signing Coverage
| Boundary | What is Signed | Verification Point |
|----------|----------------|-------------------|
| N/A | N/A | N/A — Backtesting module does not sign or verify HMAC. GoldenPath tests rejection of unsigned intents. |

## Secrets Handling
| Secret | Storage | Rotation Policy | Fail-Closed? |
|--------|---------|----------------|--------------|
| `DATABASE_URL` | `.env` / process env | Manual | No — falls back to localhost default |
| NATS URL | CLI argument / default | Manual | Yes — connection fails if unavailable |

## Supply Chain Controls
- `npm audit` applicable to `titan-backtesting` and `titan-harness`
- Dependencies: `pg`, `minimist`, `uuid`, `@titan/shared`, `titan-phase1-scavenger`
- All dependencies are standard, well-maintained packages

## Exchange Credential Isolation
| Control | Mechanism |
|---------|-----------|
| No real credentials | Mock clients only — no API keys, no withdrawal capability |
| Simulation-only | `BacktestEngine` never connects to real exchanges |
