# Policy Change Deployment Runbook

## Overview
This runbook documents the **coordinated rollout procedure** for risk policy changes in the Titan trading system. Policy changes require synchronized deployment across Brain and Execution services to maintain safety invariants.

> [!CAUTION]
> **Never deploy policy changes to only Brain OR only Execution.** This will cause all intents to be rejected due to policy hash mismatch.

---

## Deployment Invariants

1. **Policy Hash Parity**: Brain and Execution MUST have identical `policy_hash` values.
2. **Fail-Closed Handshake**: Brain verifies handshake at leader promotion; fails closed on mismatch.
3. **Execution Armed Gate**: Execution rejects all intents unless explicitly ARMed.

---

## Pre-Deployment Checklist

- [ ] New `risk_policy.json` reviewed and approved
- [ ] Policy hash calculated: `sha256(canonicalize(policy))`
- [ ] Both Brain and Execution images built with new policy
- [ ] Execution is **DISARMed** (safety gate)
- [ ] Operator is prepared to monitor rejection telemetry

---

## Deployment Procedure

### Step 1: DISARM Execution (if not already)
```bash
nats pub titan.cmd.operator.disarm.v1 "Pre-deployment disarm"
```

### Step 2: Deploy Execution Service
1. Deploy new Execution image with updated policy
2. Verify startup logs show new policy hash:
   ```
   [INFO] Loaded RiskPolicy v1.X.X (hash: abc123...)
   ```
3. Verify policy hash responder is active:
   ```bash
   nats req titan.req.exec.policy_hash.v1 "{}"
   # Expected: {"hash":"abc123..."}
   ```

### Step 3: Deploy Brain Service
1. Deploy new Brain image with updated policy
2. Brain will automatically perform policy handshake on leader promotion
3. Verify handshake success in logs:
   ```
   ✅ Policy hash handshake OK. Enabling signal processing. Hash: abc123...
   ```

### Step 4: ARM Execution
```bash
nats pub titan.cmd.operator.arm.v1 "Post-deployment arm"
```

### Step 5: Verify System Health
1. Check for rejection events:
   ```bash
   nats sub "titan.evt.exec.reject.v1"
   # Should be empty after successful deployment
   ```
2. Monitor Prometheus metrics:
   - `titan_execution_rejection_events_total` should not increase
   - `titan_brain_policy_handshake_success_total` should increment

---

## Rollback Procedure

If policy mismatch is detected:

1. **DISARM Execution immediately**:
   ```bash
   nats pub titan.cmd.operator.disarm.v1 "Rollback - policy mismatch"
   ```

2. **Redeploy previous versions** of both services

3. **Re-ARM** after rollback verification

---

## Emergency: Brain Stuck on Handshake Failure

If Brain logs show:
```
🚨 CRITICAL: Policy hash handshake FAILED
```

1. Brain will NOT process signals (fail-closed behavior - this is correct)
2. Investigate policy version mismatch
3. Redeploy with matching policies

---

## Monitoring Checklist

| Metric | Expected | Alert Threshold |
|--------|----------|-----------------|
| `titan_execution_rejection_events_total` | 0 after deploy | >0 in 5min window |
| `titan_brain_leader_promotions_total` | Increments once | N/A |
| `titan_execution_armed_state` | 1 (armed) | 0 (disarmed) > 5min |
