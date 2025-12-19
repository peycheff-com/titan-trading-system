-- 002_add_indexes.sql
-- Add indexes for query performance optimization
-- Requirements: 97.1-97.2

-- Trades table indexes
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_signal_id ON trades(signal_id);

-- Positions table indexes
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
CREATE INDEX IF NOT EXISTS idx_positions_opened_at ON positions(opened_at);

-- Regime snapshots table indexes
CREATE INDEX IF NOT EXISTS idx_regime_snapshots_timestamp ON regime_snapshots(timestamp);

-- System events table indexes
CREATE INDEX IF NOT EXISTS idx_system_events_timestamp ON system_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type);
