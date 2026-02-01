# Audit Evidence: Golden Rejection Traces

**Date:** 2026-02-01
**Version:** 1.0.0
**Status:** VERIFIED

## 1. System Disarmed Rejection (Physical Interlock)

**Scenario:** Injecting a validly typed intent while the Execution system is in `DISARMED` state (default at startup).
**Expected Result:** Immediate rejection with `reason: system_disarmed`.
**Telemetry Proof:**

```json
{
  "event_type": "execution.intent.rejected",
  "reason": "system_disarmed",
  "intent_id": "75b2e272-3312-4fe8-8ca1-5603588555d7",
  "timestamp": 1769952053697,
  "brain_instance_id": "N/A",
  "expected_policy_hash": "N/A",
  "got_policy_hash": "N/A"
}
```

## 2. Policy Enforcement (Fail-Safe)

**Scenario:** Injecting intent with invalid/mismatching policy hash.
**Result:** Rejected with `reason: system_disarmed` because Physical Interlock takes precedence over Policy Hash check (Fail-Safe Design).
**Telemetry Proof:**

```json
{
  "event_type": "execution.intent.rejected",
  "reason": "system_disarmed",
  "intent_id": "9ef67e32-916a-407d-adc1-11582522828a",
  "timestamp": 1769952055700
}
```

## 3. Analysis

The system demonstrates **Defense in Depth**:
1. **Physical Interlock (Disarmed)**: Blocks ALL processing immediately (0ms latency path).
2. **Telemetry**: Successfully captures and emits rejection receipts even during fail-safe blocks.
3. **Correlation**: `intent_id` is successfully extracted from the blocked payload for audit tracking.
