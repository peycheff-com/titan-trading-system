# Runbook: Event Bus Backlog (Slow Consumers)

**Severity:** High (Performance Degradation)
**Symptoms:**
- Execution latency spikes (> 500ms).
- Log warnings: `Slow Consumer Detected`.
- Memory usage increasing on `titan-nats`.

## 1. Diagnosis
Identify the lagging consumer:

```bash
# List streams and consumers
docker exec titan-nats nats stream list
docker exec titan-nats nats consumer list TITAN_EXECUTION
```

*Look for `NumPending > 1000`.*

## 2. Mitigation Strategies

### Scenario A: Database Write Bottleneck (Execution)
If `titan-execution` is lagging because PersistToRedb is slow:
1. **Shed Load:** Stop new orders via Brain.
   ```bash
   curl -X POST http://localhost:3100/admin/system/mode/cautious
   ```
2. **Increase Resources:** (Requires restart)
   Bump `titan-execution` CPU limit in `docker-compose.prod.yml`.

### Scenario B: Zombie Consumer
If a consumer ID exists but service is dead/restarted (Ephemeral consumer leak):
1. **Prune Consumers:**
   ```bash
   docker exec titan-nats nats consumer report TITAN_EXECUTION
   # Identify ID with High Pending and No Activity
   docker exec titan-nats nats consumer rm TITAN_EXECUTION <CONSUMER_NAME>
   ```

## 3. Emergency Flush (Data Loss Risk)
If system is halted due to full stream (1GB limit hit):

> [!WARNING]
> This will delete historical trade events. Accounting may drift.

```bash
docker exec titan-nats nats stream purge TITAN_EXECUTION
```
*Post-action:* Must run full accounting reconciliation.
