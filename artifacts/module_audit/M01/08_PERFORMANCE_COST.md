# M01 — Performance & Cost

## Latency
- **Budget**: < 100ms processing time per signal.
- **Total E2E**: < 1000ms (includes network).
- **Monitoring**: `handleFillLatency` tracks RTT. > 1000ms triggers warning.

## Resource Usage
- **Memory**: Moderate (caches price history, correlation matrix).
- **CPU**: Low/Burst (crypto hashing, correlation calc).
- **Network**: Low (NATS/HTTP), bursty on market events.

## Cost Controls
- **Slipapge**: `BudgetService` enforces max slippage (50bps).
- **Reject Rate**: High reject rate triggers circuit breaker (prevent spamming execution).
