# TLA+ Formal Specifications

Formal verification specifications for the Titan Trading System using TLA+ (Temporal Logic of Actions).

## Specifications

### [`OrderLifecycle.tla`](./OrderLifecycle.tla)

Models the order state machine with safety properties:

- **No Double-Spend**: Orders cannot be filled beyond their maximum amount
- **Halt Enforcement**: No order processing during global halt
- **Terminal State Finality**: Terminal states (FILLED, CANCELLED, REJECTED, EXPIRED) cannot transition
- **Valid Transitions Only**: State machine follows defined transition graph

**State Machine:**
```
PENDING → OPEN → PARTIALLY_FILLED → FILLED
    ↓       ↓           ↓
 REJECTED  EXPIRED    CANCELLED
```

### [`RiskPolicy.tla`](./RiskPolicy.tla)

Models risk policy enforcement with breaker conditions:

- **Position Limits**: Positions never exceed capital * MaxPositionPct
- **Leverage Limits**: Leverage never exceeds MaxLeverage
- **Drawdown Breaker**: Circuit breaker trips when drawdown > MaxDrawdownPct
- **Daily Loss Breaker**: Circuit breaker trips when daily loss > MaxDailyLossPct

**Breaker Hierarchy:**
```
DRAWDOWN > DAILY_LOSS > POSITION_LIMIT > LEVERAGE
```

## Running Model Checker

Install TLA+ Toolbox or use command-line TLC:

```bash
# Check OrderLifecycle with small model
tlc OrderLifecycle.tla -config order.cfg

# Check RiskPolicy with small model
tlc RiskPolicy.tla -config risk.cfg
```

### Model Configurations

Create `order.cfg`:
```
CONSTANTS
    Orders = {o1, o2, o3}
    MaxFillAmount = 100
    MaxHaltTime = 10

SPECIFICATION Spec

INVARIANTS
    TypeInvariant
    NoDoubleFill

PROPERTIES
    TerminalStateIsFinal
```

Create `risk.cfg`:
```
CONSTANTS
    MaxCapital = 10000
    MaxPositionPct = 50
    MaxDrawdownPct = 20
    MaxDailyLossPct = 10
    MaxLeverage = 5

SPECIFICATION Spec

INVARIANTS
    TypeInvariant
    SafetyInvariant
    DrawdownBreakerCorrect
    DailyLossBreakerCorrect
```

## CI Integration

The specifications can be verified in CI using:

```yaml
# .github/workflows/tla-verify.yml
name: TLA+ Verification
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker://toolbox/tla:latest
        with:
          args: tlc -workers auto docs/specs/tla/OrderLifecycle.tla
```

## Related Code

| Spec | Implementation |
|------|---------------|
| OrderLifecycle | `titan-execution-rs/src/order_manager.rs`, `titan-execution-rs/src/engine/state_machine.rs` |
| RiskPolicy | `titan-brain/src/features/Risk/RiskGuardian.ts`, `@titan/shared/src/schemas/RiskPolicy.ts` |

## References

- [TLA+ Home](https://lamport.azurewebsites.net/tla/tla.html)
- [Learn TLA+](https://learntla.com/)
- [Amazon's Use of TLA+](https://lamport.azurewebsites.net/tla/amazon.html)
