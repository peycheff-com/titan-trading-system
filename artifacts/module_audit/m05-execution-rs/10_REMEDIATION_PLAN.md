# M05 — Remediation Plan

> **Status**: **RESOLVED**
> **Gate**: **A**

## 1. Findings & Resolutions

| # | Finding | Impact | Fix Policy | Proposed Change | Status | Gate |
|---|---------|--------|------------|-----------------|--------|------|
| 1 | Exchange Adapter Tests are Mocked | Med | F0 | Accept as standard for Unit Tests. Integration tests cover real I/O. | ✅ Accepted | A |
| 2 | `unwrap()` used in some init logic | Low | F0 | Validate config before unwrap to ensure fail-fast at startup. | ✅ Verified | A |

## 2. Verification

- **Tests**: `cargo test` passes >40 tests.
- **Safety**: Risk checks enforced in `RiskGuard`.
