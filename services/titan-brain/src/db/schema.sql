-- Titan Brain Database Schema
-- PostgreSQL schema for the Brain orchestrator

-- Allocation history
CREATE TABLE IF NOT EXISTS allocation_history (
  id SERIAL PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  equity DECIMAL(18, 2) NOT NULL,
  w1 DECIMAL(5, 4) NOT NULL,
  w2 DECIMAL(5, 4) NOT NULL,
  w3 DECIMAL(5, 4) NOT NULL,
  tier VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_allocation_timestamp ON allocation_history(timestamp DESC);

-- Phase performance (trade records)
CREATE TABLE IF NOT EXISTS phase_trades (
  id SERIAL PRIMARY KEY,
  phase_id VARCHAR(20) NOT NULL,
  timestamp BIGINT NOT NULL,
  pnl DECIMAL(18, 2) NOT NULL,
  symbol VARCHAR(20),
  side VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_phase_trades_phase_timestamp ON phase_trades(phase_id, timestamp DESC);

-- Phase performance metrics (aggregated)
CREATE TABLE IF NOT EXISTS phase_performance (
  id SERIAL PRIMARY KEY,
  phase_id VARCHAR(20) NOT NULL,
  timestamp BIGINT NOT NULL,
  pnl DECIMAL(18, 2) NOT NULL,
  trade_count INTEGER NOT NULL,
  sharpe_ratio DECIMAL(10, 4),
  modifier DECIMAL(5, 2) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_phase_performance_phase_timestamp ON phase_performance(phase_id, timestamp DESC);

-- Brain decisions
CREATE TABLE IF NOT EXISTS brain_decisions (
  id SERIAL PRIMARY KEY,
  signal_id VARCHAR(100) NOT NULL UNIQUE,
  phase_id VARCHAR(20) NOT NULL,
  timestamp BIGINT NOT NULL,
  approved BOOLEAN NOT NULL,
  requested_size DECIMAL(18, 2) NOT NULL,
  authorized_size DECIMAL(18, 2),
  reason TEXT NOT NULL,
  risk_metrics JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_brain_decisions_timestamp ON brain_decisions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_brain_decisions_phase ON brain_decisions(phase_id, timestamp DESC);

-- Treasury operations
CREATE TABLE IF NOT EXISTS treasury_operations (
  id SERIAL PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  operation_type VARCHAR(20) NOT NULL,
  amount DECIMAL(18, 2) NOT NULL,
  from_wallet VARCHAR(20) NOT NULL,
  to_wallet VARCHAR(20) NOT NULL,
  reason TEXT,
  high_watermark DECIMAL(18, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_treasury_operations_timestamp ON treasury_operations(timestamp DESC);

-- Circuit breaker events
CREATE TABLE IF NOT EXISTS circuit_breaker_events (
  id SERIAL PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  event_type VARCHAR(20) NOT NULL,
  breaker_type VARCHAR(10),
  reason TEXT NOT NULL,
  equity DECIMAL(18, 2) NOT NULL,
  operator_id VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_events_timestamp ON circuit_breaker_events(timestamp DESC);

-- Risk snapshots
CREATE TABLE IF NOT EXISTS risk_snapshots (
  id SERIAL PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  global_leverage DECIMAL(10, 2) NOT NULL,
  net_delta DECIMAL(18, 2) NOT NULL,
  correlation_score DECIMAL(5, 4) NOT NULL,
  portfolio_beta DECIMAL(5, 4) NOT NULL,
  var_95 DECIMAL(18, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_risk_snapshots_timestamp ON risk_snapshots(timestamp DESC);

-- High watermark tracking
CREATE TABLE IF NOT EXISTS high_watermark (
  id SERIAL PRIMARY KEY,
  value DECIMAL(18, 2) NOT NULL,
  updated_at BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System state (for recovery)
CREATE TABLE IF NOT EXISTS system_state (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Manual overrides
CREATE TABLE IF NOT EXISTS manual_overrides (
  id SERIAL PRIMARY KEY,
  operator_id VARCHAR(50) NOT NULL,
  original_allocation JSONB NOT NULL,
  override_allocation JSONB NOT NULL,
  reason TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at BIGINT,
  deactivated_by VARCHAR(50),
  deactivated_at BIGINT,
  expired_at BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_manual_overrides_active ON manual_overrides(active, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_manual_overrides_operator ON manual_overrides(operator_id, timestamp DESC);

-- Operators
CREATE TABLE IF NOT EXISTS operators (
  id SERIAL PRIMARY KEY,
  operator_id VARCHAR(50) UNIQUE NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]',
  last_login BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operators_operator_id ON operators(operator_id);

-- Fills (Accounting)
CREATE TABLE IF NOT EXISTS fills (
  fill_id VARCHAR(100) PRIMARY KEY,
  signal_id VARCHAR(100),
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL,
  price DECIMAL(18, 8) NOT NULL,
  qty DECIMAL(18, 8) NOT NULL,
  fee DECIMAL(18, 8),
  fee_currency VARCHAR(10),
  t_signal BIGINT,
  t_exchange BIGINT,
  t_ingress BIGINT,
  realized_pnl DECIMAL(18, 8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  execution_id VARCHAR(100),
  order_id VARCHAR(100),
  CONSTRAINT uq_fills_fill_id UNIQUE (fill_id)
);

CREATE INDEX IF NOT EXISTS idx_fills_signal_id ON fills(signal_id);
CREATE INDEX IF NOT EXISTS idx_fills_created_at ON fills(created_at DESC);

-- Event Log (Event Sourcing)
CREATE TABLE IF NOT EXISTS event_log (
  id UUID PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_log_aggregate_id ON event_log(aggregate_id);
CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(type);
CREATE INDEX IF NOT EXISTS idx_event_log_created_at ON event_log(created_at DESC);

-- Ledger System
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, currency)
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  correlation_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  tx_id VARCHAR(50) NOT NULL,
  account_id VARCHAR(50) NOT NULL,
  direction INTEGER NOT NULL,
  amount DECIMAL(24, 12) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx_id ON ledger_entries(tx_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id ON ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_correlation_id ON ledger_transactions(correlation_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_created_at ON ledger_transactions(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE allocation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuit_breaker_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE high_watermark ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
