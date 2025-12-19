-- 001_initial_schema.sql
-- Initial database schema for Titan Execution Microservice
-- Requirements: 97.1-97.2

-- Trades table: Audit trail for all trade executions
CREATE TABLE IF NOT EXISTS trades (
  trade_id SERIAL PRIMARY KEY,
  signal_id VARCHAR(100) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL,
  size DECIMAL(18, 8) NOT NULL,
  entry_price DECIMAL(18, 8) NOT NULL,
  stop_price DECIMAL(18, 8),
  tp_price DECIMAL(18, 8),
  fill_price DECIMAL(18, 8),
  slippage_pct DECIMAL(10, 6),
  execution_latency_ms INTEGER,
  regime_state INTEGER,
  phase INTEGER,
  timestamp TIMESTAMP NOT NULL
);

-- Positions table: Track open and closed positions
CREATE TABLE IF NOT EXISTS positions (
  position_id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL,
  size DECIMAL(18, 8) NOT NULL,
  avg_entry DECIMAL(18, 8) NOT NULL,
  current_stop DECIMAL(18, 8),
  current_tp DECIMAL(18, 8),
  unrealized_pnl DECIMAL(18, 8),
  regime_at_entry INTEGER,
  phase_at_entry INTEGER,
  opened_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  closed_at TIMESTAMP,
  close_price DECIMAL(18, 8),
  realized_pnl DECIMAL(18, 8),
  close_reason VARCHAR(50)
);

-- Regime snapshots table: Periodic regime state snapshots
CREATE TABLE IF NOT EXISTS regime_snapshots (
  snapshot_id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  regime_state INTEGER,
  trend_state INTEGER,
  vol_state INTEGER,
  market_structure_score DECIMAL(10, 2),
  model_recommendation VARCHAR(20)
);

-- System events table: Critical system events and alerts
CREATE TABLE IF NOT EXISTS system_events (
  event_id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  description TEXT,
  context_json TEXT,
  timestamp TIMESTAMP NOT NULL
);
