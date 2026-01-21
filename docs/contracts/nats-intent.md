# NATS Intent Contract (v1)

This document defines the v1 Intent payload schema sent over NATS for Brain → Execution.
The authoritative JSON Schema is `docs/contracts/nats-intent.v1.schema.json`.

## Required fields

- `signal_id` (string)
- `t_signal` (integer ms since epoch) — legacy alias `timestamp` accepted
- `symbol` (string)
- `direction` (integer: -1 = SHORT, 1 = LONG, 0 = CLOSE/flatten)
- `type` (string enum: `BUY_SETUP`, `SELL_SETUP`, `CLOSE_LONG`, `CLOSE_SHORT`, `CLOSE`)
- `size` (number)
- `status` (string enum: `PENDING`, `VALIDATED`, `REJECTED`, `EXECUTED`, `EXPIRED`)

## NATS subject

- Commands: `titan.cmd.exec.place.v1.<venue>.<account>.<symbol>`
- Execution consumes: `titan.cmd.exec.>` (subject segments beyond this are for observability/routing)

## Optional fields

- Pricing & risk: `entry_zone`, `stop_loss`, `take_profits`, `confidence`, `leverage`,
  `max_slippage_bps`, `expected_impact_bps`, `fill_feasibility`
- Timing: `t_analysis`, `t_decision`, `t_ingress`, `t_exchange`
- Routing & context: `source`, `exchange`, `position_mode`, `regime_state`, `phase`
- `metadata` (free-form JSON object; include `correlation_id` for tracing)

## Backward compatibility rules

- `timestamp` is accepted as a legacy alias for `t_signal`.
- `entry_zone` and `take_profits` default to empty arrays when omitted.

## Schema versioning & migration

- `schema_version` is optional and defaults to `1.0.0`.
- Producers should **dual-write** `t_signal` and legacy `timestamp` during rollout.
- Consumers should accept `timestamp` until all publishers are updated.

## Rollout plan

1. **Deploy Brain publishers first** (emit `t_signal`, `timestamp`, and `schema_version`).
2. **Deploy Execution** with strict schema validation + DLQ routing enabled.
3. **Enable routing fan-out** via config once validation/DLQ metrics are stable.

## Example payload

```json
{
  "schema_version": "1.0.0",
  "signal_id": "sig-123",
  "source": "brain",
  "symbol": "BTCUSDT",
  "direction": 1,
  "type": "BUY_SETUP",
  "entry_zone": [52000, 52500],
  "stop_loss": 51000,
  "take_profits": [54000, 56000],
  "size": 1000,
  "status": "VALIDATED",
  "t_signal": 1737267600000,
  "metadata": {
    "correlation_id": "sig-123",
    "brain_authorized": true
  }
}
```
