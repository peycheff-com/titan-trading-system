/**
 * Configuration Validator for Titan Execution Service
 * 
 * Validates configuration against JSON schema on startup.
 * Implements fail-fast with clear error messages.
 * 
 * Requirements: 8.1-8.7
 * 
 * Property 27: Configuration Validation Rejection
 * For any invalid configuration, validation should fail with specific error message
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs';
import path from 'path';

// ============================================================================
// Constants
// ============================================================================

export const CONFIG_VERSIONS = {
  LEGACY: '1.0.0',
  V1_5: '1.5.0',
  CURRENT: '2.0.0'
};

// ============================================================================
// Schema Definitions
// ============================================================================

const serverSchema = {
  port: { type: 'integer', minimum: 1, maximum: 65535 },
  host: { type: 'string', format: 'hostname' }
};

const securitySchema = {
  hmacSecret: { type: 'string', minLength: 32 },
  masterPassword: { type: 'string', minLength: 16 }
};

const bybitSchema = {
  type: 'object',
  properties: {
    apiKey: { type: 'string', minLength: 1 },
    apiSecret: { type: 'string', minLength: 1 },
    testnet: { type: 'boolean' },
    category: { type: 'string', enum: ['linear', 'inverse', 'spot'] },
    rateLimitRps: { type: 'integer', minimum: 1, maximum: 50 },
    maxRetries: { type: 'integer', minimum: 1, maximum: 10 },
    accountCacheTtl: { type: 'integer', minimum: 1000, maximum: 60000 }
  },
  required: ['apiKey', 'apiSecret']
};

const riskSchema = {
  type: 'object',
  properties: {
    maxRiskPct: { type: 'number', minimum: 0.01, maximum: 10 },
    phase1RiskPct: { type: 'number', minimum: 0.01, maximum: 5 },
    phase2RiskPct: { type: 'number', minimum: 0.01, maximum: 5 },
    maxConsecutiveLosses: { type: 'integer', minimum: 1, maximum: 20 },
    maxDailyDrawdownPct: { type: 'number', minimum: 1, maximum: 50 },
    maxWeeklyDrawdownPct: { type: 'number', minimum: 1, maximum: 50 },
    circuitBreakerCooldownHours: { type: 'integer', minimum: 1, maximum: 168 }
  },
  required: ['maxRiskPct']
};

const safetySchema = {
  type: 'object',
  properties: {
    zscoreSafetyThreshold: { type: 'number', minimum: 1, maximum: 5 },
    drawdownVelocityThreshold: { type: 'number', minimum: 0.01, maximum: 1 },
    minStructureThreshold: { type: 'number', minimum: 0, maximum: 1 },
    maxSpreadPct: { type: 'number', minimum: 0.01, maximum: 10 },
    maxSlippagePct: { type: 'number', minimum: 0.01, maximum: 10 }
  }
};

const performanceSchema = {
  type: 'object',
  properties: {
    wsCacheMaxAgeMs: { type: 'integer', minimum: 100, maximum: 10000 },
    signalCacheTtlMs: { type: 'integer', minimum: 1000, maximum: 300000 },
    idempotencyTtl: { type: 'integer', minimum: 60, maximum: 3600 },
    heartbeatTimeoutMs: { type: 'integer', minimum: 60000, maximum: 600000 }
  }
};

const databaseSchema = {
  type: 'object',
  properties: {
    path: { type: 'string', minLength: 1 },
    backupDir: { type: 'string', minLength: 1 },
    backupRetentionDays: { type: 'integer', minimum: 1, maximum: 365 }
  },
  required: ['path']
};

const monitoringSchema = {
  type: 'object',
  properties: {
    prometheusEnabled: { type: 'boolean' },
    logLevel: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] }
  }
};

/**
 * Main Configuration Schema
 * Defines all valid configuration parameters with types and constraints
 */
const configSchema = {
  type: 'object',
  properties: {
    ...serverSchema,
    ...securitySchema,
    bybit: bybitSchema,
    risk: riskSchema,
    safety: safetySchema,
    performance: performanceSchema,
    database: databaseSchema,
    monitoring: monitoringSchema,
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' }
  },
  required: ['port', 'host', 'hmacSecret', 'bybit', 'risk', 'database'],
  additionalProperties: false
};

