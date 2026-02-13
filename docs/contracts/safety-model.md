# TITAN Production Safety Model

> Operating manual for kill switches, circuit breakers, and safety interlocks.

## Kill Switch Hierarchy

| Switch | Scope | Trigger | Effect | Recovery |
|--------|-------|---------|--------|----------|
| **HARD_HALT** | Global | Operator / drift threshold | Reject all intents, close all positions | Manual `OPEN` command |
| **SOFT_HALT** | Global | Risk limit breach | Reject new intents, keep existing positions | Auto-clear after cooldown |
| **ARM/DISARM** | Physical interlock | Operator toggle | Disarmed = reject all intents (fail-safe) | Manual re-arm |
| **Per-Phase Circuit Breaker** | Per strategy | Loss threshold | Disable one phase only | Auto-reset or manual |

## Circuit Breaker Layers

```
┌─────────────────────────────────────────────┐
│  REFLEX (Rust, <1ms)                        │
│  - Staleness monitor → halt if no tickers   │
│  - Drift detector → halt if spread > 50bps  │
│  - Policy hash mismatch → reject intent     │
├─────────────────────────────────────────────┤
│  TRANSACTIONAL (Rust, per-intent)            │
│  - Position limit cap                        │
│  - Max slippage enforcement                  │
│  - Duplicate signal id rejection             │
│  - TTL enforcement (stale intents rejected)  │
├─────────────────────────────────────────────┤
│  STRATEGIC (Brain, per-decision)             │
│  - Per-phase loss limits                     │
│  - Portfolio correlation guard               │
│  - Leverage cap                              │
│  - DEFCON regime gating                      │
└─────────────────────────────────────────────┘
```

## Override Audit Requirements

All manual overrides (halt/resume, arm/disarm, policy changes) are:
1. Published as NATS events on `titan.evt.ops.*`
2. Persisted in the Redb event log
3. Include `operator_id`, `reason`, `timestamp`, and `correlation_id`

## RBAC Model

| Role | Permissions |
|------|------------|
| `operator` | Arm/disarm, halt/resume, view dashboard |
| `admin` | All operator + policy updates, config changes |
| `readonly` | Dashboard view only |

RBAC is enforced via NATS user credentials + API auth middleware.

## Immutable Audit Log

Every state change in the execution engine is logged to:
1. **Redb** — local durable storage for crash recovery
2. **NATS `titan.evt.execution.*`** — distributed event log for consumers
3. **Structured JSON logs** — for external SIEM integration
