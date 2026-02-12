# M01 — Contracts

## API Contracts
| Method | Route | Purpose | Consumer | Auth |
| cost | ----- | ------- | -------- | ---- |
| POST | `/signal` | Receive strategy signals | Phase 1/2/3 | HMAC |
| GET | `/dashboard` | UI Data | Frontend | None (Public/Internal) |
| GET | `/health` | Liveness check | K8s/Docker | None |
| POST | `/admin/override` | Manual Risk Override | Operator | Admin |
| GET | `/allocation` | Current Capital Allocation | Phases | None |

## Event Contracts (NATS)
| Subject | Direction | Frequency | Payload Schema | Strictness |
| ------- | --------- | --------- | -------------- | ---------- |
| `titan.cmd.ex.order.new` | PUB | Variable | `BrokerIntent` | Strict |
| `titan.evt.exec.report` | SUB | Variable | `ExecutionReport` | Strict |
| `titan.evt.risk.state` | PUB | OnChange | `RiskState` | Strict |
| `titan.sys.heartbeat` | PUB | 1Hz | `Heartbeat` | Relaxed |
| `titan.cmd.sys.halt` | SUB | Ad-hoc | `SystemState` | Strict |
| `titan.evt.exec.truth` | SUB | ~1min | `TruthSnapshot` | Strict |

## Data Contracts (Postgres)
- **Fills**: `fills` table (Audit trail of all executions)
- **Positions**: `positions` table (Snapshots for reconciliation)
- **Ledger**: `ledger` table (Double-entry accounting)
- **State**: `bot_state` table (Persistence for recovery)