// ============================================================================
// Validator Setup
// ============================================================================

const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);
const validate = ajv.compile(configSchema);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format validation errors for console output
 * @param {Array} errors - Array of validation errors
 */
function formatValidationErrors(errors) {
  console.error('❌ Configuration validation failed:');
  errors.forEach(err => {
    console.error(`   ${err.path}: ${err.message}`);
    if (err.params) {
      console.error(`   Details: ${JSON.stringify(err.params)}`);
    }
  });
}

/**
 * Check if configuration needs migration
 * @param {Object} config - Configuration object
 * @returns {boolean} True if migration is needed
 */
function needsMigration(config) {
  const currentVersion = config.version || CONFIG_VERSIONS.LEGACY;
  return currentVersion !== CONFIG_VERSIONS.CURRENT;
}

/**
 * Backup configuration file
 * @param {string} configPath - Path to configuration file
 */
function backupConfiguration(configPath) {
  const backupPath = `${configPath}.backup-${Date.now()}`;
  fs.copyFileSync(configPath, backupPath);
  console.log(`📋 Original configuration backed up to ${backupPath}`);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate configuration object
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validation result { valid: boolean, errors: Array }
 */
export function validateConfiguration(config) {
  // Input validation
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {
      valid: false,
      errors: [{
        path: '',
        message: 'Configuration must be a non-null object',
        params: {},
        keyword: 'type'
      }]
    };
  }
  
  const valid = validate(config);
  
  if (!valid) {
    return {
      valid: false,
      errors: validate.errors.map(err => ({
        path: err.instancePath || err.dataPath,
        message: err.message,
        params: err.params,
        keyword: err.keyword
      }))
    };
  }
  
  return { valid: true, errors: [] };
}

/**
 * Load and validate configuration from file
 * @param {string} configPath - Path to configuration file
 * @returns {Object} Validated configuration
 * @throws {Error} If file not found, invalid JSON, or validation fails
 */
export function loadAndValidateConfig(configPath) {
  try {
    // Check if file exists
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }
    
    // Read and parse JSON
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    // Validate against schema
    const result = validateConfiguration(config);
    
    if (!result.valid) {
      formatValidationErrors(result.errors);
      throw new Error('Invalid configuration');
    }
    
    console.log('✅ Configuration validated successfully');
    return config;
  } catch (error) {
    // Handle specific error types
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse configuration file: ${error.message}`);
    }
    if (error.code === 'ENOENT') {
      throw new Error(`Configuration file not found: ${configPath}`);
    }
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied reading configuration file: ${configPath}`);
    }
    throw error;
  }
}

// ============================================================================
// Migration Functions
// ============================================================================

/**
 * Migration chain - each function migrates from one version to the next
 */
const migrations = {
  /**
   * Migrate from 1.0.0 to 1.5.0
   * @param {Object} config - Configuration at version 1.0.0
   * @returns {Object} Configuration at version 1.5.0
   */
  '1.0.0': (config) => {
    console.log('  → Migrating 1.0.0 to 1.5.0...');
    const migrated = { ...config };
    
    // Rename broker to bybit
    if (migrated.broker) {
      migrated.bybit = migrated.broker;
      delete migrated.broker;
    }
    
    migrated.version = CONFIG_VERSIONS.V1_5;
    console.log('  ✅ Migration to 1.5.0 complete');
    return migrated;
  },
  
  /**
   * Migrate from 1.5.0 to 2.0.0
   * @param {Object} config - Configuration at version 1.5.0
   * @returns {Object} Configuration at version 2.0.0
   */
  '1.5.0': (config) => {
    console.log('  → Migrating 1.5.0 to 2.0.0...');
    const migrated = { ...config };
    
    // Add monitoring section with defaults
    if (!migrated.monitoring) {
      migrated.monitoring = {
        prometheusEnabled: true,
        logLevel: 'info'
      };
    }
    
    // Add safety section with defaults
    if (!migrated.safety) {
      migrated.safety = {
        zscoreSafetyThreshold: 2.5,
        drawdownVelocityThreshold: 0.05,
        minStructureThreshold: 0.3,
        maxSpreadPct: 0.5,
        maxSlippagePct: 0.3
      };
    }
    
    // Add performance section with defaults
    if (!migrated.performance) {
      migrated.performance = {
        wsCacheMaxAgeMs: 1000,
        signalCacheTtlMs: 60000,
        idempotencyTtl: 300,
        heartbeatTimeoutMs: 300000
      };
    }
    
    migrated.version = CONFIG_VERSIONS.CURRENT;
    console.log('  ✅ Migration to 2.0.0 complete');
    return migrated;
  }
};

