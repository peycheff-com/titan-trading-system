# Titan NATS Subjects Reference

**Generated**: 2026-02-05  
**Source**: `packages/shared/src/messaging/titan_subjects.ts`

## Subject Taxonomy

```
titan.{domain}.{verb}.{resource}.{version}[.{venue}.{account}.{symbol}]
```

## 1. Commands (titan.cmd.*)

### Execution Commands
| Subject Pattern | Publisher | Subscriber | Streaming |
|-----------------|-----------|------------|-----------|
| `titan.cmd.execution.place.v1.{venue}.{account}.{symbol}` | Brain | Execution | TITAN_CMD |
| `titan.cmd.execution.cancel.v1` | Brain | Execution | TITAN_CMD |
| `titan.cmd.execution.cancel_all.v1` | Brain | Execution | TITAN_CMD |
| `titan.cmd.execution.modify.v1` | Brain | Execution | TITAN_CMD |

### Risk Commands
| Subject | Publisher | Subscriber | Streaming |
|---------|-----------|------------|-----------|
| `titan.cmd.risk.halt.{venue}` | Safety | Execution | TITAN_CMD |
| `titan.cmd.risk.scale` | Brain | Execution | TITAN_CMD |

### System Commands
| Subject | Publisher | Subscriber | Streaming |
|---------|-----------|------------|-----------|
| `titan.cmd.sys.halt.v1` | Brain/Console | All | TITAN_CMD |
| `titan.cmd.sys.resume.v1` | Brain/Console | All | TITAN_CMD |
| `titan.cmd.sys.heartbeat` | All | All | None |

## 2. Events (titan.evt.*)

### Execution Events
| Subject | Publisher | Consumer | Streaming |
|---------|-----------|----------|-----------|
| `titan.evt.execution.fill.v1` | Execution | Brain | TITAN_EVT |
| `titan.evt.execution.shadow_fill.v1` | Execution | Brain | TITAN_EVT |
| `titan.evt.exec.report.v1` | Execution | Brain | TITAN_EVT |
| `titan.evt.execution.reject.v1` | Execution | Brain | TITAN_EVT |
| `titan.evt.execution.balance` | Execution | Brain | TITAN_EVT |
| `titan.evt.execution.truth.v1` | Execution | Brain | TITAN_EVT |

### Phase Events
| Subject | Publisher | Consumer | Streaming |
|---------|-----------|----------|-----------|
| `titan.evt.phase.trade.v1` | Phases | Brain | TITAN_EVT |
| `titan.evt.phase.signal.v1` | Phases | Brain | TITAN_EVT |
| `titan.evt.phase.thesis` | Phases | AI | TITAN_EVT |

### Safety Events
| Subject | Publisher | Consumer | Streaming |
|---------|-----------|----------|-----------|
| `titan.evt.safety.breaker.v1` | Brain | Console | TITAN_EVT |
| `titan.evt.safety.alert` | Brain | Console | TITAN_EVT |
| `titan.evt.halt.v1` | Brain | All | TITAN_EVT |
| `titan.evt.resume.v1` | Brain | All | TITAN_EVT |

### Budget Events
| Subject | Publisher | Consumer | Streaming |
|---------|-----------|----------|-----------|
| `titan.evt.budget.update.v1` | Brain | Phases | TITAN_EVT |
| `titan.evt.budget.exhausted.v1` | Brain | Phases | TITAN_EVT |

## 3. Data (titan.data.*)

### Market Data
| Subject | Publisher | Consumer | Streaming |
|---------|-----------|----------|-----------|
| `titan.data.market.ticker.{symbol}` | Execution | Phases | TITAN_DATA |
| `titan.data.market.orderbook.{symbol}` | Execution | Phases | TITAN_DATA |
| `titan.data.market.trade.{symbol}` | Execution | Phases | TITAN_DATA |
| `titan.data.market.funding.{symbol}` | Execution | Phases | TITAN_DATA |

### Signal Data
| Subject | Publisher | Consumer | Streaming |
|---------|-----------|----------|-----------|
| `titan.data.signal.entry.v1` | Brain | Phases | TITAN_DATA |
| `titan.data.signal.exit.v1` | Brain | Phases | TITAN_DATA |

### PowerLaw Data
| Subject | Publisher | Consumer | Streaming |
|---------|-----------|----------|-----------|
| `titan.data.powerlaw.metrics.{symbol}` | PowerLaw | Phases | TITAN_DATA |
| `titan.data.powerlaw.regime` | PowerLaw | Phases | TITAN_DATA |

## 4. System (titan.sys.*)

| Subject | Publisher | Consumer | Purpose |
|---------|-----------|----------|---------|
| `titan.sys.health.ping` | All | All | Health check |
| `titan.sys.health.pong` | All | All | Health response |
| `titan.sys.discovery.announce` | Services | Brain | Service discovery |
| `titan.sys.discovery.query` | Brain | Services | Query services |

## 5. Dead Letter Queue (titan.dlq.*)

| Subject | Publisher | Purpose |
|---------|-----------|---------|
| `titan.dlq.execution.v1` | Execution | Failed commands |
| `titan.dlq.generic.v1` | Any | General failures |

---

## JetStream Streams

| Stream | Subjects | Retention | Max Age | Max Size |
|--------|----------|-----------|---------|----------|
| TITAN_CMD | `titan.cmd.>` | Limits | 1 day | 1 GB |
| TITAN_EVT | `titan.evt.>` | Limits | 30 days | 10 GB |
| TITAN_DATA | `titan.data.>` | Limits | 1 day | 5 GB |
| TITAN_SIGNAL | `titan.signal.>` | Limits | 1 hour | 100 MB |
| TITAN_DLQ | `titan.dlq.>` | Limits | 7 days | 1 GB |

---

## NATS Service Accounts (from nats.conf)

| User | Publish | Subscribe | Role |
|------|---------|-----------|------|
| brain | `>` | `>` | Master Orchestrator |
| execution | `titan.evt.execution.>` | `titan.cmd.execution.>`, `titan.data.market.>` | Executor |
| scavenger | `titan.evt.scavenger.>` | `_INBOX.>`, `powerlaw.metrics.>` | Phase 1 |
| hunter | `titan.evt.hunter.>` | `titan.cmd.hunter.>`, `titan.ai.>` | Phase 2 |
| sentinel | `titan.evt.sentinel.>` | `titan.cmd.sentinel.>` | Phase 3 |
| powerlaw | `titan.data.powerlaw.>`, `titan.ai.>` | `titan.data.market.>`, `titan.evt.>` | Lab |
| quant | `titan.evt.quant.>`, `titan.cmd.ai.>` | `titan.data.powerlaw.>` | AI |
| console | `$JS.API.>` | `titan.data.>`, `titan.evt.>` | Read-only |
