# Titan Production Launch Checklist

## Pre-Launch (T-1 Day)

- [ ] **Secrets Deployed**
  - `HMAC_SECRET` in secrets manager
  - Exchange API credentials configured
  - Alert channel tokens set (PagerDuty, Telegram)

- [ ] **Drills Passed** (run in staging)

  ```bash
  ./scripts/adversarial_drills.sh
  # All 4 must show PASS
  ```

- [ ] **Posture Loaded**

  ```bash
  source config/postures/constrained_alpha.env
  ```

- [ ] **Alert Test**
  - Send test alert to PagerDuty
  - Verify human received notification

## Launch (T-0)

1. **Boot with Constrained Posture**

   ```bash
   HMAC_SECRET=$SECRET ./scripts/boot_prod_like.sh constrained_alpha
   ```

2. **Verify Health**

   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3002/health
   ```

3. **Confirm DISARMED State**

   ```bash
   curl http://localhost:3000/api/status | jq .armed
   # Should be: false
   ```

4. **ARM When Ready**
   ```bash
   curl -X POST http://localhost:3000/api/arm \
     -H "Content-Type: application/json" \
     -d '{"reason": "Initial launch - operator: <name>"}'
   ```

## Emergency Procedures

### HALT (Stop New Orders)

```bash
curl -X POST http://localhost:3000/api/halt \
  -H "Content-Type: application/json" \
  -d '{"reason": "Emergency halt", "actor_id": "<operator>"}'
```

### FLATTEN (Close All Positions)

```bash
curl -X POST http://localhost:3000/api/flatten \
  -H "Content-Type: application/json" \
  -d '{"reason": "Flatten all", "actor_id": "<operator>"}'
```

### DISARM (Prevent Arming)

```bash
curl -X POST http://localhost:3000/api/disarm \
  -H "Content-Type: application/json" \
  -d '{"reason": "Manual disarm", "actor_id": "<operator>"}'
```

## Constraints in Effect (constrained_alpha)

| Parameter        | Value                     |
| ---------------- | ------------------------- |
| Venue            | Binance only              |
| Symbols          | BTCUSDT, ETHUSDT, SOLUSDT |
| Max Position     | $5,000                    |
| Daily Loss Limit | $500                      |
| Max Leverage     | 2x                        |
| Orders/Min       | 10                        |

## Promotion Criteria

To expand posture, ALL must be true over 100+ trades / 7+ days:

- 0 unsigned commands accepted
- 0 policy hash mismatches
- <1% reconciliation mismatch rate
- > 99% order lifecycle completeness
- 0 circuit breaker trips
- 0 unacked P0 alerts
