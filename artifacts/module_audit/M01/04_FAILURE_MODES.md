# M01 — Failure Modes

## Critical Failures
| Failure | Detection | Mitigation | Recovery |
| ------- | --------- | ---------- | -------- |
| **NATS Disconnect** | Heartbeat miss / Connection error | Pause Signal Processing | Auto-reconnect + State Sync |
| **DB Outage** | Health Check probe | Switch to Memory-Only mode (limited) or Halt | Restart Service when DB up |
| **Drift Detected** | Reconciliation Service | Trip Circuit Breaker (`CRITICAL` drift) | Manual Intervention / Reconcile |
| **Execution Layer Down** | HTTP/NATS Timeout | Queue Signals (Short-term) -> Reject | Retry w/ Backoff |
| **Policy Mismatch** | Hash Handshake | Fail Closed (Refuse to start) | Redeploy Execution/Brain |

## Degraded Modes
- **High Latency**: If E2E latency > 500ms, reject signals or penalize size.
- **Data Gap**: If Market Data is stale, switch to `DEFENSIVE` risk state.
- **Redis Down**: Fallback to `InMemorySignalQueue` (loss of persistence on crash).

## Circuit Breaker Triggers
- **Equity Drawdown**: > 10% daily drawdown -> Soft Pause.
- **Consecutive Losses**: > N losses in window -> Analysis Mode.
- **Abnormal Activity**: High signal rate (> limit) -> Rate Limit/Reject.
