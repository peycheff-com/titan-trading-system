# Integration Matrix

> **Audit Cycle**: 2026-02-11
> Cross-module boundary tests.

## Critical Path Integrations

| Module A | Module B | Integration Point | NATS Subject | Tested? | Evidence |
|----------|----------|--------------------|--------------|---------|----------|
| M01 Brain | M05 Execution | Intent → Order | `titan.cmd.execution.place.v1.>` | ❌ | — |
| M05 Execution | M01 Brain | Fill → Record | `titan.evt.execution.fill.v1` | ❌ | — |
| M02 Scavenger | M01 Brain | Signal → Approval | `titan.evt.scavenger.signal.v1` | ❌ | — |
| M03 Hunter | M01 Brain | Signal → Approval | `titan.evt.hunter.>` | ❌ | — |
| M04 Sentinel | M01 Brain | Signal → Approval | `titan.evt.sentinel.>` | ❌ | — |
| M01 Brain | M05 Execution | Risk Command | `titan.cmd.risk.*` | ❌ | — |
| M01 Brain | M05 Execution | Halt Command | `titan.cmd.sys.halt.v1` | ❌ | — |
| M08P PowerLaw | All Phases | Metrics Broadcast | `powerlaw.metrics.*` | ❌ | — |
| M01 Brain | All Phases | Budget Updates | `titan.evt.budget.update.v1` | ❌ | — |

## Operator Integrations

| Module A | Module B | Integration Point | NATS Subject | Tested? | Evidence |
|----------|----------|--------------------|--------------|---------|----------|
| M11 Console | M12 Console API | UI → API | REST / WebSocket | ❌ | — |
| M12 Console API | M01 Brain | API → Brain state | Direct query | ❌ | — |
| M11 Console | M06 NATS | Real-time events | `titan.data.>`, `titan.evt.>` | ❌ | — |

## Infrastructure Integrations

| Module A | Module B | Integration Point | Protocol | Tested? | Evidence |
|----------|----------|--------------------|----------|---------|----------|
| M01 Brain | M08 PostgreSQL | Truth Ledger | SQL | ❌ | — |
| M01 Brain | M09 Redis | Signal Cache | Redis protocol | ❌ | — |
| M01 Brain | M06 NATS | Event Bus | NATS client | ❌ | — |
| M05 Execution | M06 NATS | Command Bus | NATS client | ❌ | — |
| M16 Monitoring | M01, M05 | Metrics Scrape | Prometheus HTTP | ❌ | — |

## Data Flow Integrations

| Module A | Module B | Integration Point | Protocol | Tested? | Evidence |
|----------|----------|--------------------|----------|---------|----------|
| M07 AI Quant | M06 NATS | Quant commands | `titan.cmd.ai.>` | ❌ | — |
| M08P PowerLaw | M06 NATS | PowerLaw data | `titan.data.powerlaw.>` | ❌ | — |
| M13 OpsD | M06 NATS | Operations events | NATS client | ❌ | — |
| M13 OpsD | M08 PostgreSQL | Health checks | SQL | ❌ | — |

> **Blocking rule**: If M06 (NATS) or M08 (PostgreSQL) are below Gate C, no downstream module can reach Gate B.
