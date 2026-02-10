# Data Layer Audit Report - Jan 2026

## Executive Summary
This audit reviewed the Data Layer of `titan-brain` (Phase 4) with a focus on Idempotency, Transaction Boundaries, and Event Pattern correctness. The audit confirms that the *Persistence Layer* (`Repositories`) is robust and idempotent, but the *Service Layer* (`AccountingService`) has a potential partial-failure scenario that requires attention.

## Findings

### 1. Idempotency (PASSED)
**Verification**:
- `FillsRepository` implemented `ON CONFLICT (fill_id) DO UPDATE/NOTHING`.
- Verified via Unit Test `tests/unit/db/FillsRepository.test.ts`.
- `LedgerRepository` verifies `transactionExists(fillId)` before posting.
- Unique Index `idx_fills_fill_id` (implied by PRIMARY KEY) ensures DB level uniqueness.

**Status**: ✅ **Verified**

### 2. Event Patterns (PASSED)
**Verification**:
- No usage of `NOTIFY` / `LISTEN` found in the codebase.
- The system correctly uses NATS for event propagation (`titan.evt.execution.fill.v1`).
- "Postgres as Event Bus" anti-pattern is **ABSENT**.

**Status**: ✅ **Verified**

### 3. Transaction Boundaries (PARTIAL FAILURE)
**Observation**:
In `AccountingService.ts`, the `processFill` method performs two distinct database operations:
1. `this.fillsRepository.createFill(fill)` (Transaction A)
2. `this.ledgerRepository.createTransaction(txParams)` (Transaction B)

**Risk**:
These operations are **not atomic**.
- If (1) succeeds and (2) fails (e.g., DB glitch, invalid balance), the Fill is recorded but the General Ledger entry is missing.
- The `processFill` method catches exceptions and logs them (`logger.error`), which effectively acknowledges the NATS message (if auto-ack is on), preventing redelivery.

**Severity**: **Medium** (Data Inconsistency Risk)
- **Mitigation**: The system is Idempotent, so *replaying* the event fixes the state.
- **Recommendation**:
    1. Wrap both calls in a single `db.transaction(...)` block.
    2. OR Ensure NATS manual acknowledgement is used, and NACK on failure.

**Status**: ⚠️ **Remediation Required**

## Recommendations
1. **Refactor `AccountingService.processFill`**:
   - Use `db.transaction()` to ensure atomicity of Fill Persistence + Ledger Posting.
   - Requires exposing a `transaction` method on `DatabaseManager` that allows passing checks to Repositories, OR passing the `client` to existing methods.
   - Refactor Repositories to accept an optional `client` or `transactionContext`.

2. **Error Handling**:
   - Ensure `AccountingService` does **not** catch critical persistence errors if it cannot recover, allowing NATS to redeliver (if configured for manual ACKs), or implement a Dead Letter Queue (DLQ) push.

## Conclusion
The Data Layer foundations are solid. addressing the Transaction Boundary in `AccountingService` will close the final gap in data integrity.
