-- dynamic_config_migration.sql

-- Table to define dynamic parameters
CREATE TABLE IF NOT EXISTS parameter_configs (
    name VARCHAR(255) PRIMARY KEY,
    description TEXT,
    default_value JSONB NOT NULL,
    schema JSONB NOT NULL, -- JSON Schema for validation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table to store specific versions of parameter sets
CREATE TABLE IF NOT EXISTS parameter_versions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) REFERENCES parameter_configs(name),
    version INT NOT NULL,
    value JSONB NOT NULL,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, version)
);

-- Table to manage active rollouts (canary deployments)
CREATE TABLE IF NOT EXISTS canary_rollouts (
    id SERIAL PRIMARY KEY,
    parameter_name VARCHAR(255) REFERENCES parameter_configs(name),
    active_version_id INT REFERENCES parameter_versions(id),
    baseline_version_id INT REFERENCES parameter_versions(id), -- The "safe" version
    rollout_percentage INT CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    target_criteria JSONB, -- Optional: {"symbol": "BTCUSDT"} or {"strategy": "mean_reversion"}
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_canary_active ON canary_rollouts(parameter_name) WHERE is_active = TRUE;

-- DOWN (revert)
-- DROP INDEX IF EXISTS idx_canary_active;
-- DROP TABLE IF EXISTS canary_rollouts;
-- DROP TABLE IF EXISTS parameter_versions;
-- DROP TABLE IF EXISTS parameter_configs;
