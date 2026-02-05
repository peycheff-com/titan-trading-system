# NATS Outage Runbook

## Symptoms
- Services fail to publish/consume messages
- Health checks fail on NATS connectivity
- Logs show "connection refused" or "timeout" errors

## Immediate Actions
1. Check NATS container status: `docker ps | grep nats`
2. Check NATS logs: `docker logs titan-nats --tail 100`
3. Verify network connectivity: `nc -zv localhost 4222`

## Recovery
1. Restart NATS: `docker restart titan-nats`
2. If persistent, check volume health: `docker volume inspect nats_data`
3. Rollback to last known good config if config change caused issue

## Escalation
- If recovery fails after 15 minutes, escalate to on-call lead
