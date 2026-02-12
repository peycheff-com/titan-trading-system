# M01 — Tests

## Strategy
- **Unit Tests**: `npm run test:unit`
    - Covers: `AllocationEngine`, `RiskGuardian`, `CircuitBreaker`, `SignalProcessor`
- **Integration Tests**: `npm run test:integration`
    - Covers: `TitanBrain` startup, NATS messaging, DB interaction
- **E2E Tests**: Manual/Scripted via `task:reconcile` or `scripts/simulate_signal.ts`

## Coverage
- **Core Logic**: High (~80% estim.)
- **Error Handling**: Moderate
- **State Recovery**: Tested via `StateRecoveryService` tests.

## Critical Test Cases
1. **Startup Failure**: Ensure Brain dies if DB/NATS missing.
2. **Circuit Breaker Trip**: Simulate 10% drop, verify signal rejection.
3. **Correlation Reject**: Send highly correlated signals, verify rejection.
4. **Leader Election**: Verify takeover/handover logic.
