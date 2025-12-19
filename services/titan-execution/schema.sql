-- ============================================
-- TITAN MASTER DATABASE SCHEMA
-- SQLite3 Database for Titan Trading System
-- ============================================

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================================
-- TABLE 1: system_state
-- Global system state (single row)
-- ============================================
CREATE TABLE IF NOT EXISTS system_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nav REAL NOT NULL DEFAULT 200.0,
    active_phase INTEGER NOT NULL DEFAULT 1 CHECK (active_phase IN (1, 2, 3)),
    high_watermark REAL NOT NULL DEFAULT 200.0,
    master_arm INTEGER NOT NULL DEFAULT 0 CHECK (master_arm IN (0, 1)),
    circuit_breaker INTEGER NOT NULL DEFAULT 0 CHECK (circuit_breaker IN (0, 1)),
    futures_wallet REAL NOT NULL DEFAULT 200.0,
    spot_wallet REAL NOT NULL DEFAULT 0.0,
    unrealized_pnl REAL NOT NULL DEFAULT 0.0,
    daily_pnl REAL NOT NULL DEFAULT 0.0,
    daily_pnl_reset_at TEXT,
    config_version_tag TEXT,
    last_sweep_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert default system state
INSERT OR IGNORE INTO system_state (id) VALUES (1);

-- ============================================
-- TABLE 2: trade_history
-- Complete trade records with execution details
-- ============================================
CREATE TABLE IF NOT EXISTS trade_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id TEXT NOT NULL UNIQUE,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('Buy', 'Sell')),
    entry_price REAL NOT NULL,
    exit_price REAL,
    quantity REAL NOT NULL,
    leverage INTEGER NOT NULL DEFAULT 1,
    stop_loss REAL,
    take_profit REAL,
    
    -- Execution details
    order_type TEXT NOT NULL CHECK (order_type IN ('MARKET', 'LIMIT', 'IOC', 'POST_ONLY', 'TWAP', 'VWAP')),
    exchange TEXT NOT NULL CHECK (exchange IN ('bybit', 'mexc', 'both')),
    fill_price REAL,
    slippage_bps REAL,
    fees REAL DEFAULT 0,
    
    -- Signal metadata
    source TEXT NOT NULL CHECK (source IN ('scavenger', 'hunter', 'sentinel', 'pine_script', 'manual')),
    trap_type TEXT,
    confluence_score REAL,
    regime_state INTEGER,
    
    -- Performance
    realized_pnl REAL,
    r_multiple REAL,
    win INTEGER CHECK (win IN (0, 1)),
    
    -- Timestamps
    signal_timestamp TEXT NOT NULL,
    entry_timestamp TEXT,
    exit_timestamp TEXT,
    duration_seconds INTEGER,
    
    -- Config tracking
    config_version_tag TEXT,
    phase INTEGER NOT NULL DEFAULT 1,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'closed', 'cancelled', 'failed')),
    error_message TEXT,
    
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for trade_history
CREATE INDEX IF NOT EXISTS idx_trade_history_symbol ON trade_history(symbol);
CREATE INDEX IF NOT EXISTS idx_trade_history_source ON trade_history(source);
CREATE INDEX IF NOT EXISTS idx_trade_history_status ON trade_history(status);
CREATE INDEX IF NOT EXISTS idx_trade_history_created_at ON trade_history(created_at);
CREATE INDEX IF NOT EXISTS idx_trade_history_config_version ON trade_history(config_version_tag);

-- ============================================
-- TABLE 3: positions (Shadow State persistence)
-- Active positions for crash recovery
-- ============================================
CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id TEXT NOT NULL UNIQUE,
    signal_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('Buy', 'Sell')),
    size REAL NOT NULL,
    entry_price REAL NOT NULL,
    current_price REAL,
    stop_loss REAL,
    take_profit REAL,
    leverage INTEGER NOT NULL DEFAULT 1,
    exchange TEXT NOT NULL CHECK (exchange IN ('bybit', 'mexc')),
    
    -- Unrealized P&L
    unrealized_pnl REAL DEFAULT 0,
    unrealized_pnl_pct REAL DEFAULT 0,
    
    -- Metadata
    source TEXT NOT NULL,
    phase INTEGER NOT NULL DEFAULT 1,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closing', 'closed')),
    
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for positions
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_signal_id ON positions(signal_id);

