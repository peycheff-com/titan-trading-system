# Titan Remediation & QA Protocol

## 1. Zero Behavior Change Rule for Auto-Fixes
Automated tools (`eslint --fix`, `prettier`, etc.) must **only** be used for:
- Formatting (whitespace, indentation).
- Removing definitely unused imports/variables (verified by `tsc`).
- Syntactic sugar that preserves AST semantics.

**FORBIDDEN Auto-Fixes:**
- Changing control flow (loops to map/reduce).
- Modifying logic inside Risk Gates or Order Lifecycle.
- Reordering side-effecting calls.

## 2. Behavioral Diff Requirement
Any Pull Request touching the following areas must include a "Behavioral Diff" section in the description:
- **Risk Gates**: `services/titan-brain/src/risk/**/*.ts`
- **Order Lifecycle**: `services/titan-brain/src/orders/**/*.ts`
- **Reconciliation**: `services/titan-brain/src/recon/**/*.ts`
- **Allocations**: `services/titan-execution-rs/**/*.rs`

**Example:**
> **Behavioral Diff**:
> - Previous: Rejected orders with price <= 0.
> - New: Rejects orders with price <= 0 OR quantity <= 0.
> - Invariant: Price and Quantity must both be positive.

## 3. SOTA Release Criteria
A release candidate is accepted ONLY IF:
1. `npm run sota:all` passes (Exit Code 0).
2. No new High/Critical vulnerabilities in `sota:deps` / `sota:audit`.
3. `sota:perf` confirms no regression > 5% in latency.
4. `sota:correctness` passes (Idempotency and Contract checks).

## 4. Emergency Override
If a gate must be bypassed for a hotfix:
1. Open an issue titled `[QA-OVERRIDE] <Reason>`.
2. Commit with trailer `Qa-Override: #issue-id`.
3. Schedule immediate tech-debt task to fix the gate.
