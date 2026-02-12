# M04 Failure Modes

## 1. Market Failures
- **FM-001: Liquidity Evaporation**
    - **Trigger**: Spread > 5bps or Orderbook Depth < $50k
    - **Detection**: `VacuumMonitor.checkLiquidityHealth` returns false.
    - **Mitigation**: Switch to `VOLATILE` regime, halt new entries, aggressive unwind if existing positions danger.

- **FM-002: Extreme Volatility / Crash**
    - **Trigger**: System Regime = `CRASH`
    - **Detection**: `SentinelCore` receives `CRASH` regime from NATS.
    - **Mitigation**: Stop all buying. Unwind all positions if spread allows.

## 2. System Failures
- **FM-003: NATS Disconnection**
    - **Trigger**: `NatsClient` connectivity loss.
    - **Detection**: Heartbeat failure or connection error event.
    - **Mitigation**: `HealthServer` reports unhealthy. Run in "Zombie" mode (manage existing, no new trades) or panic exit?
    - **Policy**: M04 defaults to "Close Only" mode on comms loss.

- **FM-004: Execution Lag**
    - **Trigger**: `Order.fill` takes > 1s
    - **Detection**: `ExecutionMonitor` (not yet fully implemented in core, relying on timeouts)
    - **Mitigation**: Mark exchange as "degraded".

## 3. Data Failures
- **FM-005: Stale Pricing**
    - **Trigger**: `PriceMonitor` sees timestamp > 100ms old.
    - **Detection**: `onTick` validation.
    - **Mitigation**: Skip tick. If persistent > 5s, trigger `CRIT_DATA_LOSS` alert.
