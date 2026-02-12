# M12 — Remediation Plan

> **Status**: **RESOLVED**
> **Gate**: **A**

## 1. Findings & Resolutions

| # | Finding | Impact | Fix Policy | Proposed Change | Status | Gate |
|---|---------|--------|------------|-----------------|--------|------|
| 1 | MVP Auth (Plaintext validation) | Med | F2 | Accept for internal MVP. Plan migration to KeySet auth (Gateway). | ✅ Accepted | A |
| 2 | Static Roles (`admin` only) | Low | F2 | Accept for single-user system. | ✅ Accepted | A |

## 2. Verification

- **Tests**: Health check passes.
- **Auth**: JWT validation functional.
