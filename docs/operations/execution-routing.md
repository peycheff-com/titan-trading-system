# Execution Routing & Fan-Out

This document describes how the Execution service routes intents to exchanges and how
fan-out size splitting is configured.

## Default routing behavior

1. **Explicit exchange**: If an intent includes `exchange`, routing is forced to that exchange.
2. **Per-source routing**: If no `exchange` is provided, routing uses the configured
   per-source rules (see below).
3. **Fallback routing**: If no per-source rule exists, the default source mapping applies
   (`scavenger` → bybit+mexc, `hunter/sentinel` → binance).

## Configuration

Routing is configured under `execution.routing` in `config/config.json` (or overrides).

```json
{
  "execution": {
    "routing": {
      "fanout": true,
      "weights": {
        "binance": 0.6,
        "bybit": 0.4
      },
      "per_source": {
        "scavenger": {
          "fanout": true,
          "weights": { "bybit": 0.5, "mexc": 0.5 }
        },
        "hunter": {
          "fanout": false
        },
        "sentinel": {
          "fanout": false
        }
      }
    }
  }
}
```

### Notes

- If `weights` are provided, **fan-out is implicitly enabled** and the order size is
  split proportionally across exchanges.
- If `fanout` is false, only the **first resolved exchange** is used (single-route mode).
- The sum of weights does not need to equal 1.0; weights are normalized.
- Each child order receives a unique `client_order_id` suffix for reconciliation.

## Rollout Guidance

1. Deploy Brain publishers first (emit `t_signal` and schema metadata).
2. Deploy Execution with strict schema validation + DLQ enabled.
3. Enable routing fan-out via config once stability is verified.
