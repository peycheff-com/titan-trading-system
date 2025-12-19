/**
 * Configuration Manager
 * 
 * Manages system configuration including:
 * - Risk Tuner (Phase 1 & 2 risk percentages)
 * - Asset Whitelist (enable/disable specific coins)
 * - API Keys validation
 * 
 * Requirements: 90.1-90.6
 */

import EventEmitter from 'events';

// Supported brokers
const BROKERS = {
  BYBIT: 'BYBIT',
  MEXC: 'MEXC',
};

// Validation constants
const MIN_API_KEY_LENGTH = 10;
const MIN_API_SECRET_LENGTH = 10;

export class ConfigManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.logger = options.logger || console;
    this.brokerGateway = options.brokerGateway;
    
    // Default configuration
    // Requirements: 90.1 - Risk Tuner inputs for Phase 1 Risk % and Phase 2 Risk %
    this.config = {
      risk_tuner: {
        phase1_risk_pct: 0.10, // 10% per trade (Phase 1: KICKSTARTER)
        phase2_risk_pct: 0.05, // 5% per trade (Phase 2: TREND RIDER)
      },
      // Requirements: 90.2 - Asset Whitelist multi-select to Enable/Disable specific coins
      asset_whitelist: {
        enabled: true, // Whether whitelist is active
        assets: {
          // Default: all major assets enabled
          'BTCUSDT': true,
          'ETHUSDT': true,
          'SOLUSDT': true,
          'BNBUSDT': true,
          'ADAUSDT': true,
          'DOGEUSDT': true,
          'XRPUSDT': true,
          'MATICUSDT': true,
          'AVAXUSDT': true,
          'DOTUSDT': true,
        },
      },
      // Requirements: 90.3 - API Config input fields for Broker Keys
      api_keys: {
        broker: 'BYBIT', // 'BYBIT' or 'MEXC'
        bybit_api_key: null,
        bybit_api_secret: null,
        mexc_api_key: null,
        mexc_api_secret: null,
        validated: false,
        last_validated: null,
      },
    };
    
    // Track disabled assets for quick lookup
    this.disabledAssets = new Set();
    this._updateDisabledAssets();
  }
  
  /**
   * Get current configuration
   * Requirements: 90.1-90.3
   */
  getConfig() {
    return {
      ...this.config,
      // Don't expose API secrets in GET response
      api_keys: {
        broker: this.config.api_keys.broker,
        bybit_api_key: this.config.api_keys.bybit_api_key ? '***' : null,
        bybit_api_secret: this.config.api_keys.bybit_api_secret ? '***' : null,
        mexc_api_key: this.config.api_keys.mexc_api_key ? '***' : null,
        mexc_api_secret: this.config.api_keys.mexc_api_secret ? '***' : null,
        validated: this.config.api_keys.validated,
        last_validated: this.config.api_keys.last_validated,
      },
    };
  }
  
  /**
   * Update Risk Tuner configuration
   * Requirements: 90.1 - Risk Tuner inputs for Phase 1 Risk % and Phase 2 Risk %
   */
  updateRiskTuner(phase1RiskPct, phase2RiskPct) {
    // Validate inputs
    if (typeof phase1RiskPct !== 'number' || phase1RiskPct <= 0 || phase1RiskPct > 1) {
      throw new Error('phase1_risk_pct must be a number between 0 and 1');
    }
    
    if (typeof phase2RiskPct !== 'number' || phase2RiskPct <= 0 || phase2RiskPct > 1) {
      throw new Error('phase2_risk_pct must be a number between 0 and 1');
    }
    
    const oldConfig = { ...this.config.risk_tuner };
    
    this.config.risk_tuner.phase1_risk_pct = phase1RiskPct;
    this.config.risk_tuner.phase2_risk_pct = phase2RiskPct;
    
    this.logger.info({
      old_phase1: oldConfig.phase1_risk_pct,
      new_phase1: phase1RiskPct,
      old_phase2: oldConfig.phase2_risk_pct,
      new_phase2: phase2RiskPct,
    }, 'Risk Tuner updated');
    
    // Requirements: 90.4 - Send update to microservice via WebSocket
    this.emit('config:changed', {
      type: 'risk_tuner',
      old: oldConfig,
      new: this.config.risk_tuner,
    });
    
    return this.config.risk_tuner;
  }
  
  /**
   * Update Asset Whitelist configuration
   * Requirements: 90.2 - Asset Whitelist multi-select to Enable/Disable specific coins
   */
  updateAssetWhitelist(assets) {
    if (typeof assets !== 'object' || assets === null) {
      throw new Error('assets must be an object with symbol: boolean pairs');
    }
    
    const oldAssets = { ...this.config.asset_whitelist.assets };
    
    // Update asset whitelist
    for (const [symbol, enabled] of Object.entries(assets)) {
      if (typeof enabled !== 'boolean') {
        throw new Error(`Invalid value for ${symbol}: must be boolean`);
      }
      this.config.asset_whitelist.assets[symbol] = enabled;
    }
    
    // Update disabled assets cache
    this._updateDisabledAssets();
    
    this.logger.info({
      updated_assets: Object.keys(assets),
      disabled_count: this.disabledAssets.size,
    }, 'Asset Whitelist updated');
    
    // Requirements: 90.4 - Send update to microservice via WebSocket
    this.emit('config:changed', {
      type: 'asset_whitelist',
      old: oldAssets,
      new: this.config.asset_whitelist.assets,
      disabled_assets: Array.from(this.disabledAssets),
    });
    
    return this.config.asset_whitelist;
  }
  
  /**
   * Update disabled assets cache
   * @private
   */
  _updateDisabledAssets() {
    this.disabledAssets.clear();
    for (const [symbol, enabled] of Object.entries(this.config.asset_whitelist.assets)) {
      if (!enabled) {
        this.disabledAssets.add(symbol);
      }
    }
  }
  
  /**
   * Check if an asset is enabled
   * Requirements: 90.5 - When asset is disabled, reject all signals for that asset
   */
  isAssetEnabled(symbol) {
    // If whitelist is disabled, all assets are allowed
    if (!this.config.asset_whitelist.enabled) {
      return true;
    }
    
    // If asset is not in whitelist, default to enabled
    if (!(symbol in this.config.asset_whitelist.assets)) {
      return true;
    }
    
    return this.config.asset_whitelist.assets[symbol] === true;
  }
  
  /**
   * Validate signal against asset whitelist
   * Requirements: 90.5 - Reject signals for disabled assets with reason "ASSET_DISABLED"
   */
  validateSignal(symbol) {
    if (!this.isAssetEnabled(symbol)) {
      return {
        valid: false,
        reason: 'ASSET_DISABLED',
        message: `Asset ${symbol} is disabled in whitelist`,
      };
    }
    
    return {
      valid: true,
    };
  }
  
  /**
   * Update API Keys
   * Requirements: 90.3 - API Config input fields for Broker Keys
   */
  async updateApiKeys(broker, apiKey, apiSecret) {
    if (!broker || !apiKey || !apiSecret) {
      throw new Error('broker, api_key, and api_secret are required');
    }
    
    // Normalize broker name to uppercase
    broker = broker.toUpperCase();
    
    if (!Object.values(BROKERS).includes(broker)) {
      throw new Error(`broker must be one of: ${Object.values(BROKERS).join(', ')}`);
    }
    
    // Requirements: 90.6 - Validate connection before saving
    const validationResult = await this.validateApiKeys(apiKey, apiSecret);
    
    if (!validationResult.valid) {
      this.logger.error({
        broker,
        error: validationResult.error,
      }, 'API key validation failed');
      throw new Error(`${broker} API key validation failed: ${validationResult.error}`);
    }
    
    this.config.api_keys.broker = broker;
    
    if (broker === BROKERS.BYBIT) {
      this.config.api_keys.bybit_api_key = apiKey;
      this.config.api_keys.bybit_api_secret = apiSecret;
    } else if (broker === BROKERS.MEXC) {
      this.config.api_keys.mexc_api_key = apiKey;
      this.config.api_keys.mexc_api_secret = apiSecret;
    }
    
    this.config.api_keys.validated = true;
    this.config.api_keys.last_validated = new Date().toISOString();
    
    this.logger.info({
      broker,
      validated: true,
      last_validated: this.config.api_keys.last_validated,
    }, 'API Keys updated and validated');
    
    // Requirements: 90.4 - Send update to microservice via WebSocket
    this.emit('config:changed', {
      type: 'api_keys',
      broker,
      validated: true,
      last_validated: this.config.api_keys.last_validated,
    });
    
    return {
      validated: true,
      last_validated: this.config.api_keys.last_validated,
    };
  }
  
  /**
   * Validate API keys by testing connection
   * Requirements: 90.6 - Validate connection before saving
   */
  async validateApiKeys(apiKey, apiSecret) {
    try {
      // If broker gateway is available, use it to test connection
      if (this.brokerGateway) {
        // Test connection by fetching account info
        const testResult = await this.brokerGateway.testConnection(apiKey, apiSecret);
        
        if (testResult.success) {
          return {
            valid: true,
            message: 'API keys validated successfully',
          };
        } else {
          return {
            valid: false,
            error: testResult.error || 'Connection test failed',
          };
        }
      }
      
      // If no broker gateway, perform basic validation
      if (!apiKey || apiKey.length < MIN_API_KEY_LENGTH) {
        return {
          valid: false,
          error: `API key appears invalid (minimum ${MIN_API_KEY_LENGTH} characters required)`,
        };
      }
      
      if (!apiSecret || apiSecret.length < MIN_API_SECRET_LENGTH) {
        return {
          valid: false,
          error: `API secret appears invalid (minimum ${MIN_API_SECRET_LENGTH} characters required)`,
        };
      }
      
      // Basic validation passed (no actual connection test)
      this.logger.warn('API keys validated without connection test (broker gateway not available)');
      return {
        valid: true,
        message: 'API keys format validated (connection not tested)',
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'API key validation error');
      return {
        valid: false,
        error: error.message,
      };
    }
  }
  
  /**
   * Get Risk Tuner configuration
   * Requirements: 90.1
   */
  getRiskTuner() {
    return this.config.risk_tuner;
  }
  
  /**
   * Get Asset Whitelist configuration
   * Requirements: 90.2
   */
  getAssetWhitelist() {
    return {
      ...this.config.asset_whitelist,
      disabled_assets: Array.from(this.disabledAssets),
    };
  }
  
  /**
   * Get broker-specific API credentials
   * @private
   */
  _getBrokerCredentials(broker = this.config.api_keys.broker) {
    if (broker === BROKERS.BYBIT) {
      return {
        apiKey: this.config.api_keys.bybit_api_key,
        apiSecret: this.config.api_keys.bybit_api_secret,
      };
    } else if (broker === BROKERS.MEXC) {
      return {
        apiKey: this.config.api_keys.mexc_api_key,
        apiSecret: this.config.api_keys.mexc_api_secret,
      };
    }
    return { apiKey: null, apiSecret: null };
  }

  /**
   * Get API Keys status (without exposing secrets)
   * Requirements: 90.3
   */
  getApiKeysStatus() {
    const broker = this.config.api_keys.broker;
    const { apiKey, apiSecret } = this._getBrokerCredentials(broker);
    
    return {
      broker,
      has_api_key: !!apiKey,
      has_api_secret: !!apiSecret,
      validated: this.config.api_keys.validated,
      last_validated: this.config.api_keys.last_validated,
    };
  }
  
  /**
   * Enable/disable asset whitelist enforcement
   * Requirements: 90.2
   */
  setWhitelistEnabled(enabled) {
    if (typeof enabled !== 'boolean') {
      throw new Error('enabled must be a boolean');
    }
    
    const oldValue = this.config.asset_whitelist.enabled;
    this.config.asset_whitelist.enabled = enabled;
    
    this.logger.info({
      old_value: oldValue,
      new_value: enabled,
    }, 'Asset Whitelist enforcement changed');
    
    this.emit('config:changed', {
      type: 'whitelist_enabled',
      old: oldValue,
      new: enabled,
    });
    
    return this.config.asset_whitelist.enabled;
  }
  
  /**
   * Get list of disabled assets
   * Requirements: 90.5
   */
  getDisabledAssets() {
    return Array.from(this.disabledAssets);
  }

  /**
   * Get active broker and credentials (for BrokerGateway)
   * Returns null if not validated
   * Requirements: 90.3
   */
  getActiveBrokerConfig() {
    if (!this.config.api_keys.validated) {
      return null;
    }

    const broker = this.config.api_keys.broker;
    const { apiKey, apiSecret } = this._getBrokerCredentials(broker);

    if (!apiKey || !apiSecret) {
      return null;
    }

    return {
      broker,
      apiKey,
      apiSecret,
      validated: true,
      last_validated: this.config.api_keys.last_validated,
    };
  }
  
  /**
   * Update configuration (unified method for web UI)
   * Supports updating broker, mode, risk tuner, and asset whitelist
   */
  async updateConfig(updates) {
    if (!updates || typeof updates !== 'object') {
      throw new Error('updates must be an object');
    }

    const results = {};

    // Update broker configuration
    if (updates.broker) {
      const { name, apiKey, apiSecret } = updates.broker;
      if (name && apiKey && apiSecret) {
        results.broker = await this.updateApiKeys(name, apiKey, apiSecret);
      }
    }

    // Update mode (LIVE/MOCK)
    if (updates.mode) {
      this.config.mode = updates.mode;
      results.mode = updates.mode;
      this.logger.info({ mode: updates.mode }, 'Trading mode updated');
      this.emit('config:changed', {
        type: 'mode',
        mode: updates.mode,
      });
    }

    // Update risk tuner
    if (updates.risk_tuner) {
      const { phase1_risk_pct, phase2_risk_pct } = updates.risk_tuner;
      if (phase1_risk_pct !== undefined && phase2_risk_pct !== undefined) {
        results.risk_tuner = this.updateRiskTuner(phase1_risk_pct, phase2_risk_pct);
      }
    }

    // Update asset whitelist
    if (updates.asset_whitelist) {
      results.asset_whitelist = this.updateAssetWhitelist(updates.asset_whitelist);
    }

    return results;
  }

  /**
   * Reset configuration to defaults
   */
  reset() {
    this.config = {
      risk_tuner: {
        phase1_risk_pct: 0.10,
        phase2_risk_pct: 0.05,
      },
      asset_whitelist: {
        enabled: true,
        assets: {
          'BTCUSDT': true,
          'ETHUSDT': true,
          'SOLUSDT': true,
          'BNBUSDT': true,
          'ADAUSDT': true,
          'DOGEUSDT': true,
          'XRPUSDT': true,
          'MATICUSDT': true,
          'AVAXUSDT': true,
          'DOTUSDT': true,
        },
      },
      api_keys: {
        broker: 'BYBIT',
        bybit_api_key: null,
        bybit_api_secret: null,
        mexc_api_key: null,
        mexc_api_secret: null,
        validated: false,
        last_validated: null,
      },
    };
    
    this._updateDisabledAssets();
    
    this.logger.info('Configuration reset to defaults');
    
    this.emit('config:changed', {
      type: 'reset',
      config: this.getConfig(),
    });
  }
}
