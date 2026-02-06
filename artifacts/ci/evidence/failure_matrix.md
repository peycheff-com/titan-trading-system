# CI Failure Matrix - Titan Trading System

**Baseline Date:** 2026-02-06
**Analysis Period:** Last 30 runs on main branch

## Executive Summary

| Category | Count | Severity | Status |
|----------|-------|----------|--------|
| Code Block Validation Script Bug | 1 | CRITICAL | Blocking all CI |
| Deploy workflow cascade failures | Multiple | HIGH | Blocked by CI |
| Security scan | 0 | - | PASSING |
| Rust services | 0 | - | SKIPPED (path-conditional) |
| Node services | 0 | - | SKIPPED (preflight fails first) |

---

## Failure #1: validate-codeblocks.sh Bash Bug

| Field | Value |
|-------|-------|
| **Workflow** | ci.yml |
| **Job** | preflight |
| **Step** | Code Block Validation (step 16) |
| **Error Line** | `##[error]Process completed with exit code 1.` |
| **Category** | Script logic bug |
| **Severity** | CRITICAL - Blocks entire CI pipeline |

### Root Cause

The script `scripts/docs/validate-codeblocks.sh` uses `set -euo pipefail` with a `while IFS= read -r line` loop. Two bugs:

1. **Read exit code:** When `read` encounters EOF without a trailing newline, it returns non-zero even if it read data. With `set -e`, this terminates the script.

2. **Arithmetic context:** `((line_num++))` returns 1 (false) when `line_num` is 0, which with `set -e` causes script termination.

### Evidence

```bash
# From debug trace:
+ IFS=
+ read -r line
+ (( line_num++ ))   # line_num=0 → returns 1 → script exits due to set -e
+ rm -rf $TEMP_DIR   # trap fires
```

### Local Reproduction

```bash
cd /Users/ivan/Code/trading/titan
./scripts/docs/validate-codeblocks.sh
# Exits silently after printing header
```

### Proposed Fix

```bash
# Fix 1: Change arithmetic to avoid false return
line_num=$((line_num + 1))  # Assignment always succeeds

# Fix 2: Handle read EOF properly
while IFS= read -r line || [[ -n "$line" ]]; do
```

### Fix Complexity
**S** (Small) - ~5 line changes in one script

---

## Failure #2: Deploy to Production Cascade

| Field | Value |
|-------|-------|
| **Workflow** | deploy-prod.yml |
| **Job** | ci-check |
| **Condition** | `workflow_run.conclusion == 'success'` |
| **Category** | Cascade failure |
| **Severity** | HIGH - Blocks deployment |

### Root Cause

Deploy workflow triggers on CI workflow_run completion. Since CI never succeeds (blocked by #1), the `ci-check` job's condition fails and deployment never runs.

### Evidence

Multiple runs show conclusion: "failure" triggered by workflow_run events that inherit CI failure state.

### Proposed Fix

Fix Failure #1. No changes needed to deploy-prod.yml.

### Fix Complexity
**N/A** - Resolved by fixing #1

---

## Failure #3: AI Doc Regeneration

| Field | Value |
|-------|-------|
| **Workflow** | ai-doc-regen.yml |
| **Job** | analyze-docs |
| **Step** | Run AI Documentation Analyzer |
| **Category** | Missing API key / Configuration |
| **Severity** | LOW - Non-critical workflow |

### Root Cause

The workflow requires GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY secrets. If none are configured, the analyzer may fail or produce empty output.

### Proposed Fix

1. Add proper error handling in `scripts/docs/ai-doc-updater.js` for missing API keys
2. Consider making this workflow manual-only or adding a secret availability check

### Fix Complexity
**S** (Small)

---

## Non-Failures (Passing or Correctly Skipped)

### Security Scan
- **Status:** PASSING
- NPM audit: clean at high/critical level
- Cargo audit: clean

### Rust Services (titan-execution-rs)
- **Status:** SKIPPED (correct)
- Path-conditional: Only runs when Rust files change
- When triggered: Generally passes

### Node Services
- **Status:** SKIPPED (due to preflight failure)
- When preflight passes: Generally succeeds

---

## Priority Order for Fixes

1. **[CRITICAL]** Fix validate-codeblocks.sh bash bug → Unblocks entire CI
2. **[LOW]** Harden ai-doc-updater.js error handling
3. **[FUTURE]** Apply SOTA 2026 hardening (SHA pinning, permissions, tiered gates)

---

## Local Reproduction Commands

```bash
# Test validate-codeblocks.sh
cd /Users/ivan/Code/trading/titan
./scripts/docs/validate-codeblocks.sh

# Run full preflight locally (approximation)
npm ci
npm run validate:config
./scripts/ci/check_contracts.sh
./scripts/verify-docs.sh
./scripts/docs/validate-codeblocks.sh
```
