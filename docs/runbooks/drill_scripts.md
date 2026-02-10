# Incident Drill Scripts

[← Back to Runbooks](README.md)

> **Prerequisites**: Running docker-compose stack with all services healthy

---

## Drill 1: Exchange Disconnect Storm

**Purpose**: Verify system behavior when all exchange WebSocket connections drop simultaneously.
**Runbook**: [exchange_outage.md](./exchange_outage.md)

```bash
#!/bin/bash
# drill_exchange_disconnect.sh
set -euo pipefail
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="drill_exchange_disconnect_${TIMESTAMP}.log"

echo "=== DRILL: Exchange Disconnect Storm ===" | tee "$LOG"

# 1. Capture baseline health
curl -s localhost:8081/health | tee -a "$LOG"
curl -s localhost:8084/health | tee -a "$LOG"

# 2. Simulate: Docker network disconnect
docker network disconnect titan_default titan-scavenger 2>/dev/null || true
docker network disconnect titan_default titan-sentinel 2>/dev/null || true
sleep 10

# 3. Verify brain detects degradation
curl -s localhost:3100/health | jq '.components' | tee -a "$LOG"

# 4. Verify NO new orders placed
docker compose -f docker-compose.prod.yml logs --since 15s titan-execution 2>&1 | grep -i "fill\|order" | tee -a "$LOG" || echo "No fills (expected)" | tee -a "$LOG"

# 5. Reconnect
docker network connect titan_default titan-scavenger 2>/dev/null || true
docker network connect titan_default titan-sentinel 2>/dev/null || true
sleep 15

# 6. Verify recovery
curl -s localhost:8081/health | tee -a "$LOG"
curl -s localhost:3100/health | jq '.status' | tee -a "$LOG"
echo "=== DRILL COMPLETE ===" | tee -a "$LOG"
```

---

## Drill 2: NATS Interruption

**Purpose**: Verify brain/execution survive NATS restart with no message loss (JetStream replay).
**Runbook**: [nats_outage.md](./nats_outage.md)

```bash
#!/bin/bash
# drill_nats_interruption.sh
set -euo pipefail
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="drill_nats_interruption_${TIMESTAMP}.log"

echo "=== DRILL: NATS Interruption ===" | tee "$LOG"

# 1. Baseline
curl -s localhost:3100/health | jq '.components[] | select(.name=="nats")' | tee -a "$LOG"
curl -s localhost:3002/metrics | grep nats_lag | tee -a "$LOG"

# 2. Kill NATS
docker stop titan-nats | tee -a "$LOG"
sleep 5

# 3. Verify services are still alive (not crashed)
docker ps --format '{{.Names}} {{.Status}}' | grep titan | tee -a "$LOG"

# 4. Restart NATS
docker start titan-nats | tee -a "$LOG"
sleep 15

# 5. Verify reconnection
curl -s localhost:3100/health | jq '.components[] | select(.name=="nats")' | tee -a "$LOG"
curl -s localhost:3002/metrics | grep nats_lag | tee -a "$LOG"
echo "=== DRILL COMPLETE ===" | tee -a "$LOG"
```

---

## Drill 3: Database Restart

**Purpose**: Verify brain handles Postgres restart gracefully and resumes operations.

```bash
#!/bin/bash
# drill_database_restart.sh
set -euo pipefail
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="drill_database_restart_${TIMESTAMP}.log"

echo "=== DRILL: Database Restart ===" | tee "$LOG"

# 1. Baseline
curl -s localhost:3100/health | jq '.components[] | select(.name=="database")' | tee -a "$LOG"

# 2. Restart Postgres
docker restart titan-postgres | tee -a "$LOG"
sleep 5

# 3. Brain health during restart
curl -s localhost:3100/health | jq '.status' | tee -a "$LOG"

# 4. Wait for Postgres ready
for i in $(seq 1 12); do
  docker exec titan-postgres pg_isready 2>/dev/null && break || sleep 5
done

# 5. Verify brain reconnects
sleep 10
curl -s localhost:3100/health | jq '.components[] | select(.name=="database")' | tee -a "$LOG"
echo "=== DRILL COMPLETE ===" | tee -a "$LOG"
```

---

## Drill 4: Kill Switch

**Purpose**: Prove that all trading halts immediately and recovers cleanly.
**Runbook**: [kill_switch.md](./kill_switch.md)

```bash
#!/bin/bash
# drill_kill_switch.sh
set -euo pipefail
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="drill_kill_switch_${TIMESTAMP}.log"

echo "=== DRILL: Kill Switch ===" | tee "$LOG"

# 1. Baseline
curl -s localhost:3100/health | tee -a "$LOG"
curl -s localhost:3002/metrics | grep "filled_orders_total\|active_positions" | tee -a "$LOG"

# 2. Kill signal producers
docker compose -f docker-compose.prod.yml stop titan-scavenger titan-sentinel
sleep 10

# 3. Verify no new intents
docker compose -f docker-compose.prod.yml logs --since 15s titan-execution 2>&1 | grep -ic "intent\|fill" | tee -a "$LOG" || echo "0" | tee -a "$LOG"

# 4. Recovery
docker compose -f docker-compose.prod.yml up -d titan-scavenger titan-sentinel
sleep 15

# 5. Verify full recovery
curl -s localhost:8081/health | jq '.status' | tee -a "$LOG"
curl -s localhost:3100/health | jq '.status' | tee -a "$LOG"
echo "=== DRILL COMPLETE ===" | tee -a "$LOG"
```

---

## Drill Report Template

```markdown
# Drill Report: [Drill Name]

**Date**: YYYY-MM-DD HH:MM UTC
**Operator**: [Name]
**Environment**: [staging / prod]

## Result: PASS / FAIL / PARTIAL

## Timeline
| Time (UTC) | Event |
|:-----------|:------|
| HH:MM:SS | Drill started |
| HH:MM:SS | [Action taken] |
| HH:MM:SS | Drill completed |

## Evidence
- Log file: `drill_*_TIMESTAMP.log`
- Health snapshots: [paste or attach JSON]

## Findings
- [What worked]
- [What didn't work]

## Action Items
- [ ] [Fix needed]
```
