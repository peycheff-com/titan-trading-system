# M11 — Remediation Plan

> **Status**: **RESOLVED**
> **Gate**: **A**

## 1. Findings & Resolutions

| # | Finding | Impact | Fix Policy | Proposed Change | Status | Gate |
|---|---------|--------|------------|-----------------|--------|------|
| 1 | Hardcoded API URL | Low | F0 | Moved to `VITE_API_URL` env var. | ✅ Done | A |
| 2 | Missing lint rules for React hooks | Low | F0 | Added `eslint-plugin-react-hooks`. | ✅ Done | A |

## 2. Verification

- **Build**: `vite build` passes.
- **Lint**: Clean.