-- ============================================
-- TABLE 4: active_traps
-- Persisted tripwires for restart recovery
-- ============================================
CREATE TABLE IF NOT EXISTS active_traps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trap_id TEXT NOT NULL UNIQUE,
    symbol TEXT NOT NULL,
    trap_type TEXT NOT NULL CHECK (trap_type IN ('LIQUIDATION', 'OI_WIPEOUT', 'FUNDING_SQUEEZE', 'BASIS_ARB', 'DAILY_LEVEL', 'BOLLINGER')),
    trigger_price REAL NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
    
    -- Trap metadata
    confidence REAL NOT NULL DEFAULT 0,
    lead_time_seconds INTEGER,
    volume_threshold REAL,
    
    -- Validity
    valid_from TEXT NOT NULL DEFAULT (datetime('now')),
    valid_until TEXT,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'expired', 'cancelled')),
    triggered_at TEXT,
    
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for active_traps
CREATE INDEX IF NOT EXISTS idx_active_traps_symbol ON active_traps(symbol);
CREATE INDEX IF NOT EXISTS idx_active_traps_status ON active_traps(status);
CREATE INDEX IF NOT EXISTS idx_active_traps_trap_type ON active_traps(trap_type);

-- ============================================
-- TABLE 5: regime_snapshots
-- Historical regime context (every 5 minutes)
-- ============================================
CREATE TABLE IF NOT EXISTS regime_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    
    -- State vectors
    trend_state INTEGER NOT NULL CHECK (trend_state IN (-1, 0, 1)),
    vol_state INTEGER NOT NULL CHECK (vol_state IN (0, 1, 2)),
    liquidity_state INTEGER NOT NULL CHECK (liquidity_state IN (0, 1, 2)),
    regime_state INTEGER NOT NULL CHECK (regime_state IN (-1, 0, 1)),
    
    -- Advanced metrics
    hurst_exponent REAL,
    fdi REAL,
    efficiency_ratio REAL,
    vpin_approx REAL,
    absorption_state INTEGER CHECK (absorption_state IN (0, 1)),
    shannon_entropy REAL,
    
    -- Component scores
    market_structure_score REAL,
    trend_score REAL,
    momentum_score REAL,
    vol_score REAL,
    macro_score REAL,
    
    -- Model recommendation
    model_recommendation TEXT CHECK (model_recommendation IN ('TREND_FOLLOW', 'MEAN_REVERT', 'NO_TRADE')),
    
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for regime_snapshots
CREATE INDEX IF NOT EXISTS idx_regime_snapshots_symbol ON regime_snapshots(symbol);
CREATE INDEX IF NOT EXISTS idx_regime_snapshots_created_at ON regime_snapshots(created_at);

-- ============================================
-- TABLE 6: system_events
-- Audit trail for all system events
-- ============================================
CREATE TABLE IF NOT EXISTS system_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warn', 'error', 'critical')),
    service TEXT NOT NULL CHECK (service IN ('core', 'brain', 'scavenger', 'hunter', 'sentinel', 'ai-quant', 'console')),
    
    -- Event details
    message TEXT NOT NULL,
    context TEXT, -- JSON blob
    signal_id TEXT,
    
    -- Error details (if applicable)
    error_code TEXT,
    stack_trace TEXT,
    
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for system_events
CREATE INDEX IF NOT EXISTS idx_system_events_event_type ON system_events(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_severity ON system_events(severity);
CREATE INDEX IF NOT EXISTS idx_system_events_service ON system_events(service);
CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON system_events(created_at);
CREATE INDEX IF NOT EXISTS idx_system_events_signal_id ON system_events(signal_id);

-- ============================================
-- TABLE 7: strategic_insights
-- AI Quant knowledge storage
-- ============================================
CREATE TABLE IF NOT EXISTS strategic_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    insight_type TEXT NOT NULL CHECK (insight_type IN ('pattern', 'proposal', 'briefing', 'observation')),
    topic TEXT NOT NULL,
    insight_text TEXT NOT NULL,
    confidence_score REAL NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    
    -- Proposal details (if applicable)
    old_config TEXT, -- JSON blob
    new_config TEXT, -- JSON blob
    projected_pnl_improvement REAL,
    risk_impact TEXT,
    
    -- Application tracking
    applied_to_config INTEGER DEFAULT 0 CHECK (applied_to_config IN (0, 1)),
    applied_at TEXT,
    performance_delta REAL,
    performance_measured_at TEXT,
    
    -- Review status
    reviewed INTEGER DEFAULT 0 CHECK (reviewed IN (0, 1)),
    reviewed_at TEXT,
    approved INTEGER CHECK (approved IN (0, 1)),
    rejection_reason TEXT,
    
    -- Duplicate detection
    content_hash TEXT,
    
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT
);

-- Indexes for strategic_insights
CREATE INDEX IF NOT EXISTS idx_strategic_insights_type ON strategic_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_strategic_insights_reviewed ON strategic_insights(reviewed);
CREATE INDEX IF NOT EXISTS idx_strategic_insights_applied ON strategic_insights(applied_to_config);
CREATE INDEX IF NOT EXISTS idx_strategic_insights_created_at ON strategic_insights(created_at);
CREATE INDEX IF NOT EXISTS idx_strategic_insights_content_hash ON strategic_insights(content_hash);

