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
   ./scripts/ops/health_check.sh
   ```

3. **Confirm DISARMED State**

   ```bash
   ./scripts/ops/set_trading_mode.sh disarm "Pre-launch safety check" "<operator_id>"
   docker logs titan-brain --tail 100 2>&1 | grep "SYSTEM DISARMED BY OPERATOR"
   ```

4. **ARM When Ready**
   ```bash
   ./scripts/ops/set_trading_mode.sh arm "Initial launch" "<operator_id>"
   ```

## Emergency Procedures

### HALT (Stop New Orders)

```bash
docker exec titan-nats nats pub titan.cmd.sys.halt.v1 \
  '{"state":"HARD_HALT","reason":"Emergency halt","timestamp":'$(date +%s)'}'
```

### FLATTEN (Close All Positions)

```bash
docker exec titan-nats nats pub titan.cmd.risk.flatten \
  '{"reason":"Flatten all","actor_id":"<operator>","timestamp":'$(date +%s)'}'
```

### DISARM (Prevent Arming)

```bash
./scripts/ops/set_trading_mode.sh disarm "Manual disarm" "<operator_id>"
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
