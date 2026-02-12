# M04 Performance & Cost

## 1. Performance Budgets
- **Tick Latency**: < 50ms (Processing time for `onTick`)
- **Signal-to-Order Latency**: < 100ms
- **Memory Footprint**: < 256MB (Node.js heap)

## 2. Cost Analysis
- **Exchange Fees**:
    - Taker: 0.05% (5bps)
    - Maker: 0.02% (2bps)
    - *Impact*: Basis Scalp must capture > 10bps gross to be profitable.
- **Compute**:
    - Runs on micro-instance. Low cost.
- **Data**:
    - NATS traffic volume: Low (1 tick/sec).

## 3. Bottlenecks
- **Synchronous Logic**: `onTick` is async but sequential.
- **Garbage Collection**: Node.js GC pauses could violate < 50ms budget during high load.
