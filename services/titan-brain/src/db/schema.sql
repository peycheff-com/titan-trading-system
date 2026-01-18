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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fills_signal_id ON fills(signal_id);

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
