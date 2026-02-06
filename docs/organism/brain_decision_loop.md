# The Brain Decision Loop

> **Status**: Canonical
> **Model**: Active Inference

## 1. The Loop

The Brain runs a continuous event-driven loop. It does not "poll"; it reacts.

### Phase 1: Sensing (Input)
Brain subscribes to `titan.evt.phase.*.signal`.
- **Input**: `IntentEnvelope<SignalPayload>`
- **Validation**:
  - Is the `ts` fresh? (< 5s)
  - Is the `source` authorized?
  - Is `risk_score` within bounds?

### Phase 2: Perception (State Update)
Brain updates its internal "Belief State" (`MarketRegime`).
- **Volatility Check**: High vol? Shrink allocations.
- **Budget Check**: Do we have free capital in the `allocation_history`?

### Phase 3: Action Selection (Policy)
If the signal is **Accepted**:
1.  **Position Sizing**: Applies Kelly Criterion (modified by volatility).
2.  **Constraints**: Checks specific `risk_policy.json` limits (e.g., Max Open Orders).
3.  **Signing**:
    - Generates `titan.cmd.execution.place.v1` payload.
    - Signs payload with `HMAC_SECRET`.

### Phase 4: Actuation (Output)
Brain publishes the command to NATS. It then spawns a "Pending Expectation":
- *Expectation*: "I expect a Fill Event within 2 seconds."
- *Timeout*: If no fill arrives, log `TIMEOUT` and check system health.

## 2. Allocation Logic

Brain allocates capital based on specific "Buckets".
- **Trap Bucket**: For Scavenger. Small, fast turnover.
- **Trend Bucket**: For Hunter. Large, slow turnover.
- **Arb Bucket**: For Sentinel. High capacity.

**Invariant**: `Sum(Allocations) <= TotalEquity`. Brain never allows leverage to exceed global caps (10x).