/**
 * Property 28: Configuration Migration Success
 * For any outdated configuration version, migration should produce valid latest version
 * 
 * Migrate configuration to latest version using migration chain
 * @param {Object} config - Configuration object
 * @returns {Object} Migrated configuration
 * @throws {Error} If no migration path exists or migration produces invalid config
 */
export function migrateConfiguration(config) {
  const currentVersion = config.version || CONFIG_VERSIONS.LEGACY;
  const targetVersion = CONFIG_VERSIONS.CURRENT;
  
  if (currentVersion === targetVersion) {
    console.log(`✅ Configuration already at version ${targetVersion}`);
    return config;
  }
  
  console.log(`🔄 Migrating configuration from ${currentVersion} to ${targetVersion}...`);
  
  let migratedConfig = { ...config };
  let version = currentVersion;
  
  // Apply migration chain
  while (version !== targetVersion) {
    if (!migrations[version]) {
      throw new Error(
        `No migration path from version ${version}. ` +
        `Available migrations: ${Object.keys(migrations).join(', ')}`
      );
    }
    
    migratedConfig = migrations[version](migratedConfig);
    version = migratedConfig.version;
  }
  
  // Validate migrated config
  const result = validateConfiguration(migratedConfig);
  if (!result.valid) {
    formatValidationErrors(result.errors);
    throw new Error('Configuration migration failed - produced invalid configuration');
  }
  
  console.log(`✅ Migration complete: ${currentVersion} → ${targetVersion}`);
  return migratedConfig;
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Save configuration to file
 * @param {Object} config - Configuration object
 * @param {string} configPath - Path to save configuration
 * @throws {Error} If save operation fails
 */
export function saveConfiguration(config, configPath) {
  try {
    // Validate before saving
    const result = validateConfiguration(config);
    if (!result.valid) {
      formatValidationErrors(result.errors);
      throw new Error('Cannot save invalid configuration');
    }
    
    // Ensure directory exists
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write with pretty formatting
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`✅ Configuration saved to ${configPath}`);
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied writing configuration file: ${configPath}`);
    }
    if (error.code === 'ENOSPC') {
      throw new Error(`No space left on device: ${configPath}`);
    }
    throw new Error(`Failed to save configuration: ${error.message}`);
  }
}

/**
 * Perform migration workflow: migrate, backup, save
 * @param {Object} config - Configuration object
 * @param {string} configPath - Path to configuration file
 * @returns {Object} Migrated configuration
 */
function performMigrationWorkflow(config, configPath) {
  console.log(`\n🔄 Configuration version ${config.version || CONFIG_VERSIONS.LEGACY} detected, migration required`);
  
  // Migrate configuration
  const migratedConfig = migrateConfiguration(config);
  
  // Backup original
  backupConfiguration(configPath);
  
  // Save migrated version
  saveConfiguration(migratedConfig, configPath);
  
  return migratedConfig;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Validate configuration on startup
 * Exits process if validation fails
 * @param {string} configPath - Path to configuration file
 * @returns {Object} Validated configuration
 */
export function validateOnStartup(configPath) {
  try {
    console.log(`\n🔍 Validating configuration: ${configPath}`);
    
    // Load and validate configuration
    let config = loadAndValidateConfig(configPath);
    
    // Check if migration is needed
    if (needsMigration(config)) {
      config = performMigrationWorkflow(config, configPath);
    }
    
    console.log('✅ Configuration validation complete\n');
    return config;
  } catch (error) {
    console.error(`\n❌ Configuration validation failed: ${error.message}`);
    console.error('   Please fix the configuration and restart the service');
    process.exit(1);
  }
}
