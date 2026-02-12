# M04 — Remediation Plan

> **Status**: **RESOLVED**
> **Gate**: **A**

## 1. Findings & Resolutions

| # | Finding | Impact | Fix Policy | Proposed Change | Status | Gate |
|---|---------|--------|------------|-----------------|--------|------|
| 1 | Hardcoded NATS subjects | High | F0 | Use `TITAN_SUBJECTS` from `@titan/shared` | ✅ Done | A |
| 2 | Lint violations (unused vars) | Low | F0 | Fix all ESLint errors | ✅ Done | A |
| 3 | Mocked `PortfolioManager` | Med | F1 | Connect to real `gateway.getBalance()` | ✅ Done | A |
| 4 | `VacuumMonitor` hardcoded threshold | Low | F2 | Move to config env var | Deferred | B |
| 5 | `PerformanceTracker` simplified PnL | Low | F2 | Enhance with fee modeling | Deferred | B |

## 2. Verification

- **Lint Check**: `npm run lint` passes with 0 errors.
- **Integration**: NATS wiring verified in `01_REALITY.md`.
