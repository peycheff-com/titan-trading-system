# Runbook: Truth Confidence Collapse

[← Back to Operations](../README.md)


**Severity:** Critical (Emergency)
**Symptoms:**

- System enters `DEFENSIVE` or `HALTED` mode.
- Log error: `Truth Confidence < 0.5`.
- Grafana Alert: `TruthLayerConfidenceLow`.

## 1. Immediate Action

1. **ACK the Alert:** Signal to team that investigation is underway.
2. **Verify Status:**

    ```bash
    curl -s http://localhost:3100/status | jq .mode
    # Expected: "DEFENSIVE" or "EMERGENCY"
    ```

## 2. Diagnosis

Check `titan-brain` logs for the specific confidence detractor:

```bash
docker logs titan-brain --tail 100 | grep "Confidence"
```

### Scenario A: Staleness (Data too old)

*Cause:* `titan-ai-quant` or `titan-scavenger` not publishing budget updates.
*Fix:*

1. Restart upstream services:

   ```bash
   docker restart titan-ai-quant
   ```

2. Verify NATS flow:

   ```bash
   nats sub -s nats:4222 "titan.ai.budget.>"
   ```

### Scenario B: Deviation (Equity Mismatch)

*Cause:* Calculated Equity != Exchange Equity > 5% threshold.
*Fix:*

1. Check Exchange Balances (Binance/Bybit).
2. Check internal accounting in `titan-brain` DB.
3. If Exchange is correct, force-sync accounting:

   ```bash
   # DANGEROUS: Only run if you trust Exchange over Internal
   curl -X POST http://localhost:3100/admin/accounting/sync -H "Authorization: Bearer <ADMIN_TOKEN>"
   ```

## 3. Resolution

Once confidence restored (> 0.8):

1. System should auto-recover to `NORMAL` or `CAUTIOUS`.
2. If stuck in Defensive:

   ```bash
   curl -X POST http://localhost:3100/admin/system/reset-circuit-breaker
   ```
