# M08P — Invariants

> Cross-reference system invariants I-01 through I-20.

## Control Loop (Cybernetics Lens)

### Essential Variables
- **Alpha (Tail Index)**: Must be updated on every X trades.
- **Volatility Cluster**: Must detect regime shift.

### Actuators
- `Estimator.emit()`: NATS update.

### Regulator Policy
- `HillEstimator`: Standard method for tail index.

## Module Invariants

| # | Invariant | System ID | Enforcement | Test | Evidence |
|---|-----------|-----------|-------------|------|----------|
| 1 | Hill Estimator requires >20 samples | I-XX | `HillEstimator.ts:18` | Unit Test | `if (absReturns.length < 20) return alpha: 0` |
| 2 | Volatility State defined by Autocorrelation | I-XX | `VolClusterDetector.ts:39` | Unit Test | `avgPersistence > 0.4 ? 'expanding'` |
| 3 | NATS subscription is non-blocking | I-XX | `service.ts:55` | Code Review | `.catch((err) => console.error(...))` |
