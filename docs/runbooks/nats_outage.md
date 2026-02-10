# NATS Partition Recovery Runbook

[← Back to Runbooks](README.md)

> **Scope**: NATS JetStream partition, split-brain, or message loss recovery
> **Critical**: Brain and Execution communicate exclusively via NATS

## Detection

- Health: `GET :3100/health` → NATS component `unhealthy`
- Metric: `nats_lag_messages` spike
- Metric: `nats_storage_pressure_bytes` near limit
- Logs: `"connection refused"`, `"timeout"`, `"no responders"` in brain/execution

## Immediate Actions

```bash
# 1. Check NATS container
docker ps | grep nats
docker logs titan-nats --tail 50

# 2. Check NATS cluster health
curl -s http://localhost:8222/healthz | jq .
docker exec titan-nats nats stream ls
docker exec titan-nats nats stream info TITAN_INTENTS 2>/dev/null
docker exec titan-nats nats consumer ls TITAN_INTENTS 2>/dev/null

# 3. Check consumer lag
docker exec titan-nats nats consumer info TITAN_INTENTS execution-consumer 2>/dev/null
```

## If NATS Container Down

```bash
# 1. Restart NATS (data persisted in JetStream volumes)
docker compose -f docker-compose.prod.yml restart titan-nats

# 2. Wait for reconnection (services have retry logic)
sleep 15

# 3. Verify all services reconnected
curl -s localhost:3100/health | jq '.components[] | select(.name=="nats")'
curl -s localhost:8081/health | jq '.connections'
```

## If Stream Corrupted

```bash
# 1. Stop producers/consumers
docker compose -f docker-compose.prod.yml stop titan-brain titan-execution titan-scavenger titan-sentinel

# 2. Purge and recreate stream
docker exec titan-nats nats stream purge TITAN_INTENTS --force

# 3. Restart all services (they will re-establish from current state)
docker compose -f docker-compose.prod.yml up -d

# 4. Verify stream is operational
docker exec titan-nats nats stream ls
```

## If Storage Pressure

```bash
# Check storage usage
docker exec titan-nats nats stream info TITAN_INTENTS | grep -i "storage\|bytes\|messages"

# If at limit, purge old messages
docker exec titan-nats nats stream purge TITAN_INTENTS --keep 1000 --force
```

## Recovery Verification

```bash
# Verify NATS metrics are flowing
curl -s localhost:3002/metrics | grep nats_lag
curl -s localhost:3100/health | jq '.components[] | select(.name=="nats")'
# Expect: status = "healthy"
```

## Escalation

- If recovery fails after 15 minutes, escalate to on-call lead
