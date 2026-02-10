# Kill Switch Runbook

[← Back to Runbooks](README.md)

> **Scope**: Emergency halt of all trading activity
> **When**: Runaway losses, system compromise, or regulatory event

## Current State

> [!CAUTION]
> **No dedicated kill-switch endpoint or metric exists in code.**
> The circuit breaker in `titan-execution-rs` (`circuit_breaker_active` gauge) is the closest mechanism.
> The Sentinel has a `DEFENSIVE` / `EMERGENCY` mode, but no single-endpoint kill.

## Emergency Stop Procedure (Manual)

```bash
# === OPTION A: Stop All Services (Nuclear) ===
# Time: ~10 seconds. All positions remain open on exchange.
docker compose -f docker-compose.prod.yml stop titan-brain titan-execution titan-scavenger titan-sentinel

# === OPTION B: Stop Signal Flow Only ===
# Stops new signals but keeps position management alive.
docker compose -f docker-compose.prod.yml stop titan-scavenger titan-sentinel
# Brain and execution stay up to manage existing positions.

# === OPTION C: Trigger Circuit Breaker via Brain ===
# If Brain HTTP API is available:
# This depends on whether TitanBrain exposes a circuit breaker trigger endpoint.
# Currently: circuit_breaker_active gauge exists but no HTTP trigger found.
```

## Post-Kill Verification

```bash
# Confirm no new orders being placed
docker compose -f docker-compose.prod.yml logs --since 1m titan-execution 2>&1 | grep -i "fill\|order\|intent"
# Expect: NO new fills

# Check position state
curl -s localhost:3100/health | jq '.components'

# Check exchange directly for open positions
# (Manual via Binance/Bybit web console)
```

## Recovery From Kill

```bash
# 1. Confirm root cause is resolved
# 2. Verify DB state is consistent
docker exec titan-postgres pg_isready
curl -s localhost:3100/health | jq .

# 3. Restart in safe order
docker compose -f docker-compose.prod.yml up -d titan-brain
sleep 10
docker compose -f docker-compose.prod.yml up -d titan-execution
sleep 5
docker compose -f docker-compose.prod.yml up -d titan-scavenger titan-sentinel

# 4. Verify health
curl -s localhost:3100/health | jq .status
```

## Required Implementation (Gap)

To make this a proper kill switch, we need:
1. `POST /api/kill-switch` endpoint on Brain that sets `circuit_breaker_active = 1` and halts all signal processing
2. `titan_brain_kill_switch_active` gauge metric
3. Persistent state (survives restart) — store kill state in DB
4. Dashboard panel showing kill-switch state
