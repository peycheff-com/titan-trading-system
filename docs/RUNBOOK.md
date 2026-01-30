# Titan Operations Runbook

## Emergency Procedures

### 1. Emergency Halt (HARD_HALT)

**When to use:** Security breach, critical bug, unexpected losses, system instability.

```bash
# Via NATS CLI (fastest)
docker exec titan-nats nats pub titan.cmd.sys.halt \
  '{"state":"HARD_HALT","reason":"Emergency stop by operator","timestamp":'$(date +%s)'}'

# Via Console UI
# Navigate to System → Emergency Controls → HARD HALT button
```

### 2. Soft Pause (SOFT_HALT)

**When to use:** Market volatility, scheduled maintenance, minor issues.

```bash
docker exec titan-nats nats pub titan.cmd.sys.halt \
  '{"state":"SOFT_HALT","reason":"Scheduled maintenance","timestamp":'$(date +%s)'}'
```

### 3. Resume Trading (OPEN)

```bash
docker exec titan-nats nats pub titan.cmd.sys.halt \
  '{"state":"OPEN","reason":"Resuming operations","timestamp":'$(date +%s)'}'
```

---

## Rollback Procedures

### Quick Rollback (Same Version)

```bash
./scripts/ops/rollback.sh
```

### Rollback to Specific Version

```bash
./scripts/ops/rollback.sh v1.2.3
```

### Manual Rollback Steps

1. **Stop all trading immediately**
   ```bash
   docker exec titan-nats nats pub titan.cmd.sys.halt '{"state":"HARD_HALT","reason":"Manual rollback"}'
   ```

2. **Stop services in reverse order**
   ```bash
   docker compose -f docker-compose.prod.yml stop \
     titan-phase1-scavenger titan-phase2-hunter titan-phase3-sentinel \
     titan-powerlaw-lab titan-ai-quant

   docker compose -f docker-compose.prod.yml stop titan-execution titan-brain
   ```

3. **Pull previous images (if applicable)**
   ```bash
   export TITAN_VERSION=v1.2.2
   docker compose -f docker-compose.prod.yml pull
   ```

4. **Restart in correct order**
   ```bash
   npm run start:prod
   ```

5. **Verify health**
   ```bash
   curl http://localhost:3100/health
   docker compose -f docker-compose.prod.yml ps
   ```

6. **Resume trading**
   ```bash
   docker exec titan-nats nats pub titan.cmd.sys.halt '{"state":"OPEN","reason":"Rollback complete"}'
   ```

---

## Health Checks

### Service Health Endpoints

| Service | Health URL | Expected |
|---------|-----------|----------|
| Brain | http://localhost:3100/health | `{"status":"ok"}` |
| Console | http://localhost:3000/api/health | `{"status":"ok"}` |

### Infrastructure Health

```bash
# NATS
docker exec titan-nats nats server ping

# Redis
docker exec titan-redis redis-cli ping

# Postgres
docker exec titan-postgres pg_isready -U titan
```

### Check All Services

```bash
./scripts/ops/health_check.sh
```

---

## Escalation Matrix

| Severity | Condition | Action |
|----------|-----------|--------|
| P0 | Unexpected position, fund loss | HARD_HALT + Escalate immediately |
| P1 | System unresponsive | Rollback + Investigate |
| P2 | Performance degradation | SOFT_HALT + Debug |
| P3 | Non-critical errors | Log + Monitor |

---

## Logs & Debugging

### View Service Logs

```bash
# Brain logs
docker logs -f titan-brain --tail 100

# Execution Engine logs
docker logs -f titan-execution --tail 100

# All services
docker compose -f docker-compose.prod.yml logs -f
```

### Search for Errors

```bash
docker logs titan-brain 2>&1 | grep -i error
docker logs titan-execution 2>&1 | grep -i panic
```

---

## Configuration Reload

Risk policy and configuration can be hot-reloaded via NATS:

```bash
# Reload risk policy
docker exec titan-nats nats pub titan.cmd.risk.reload '{}'

# Update specific parameter
docker exec titan-nats nats pub titan.cmd.risk.update \
  '{"maxAccountLeverage": 5.0}'
```

---

*Last Updated: Jan 30, 2026*