-- ============================================
-- TABLE 8: config_versions
-- Configuration rollback support
-- ============================================
CREATE TABLE IF NOT EXISTS config_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_tag TEXT NOT NULL UNIQUE,
    config_json TEXT NOT NULL,
    change_summary TEXT NOT NULL,
    changed_by TEXT NOT NULL DEFAULT 'system',
    
    -- Performance tracking
    trades_count INTEGER DEFAULT 0,
    total_pnl REAL DEFAULT 0,
    win_rate REAL,
    sharpe_ratio REAL,
    max_drawdown REAL,
    
    -- Status
    is_active INTEGER DEFAULT 0 CHECK (is_active IN (0, 1)),
    rolled_back_from TEXT,
    
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for config_versions
CREATE INDEX IF NOT EXISTS idx_config_versions_is_active ON config_versions(is_active);
CREATE INDEX IF NOT EXISTS idx_config_versions_created_at ON config_versions(created_at);

-- ============================================
-- TABLE 9: strategic_insights_archive
-- Archived insights (older than 90 days)
-- ============================================
CREATE TABLE IF NOT EXISTS strategic_insights_archive (
    id INTEGER PRIMARY KEY,
    insight_type TEXT NOT NULL,
    topic TEXT NOT NULL,
    insight_text TEXT NOT NULL,
    confidence_score REAL NOT NULL,
    old_config TEXT,
    new_config TEXT,
    projected_pnl_improvement REAL,
    risk_impact TEXT,
    applied_to_config INTEGER,
    applied_at TEXT,
    performance_delta REAL,
    performance_measured_at TEXT,
    reviewed INTEGER,
    reviewed_at TEXT,
    approved INTEGER,
    rejection_reason TEXT,
    content_hash TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    archived_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- TABLE 10: correlation_matrix
-- Portfolio correlation tracking
-- ============================================
CREATE TABLE IF NOT EXISTS correlation_matrix (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol_a TEXT NOT NULL,
    symbol_b TEXT NOT NULL,
    correlation REAL NOT NULL CHECK (correlation >= -1 AND correlation <= 1),
    window_hours INTEGER NOT NULL DEFAULT 24,
    sample_count INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(symbol_a, symbol_b, window_hours)
);

-- Index for correlation_matrix
CREATE INDEX IF NOT EXISTS idx_correlation_matrix_created_at ON correlation_matrix(created_at);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at timestamp on system_state changes
CREATE TRIGGER IF NOT EXISTS update_system_state_timestamp
AFTER UPDATE ON system_state
BEGIN
    UPDATE system_state SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Update updated_at timestamp on trade_history changes
CREATE TRIGGER IF NOT EXISTS update_trade_history_timestamp
AFTER UPDATE ON trade_history
BEGIN
    UPDATE trade_history SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Update updated_at timestamp on positions changes
CREATE TRIGGER IF NOT EXISTS update_positions_timestamp
AFTER UPDATE ON positions
BEGIN
    UPDATE positions SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Update updated_at timestamp on active_traps changes
CREATE TRIGGER IF NOT EXISTS update_active_traps_timestamp
AFTER UPDATE ON active_traps
BEGIN
    UPDATE active_traps SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================
-- VIEWS
-- ============================================

-- View: Open positions summary
CREATE VIEW IF NOT EXISTS v_open_positions AS
SELECT 
    symbol,
    side,
    size,
    entry_price,
    current_price,
    unrealized_pnl,
    unrealized_pnl_pct,
    leverage,
    exchange,
    source,
    phase,
    created_at
FROM positions
WHERE status = 'open';

-- View: Daily performance summary
CREATE VIEW IF NOT EXISTS v_daily_performance AS
SELECT 
    date(created_at) as trade_date,
    COUNT(*) as total_trades,
    SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN win = 0 THEN 1 ELSE 0 END) as losses,
    ROUND(100.0 * SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as win_rate,
    ROUND(SUM(realized_pnl), 2) as total_pnl,
    ROUND(AVG(r_multiple), 2) as avg_r_multiple,
    source
FROM trade_history
WHERE status = 'closed'
GROUP BY date(created_at), source
ORDER BY trade_date DESC;

-- View: Recent system events
CREATE VIEW IF NOT EXISTS v_recent_events AS
SELECT 
    event_type,
    severity,
    service,
    message,
    signal_id,
    created_at
FROM system_events
ORDER BY created_at DESC
LIMIT 100;

-- View: Active config version
CREATE VIEW IF NOT EXISTS v_active_config AS
SELECT 
    version_tag,
    config_json,
    change_summary,
    trades_count,
    total_pnl,
    win_rate,
    sharpe_ratio,
    max_drawdown,
    created_at
FROM config_versions
WHERE is_active = 1;
