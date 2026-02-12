# M04 Observability

## 1. Metrics
- **Business Metrics**:
    - `sentinel.pnl.realized`: Counter
    - `sentinel.pnl.unrealized`: Gauge
    - `sentinel.positions.count`: Gauge
    - `sentinel.basis.spread`: Gauge
    - `sentinel.volume.24h`: Counter

- **System Metrics**:
    - `sentinel.latency.tick`: Histogram
    - `sentinel.memory.heap`: Gauge
    - `sentinel.errors.count`: Counter

## 2. Logs
- **Current State**: Mixed use of `console.log` and `EventEmitter`.
- **Target State**: `TitanLogger` structured JSON logs.
    - `level`: INFO, WARN, ERROR
    - `component`: SentinelCore, RiskManager, etc.
    - `traceId`: NATS Message ID or Signal ID

## 3. Alerts
- **High Priority**:
    - `CRIT_RISK_BREACH`: Risk limits exceeded.
    - `CRIT_NATS_DISCONNECT`: System detached from nervous system.
    - `CRIT_MARGIN_CALL`: Exchange margin call imminent.

- **Medium Priority**:
    - `WARN_DATA_LAG`: Market data > 100ms old.
    - `WARN_EXECUTION_SLOW`: Order fill > 1s.
