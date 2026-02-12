# M03 — Invariants

> Cross-reference system invariants I-01 through I-20.

## Control Loop (Cybernetics Lens)

### Essential Variables
- **Market Structure**: Alignment of H4, H1, M15 timeframes.
- **Session State**: Asian/London/NY session profile.

### Actuators
- `SignalClient.sendPrepare/Confirm`: Execution triggers.

### Regulator Policy
- `HologramScanner`: 5-minute sync.
- `InstitutionalFlowClassifier`: Volume/CVD confirmation.

## Module Invariants

| # | Invariant | System ID | Enforcement | Test | Evidence |
|---|-----------|-----------|-------------|------|----------|
| 1 | Signal requires Brain Confirmation via NATS | I-05 | `HunterApplication::forwardSignalToExecution` | Integration | `src/index.ts` L736 |
| 2 | Hologram Scan Interval = 5m | I-XX | `HunterApplication::startHologramScanCycle` | Runtime | `src/index.ts` L76 |
| 3 | CVD updates require Top 5 Holograms | I-XX | `HunterApplication::updateCVDSubscriptions` | Runtime | `src/index.ts` L551 |
| 4 | Budget Updates Resizes Position | I-18 | `nats.subscribe(EVT_BUDGET_UPDATE)` | Integration | `src/index.ts` L332 |
