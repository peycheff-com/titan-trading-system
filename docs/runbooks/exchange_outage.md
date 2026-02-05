# Exchange Outage Runbook

## Symptoms
- Market data feeds stop updating
- Order placement fails
- WebSocket connections drop

## Immediate Actions
1. Check exchange status page (Binance, Bybit, etc.)
2. Check Hunter service logs: `docker logs titan-phase2-hunter --tail 100`
3. Verify API credentials are valid

## Recovery
1. If exchange-side: Wait for exchange recovery, services should auto-reconnect
2. If credential issue: Rotate credentials and restart affected service
3. If network issue: Check firewall/proxy settings

## Fallback
- Enable graceful degradation mode if available
- Halt new order placement until connectivity restored
