# Titan Database Control Surfaces

**Generated**: 2026-02-05  
**Source**: `services/titan-brain/src/db/schema.sql`

## Configuration & Control Tables

### 1. operators
Operator accounts for RBAC.

| Column | Type | Purpose |
|--------|------|---------|
| operator_id | VARCHAR(50) | Unique identifier |
| hashed_password | VARCHAR(255) | bcrypt hash |
| permissions | JSONB | Permission array |
| last_login | BIGINT | Last login timestamp |

**Used by**: Console login, all admin operations

---

### 2. manual_overrides
Runtime allocation overrides with expiry.

| Column | Type | Purpose |
|--------|------|---------|
| operator_id | VARCHAR(50) | Who created |
| original_allocation | JSONB | Before state |
| override_allocation | JSONB | After state |
| reason | TEXT | Justification |
| active | BOOLEAN | Currently active |
| expires_at | BIGINT | Auto-expire time |
| deactivated_by | VARCHAR(50) | Who deactivated |

**Used by**: AdminController.handleCreateOverride/handleDeactivateOverride

---

### 3. system_state
JSONB state checkpointing for recovery.

| Column | Type | Purpose |
|--------|------|---------|
| state_key | VARCHAR(255) | State identifier |
| state_value | JSONB | Arbitrary state |
| updated_at | TIMESTAMP | Last update |

**Used by**: RecoveryManager, TitanBrain

---

### 4. circuit_breaker_events
Circuit breaker state changes for safety audit.

| Column | Type | Purpose |
|--------|------|---------|
| id | SERIAL | Event ID |
| breaker_type | VARCHAR(50) | Breaker name |
| event_type | VARCHAR(50) | open/close/reset |
| triggered_by | VARCHAR(255) | Trigger source |
| metrics | JSONB | State at trigger |
| timestamp | BIGINT | When it happened |

**Used by**: CircuitBreakerManager

---

### 5. risk_snapshots
Periodic risk state snapshots.

| Column | Type | Purpose |
|--------|------|---------|
| metrics | JSONB | Risk metrics |
| positions | JSONB | Active positions |
| circuit_breaker_state | VARCHAR(50) | Breaker state |

**Used by**: RiskManager, Dashboard

---

## Audit Tables

### 6. brain_decisions
Every signal approval/rejection.

| Column | Type | Purpose |
|--------|------|---------|
| signal_id | VARCHAR(100) | Signal identifier |
| phase_id | VARCHAR(20) | Which phase |
| approved | BOOLEAN | Decision |
| requested_size | DECIMAL | Requested |
| authorized_size | DECIMAL | Authorized |
| reason | TEXT | Justification |
| risk_metrics | JSONB | Risk at decision |

---

### 7. event_log (Partitioned)
Timestamped audit log for all events.

| Column | Type | Purpose |
|--------|------|---------|
| event_type | VARCHAR(100) | Event name |
| event_data | JSONB | Full payload |
| actor | VARCHAR(100) | Who/what |
| timestamp | BIGINT | When |

**Partitioning**: By month for performance

---

### 8. fills (Partitioned)
Trade execution records.

| Column | Type | Purpose |
|--------|------|---------|
| fill_id | VARCHAR(100) | Exchange fill ID |
| signal_id | VARCHAR(100) | Linked signal |
| venue | VARCHAR(50) | Exchange |
| symbol | VARCHAR(50) | Instrument |
| side | VARCHAR(10) | buy/sell |
| size | DECIMAL | Fill size |
| price | DECIMAL | Fill price |
| fee | DECIMAL | Fee paid |
| realized_pnl | DECIMAL | P&L |

**Partitioning**: By month

---

## Ledger Tables

### 9. ledger_accounts
Chart of accounts.

| Column | Type | Purpose |
|--------|------|---------|
| account_code | VARCHAR(20) | Account number |
| account_name | VARCHAR(100) | Display name |
| account_type | VARCHAR(20) | asset/liability/equity/revenue/expense |
| parent_account | VARCHAR(20) | Hierarchy |

---

### 10. ledger_transactions
Double-entry transaction headers.

| Column | Type | Purpose |
|--------|------|---------|
| reference | VARCHAR(100) | External ref |
| description | TEXT | What happened |
| transaction_date | DATE | Accounting date |
| posted_by | VARCHAR(50) | Actor |

---

### 11. ledger_entries
Journal entries (debits/credits).

| Column | Type | Purpose |
|--------|------|---------|
| transaction_id | INT | Links to header |
| account_code | VARCHAR(20) | Which account |
| debit | DECIMAL | Debit amount |
| credit | DECIMAL | Credit amount |

---

## Row Level Security

All tables have RLS enabled:
- `operators` - Self-access only
- `manual_overrides` - Admin role required
- `fills` - Read by owner or admin
- `event_log` - Read by auditor role
