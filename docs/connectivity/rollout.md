# Titan Connectivity Layer - Rollout Plan

## Rollout Strategy

**Approach**: Canary deployment with feature flags

---

## Phase 1: Shadow Mode (Current)

| Setting | Value |
|---------|-------|
| `VENUES_STATUS_SOURCE` | `simulated` |
| Hunter publishes | ✅ |
| Brain consumes | ✅ (logs only) |

**Duration**: 1 week monitoring

---

## Phase 2: Canary (10%)

```bash
VENUES_STATUS_SOURCE=live_canary
```

- 10% of `/venues` requests use live data
- Compare latency and error rates

---

## Phase 3: Full Rollout

```bash
VENUES_STATUS_SOURCE=live
```

- All requests use live telemetry
- Remove simulated data fallback

---

## Rollback Procedure

```bash
# Immediate rollback
export VENUES_STATUS_SOURCE=simulated

# Restart Brain
systemctl restart titan-brain
```

---

## Metrics to Monitor

| Metric | Alert Threshold |
|--------|-----------------|
| `brain_venues_connected` | < 2 for 5 min |
| `brain_venue_stale` | > 0 for 2 min |
| `/venues/summary` latency | > 500 ms p99 |
