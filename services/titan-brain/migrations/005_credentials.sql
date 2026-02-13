-- Titan Brain Database Migration 005: Credentials Management
-- Secure credential storage with AES-256-GCM encryption

-- User credentials table (encrypted secrets)
CREATE TABLE IF NOT EXISTS user_credentials (
  id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  user_id VARCHAR(50) NOT NULL,
  provider VARCHAR(50) NOT NULL,  -- 'bybit', 'binance', 'deribit', 'hyperliquid', 'gemini'
  credential_type VARCHAR(50) NOT NULL,  -- 'api_key', 'api_secret', 'oauth_token'
  encrypted_value TEXT NOT NULL,  -- AES-256-GCM encrypted
  iv VARCHAR(32) NOT NULL,  -- Initialization vector (hex)
  auth_tag VARCHAR(32) NOT NULL,  -- GCM authentication tag (hex)
  metadata JSONB DEFAULT '{}',  -- testnet, category, etc.
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_validated_at TIMESTAMP,
  validation_status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'valid', 'invalid'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_provider_type UNIQUE (user_id, provider, credential_type)
);

CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_provider ON user_credentials(provider);
CREATE INDEX IF NOT EXISTS idx_credentials_active ON user_credentials(is_active, provider);

-- Credential audit log (immutable)
CREATE TABLE IF NOT EXISTS credential_audit_log (
  id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  credential_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL,  -- 'create', 'update', 'delete', 'access', 'validate'
  accessor VARCHAR(100) NOT NULL,  -- service or user that accessed
  ip_address VARCHAR(45),  -- IPv4 or IPv6
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_credential_id ON credential_audit_log(credential_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON credential_audit_log(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON credential_audit_log(action, timestamp DESC);

-- Enable RLS
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_audit_log ENABLE ROW LEVEL SECURITY;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_credential_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_credentials_updated
  BEFORE UPDATE ON user_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_credential_timestamp();

-- DOWN (revert)
-- DROP TRIGGER IF EXISTS trg_credentials_updated ON user_credentials;
-- DROP FUNCTION IF EXISTS update_credential_timestamp;
-- ALTER TABLE credential_audit_log DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_credentials DISABLE ROW LEVEL SECURITY;
-- DROP TABLE IF EXISTS credential_audit_log;
-- DROP TABLE IF EXISTS user_credentials;
