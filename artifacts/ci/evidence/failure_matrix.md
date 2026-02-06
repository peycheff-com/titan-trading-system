# CI Failure Matrix - Titan Trading System

**Baseline Date:** 2026-02-06
**Analysis Period:** Run 21762878391 (CI) & 21763122136 (Deploy)

## Executive Summary

| Category | Count | Severity | Status |
|----------|-------|----------|--------|
| Lint / Config | 1 | CRITICAL | Blocking CI (node-services) |
| Cascade | 1 | HIGH | Blocking Deploy |

---

## Failure #1: Lint Parsing Error & Style Violations

| Field | Value |
|-------|-------|
| **Workflow** | ci.yml |
| **Job** | node-services (Job 62791371017) |
| **Step** | Turbo Build & Test (npm run lint) |
| **Error** | `Parsing error: "parserOptions.project" has been provided... The file was not found... src/utils/symbol-normalization.d.ts` |
| **Error Details** | 303 problems (36 errors, 267 warnings). Many `no-let` style violations. |
| **Category** | Lint / TypeScript Config |
| **Severity** | CRITICAL - Fails `node-services` |

### Root Cause

1. **Parsing Error:** `src/utils/symbol-normalization.d.ts` exists but is likely not included in the `tsconfig.json` referenced by ESLint, causing `@typescript-eslint/parser` to fail.
2. **Style Violations:** Strict functional rules (`functional/no-let`) are enabled but code violates them (likely recent changes or strictness increase).

### Evidence

```
0:0  error  Parsing error: "parserOptions.project" has been provided for @typescript-eslint/parser.
The file was not found in any of the provided project(s): src/utils/symbol-normalization.d.ts
...
✖ 303 problems (36 errors, 267 warnings)
```

### Local Reproduction

```bash
cd packages/shared
npm run lint
```

### Proposed Fix

1. Add `src/utils/symbol-normalization.d.ts` to `tsconfig.json` includes.
2. Run `eslint --fix` to resolve standard violations.
3. Manually fix remaining errors.

---

## Failure #2: Deploy to Production Cascade

| Field | Value |
|-------|-------|
| **Workflow** | deploy-prod.yml |
| **Job** | ci-check |
| **Condition** | `workflow_run.conclusion == 'success'` |
| **Category** | Configuration / Logic |
| **Severity** | HIGH - Blocks deployment |

### Root Cause

CI workflow failed (due to #1), so `workflow_run.conclusion` was 'failure'. This is working as intended (safety), but blocks deployment.

### Fix
Fix Failure #1.

---
