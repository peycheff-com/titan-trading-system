# Exchange Outage Runbook

[← Back to Runbooks](README.md)

> **Services affected**: titan-scavenger, titan-sentinel, titan-hunter
> **Severity**: Critical (no market data = flying blind)

## Detection

- Alert: `MarketDataStale` (no tick > 5s) — severity critical
- Health: `GET :8081/health` → `connections.binance: "disconnected"`
- Health: `GET :8084/health` → `dependencies.binance: "disconnected"`
- Metric: `titan_scavenger_binance_connected == 0`

## Immediate Actions (< 2 minutes)

```bash
# 1. Confirm which exchanges are affected
curl -s localhost:8081/health | jq '.connections'
curl -s localhost:8084/health | jq '.dependencies'

# 2. Check exchange status externally
# Binance: https://www.binance.com/en/support/announcement
# Bybit: https://announcements.bybit.com/

# 3. Check if it's our side (network/credentials)
docker compose -f docker-compose.prod.yml logs --since 2m titan-scavenger 2>&1 | grep -i "websocket\|disconnect\|error"
docker compose -f docker-compose.prod.yml logs --since 2m titan-sentinel 2>&1 | grep -i "websocket\|disconnect\|error"
```

## If Exchange-Side Outage

1. Services should auto-reconnect when exchange recovers
2. Monitor `titan_scavenger_binance_connected` gauge for recovery
3. Verify no stale positions: open positions should be frozen (no new signals)
4. **Do NOT restart services** — reconnect logic handles this

## If Credential/Network Issue

```bash
# Rotate API keys if compromised
# 1. Generate new keys on exchange
# 2. Update .env.prod
# 3. Restart affected services
docker compose -f docker-compose.prod.yml restart titan-scavenger titan-sentinel
```

## Recovery Verification

```bash
curl -s localhost:8081/health | jq '.status'
# Expect: "healthy"
# Verify tick flow resumed:
curl -s localhost:8081/metrics 2>/dev/null | grep "binance_ticks_total"
```

## Escalation

- If recovery fails after 15 minutes, escalate to on-call lead
