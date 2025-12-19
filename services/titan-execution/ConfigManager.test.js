/**
 * ConfigManager Tests
 * 
 * Tests for Configuration Manager including:
 * - Risk Tuner updates
 * - Asset Whitelist management
 * - API Keys validation
 * - Signal validation against whitelist
 * 
 * Requirements: 90.1-90.6
 */

import { jest } from '@jest/globals';
import { ConfigManager } from './ConfigManager.js';

describe('ConfigManager', () => {
  let configManager;
  let mockLogger;
  let mockBrokerGateway;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockBrokerGateway = {
      testConnection: jest.fn(),
    };

    configManager = new ConfigManager({
      logger: mockLogger,
      brokerGateway: mockBrokerGateway,
    });
  });

  afterEach(() => {
    if (configManager && configManager.removeAllListeners) {
      configManager.removeAllListeners();
    }
  });

  describe('Risk Tuner', () => {
    test('should get default risk tuner configuration', () => {
      // Requirements: 90.1 - Risk Tuner inputs for Phase 1 Risk % and Phase 2 Risk %
      const riskTuner = configManager.getRiskTuner();
      
      expect(riskTuner).toEqual({
        phase1_risk_pct: 0.10,
        phase2_risk_pct: 0.05,
      });
    });

    test('should update risk tuner configuration', () => {
      // Requirements: 90.1 - Handle Risk Tuner updates
      const updated = configManager.updateRiskTuner(0.15, 0.08);
      
      expect(updated).toEqual({
        phase1_risk_pct: 0.15,
        phase2_risk_pct: 0.08,
      });
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          old_phase1: 0.10,
          new_phase1: 0.15,
          old_phase2: 0.05,
          new_phase2: 0.08,
        }),
        'Risk Tuner updated'
      );
    });

    test('should emit config:changed event on risk tuner update', (done) => {
      // Requirements: 90.4 - Send update to microservice via WebSocket
      configManager.on('config:changed', (data) => {
        expect(data.type).toBe('risk_tuner');
        expect(data.new).toEqual({
          phase1_risk_pct: 0.12,
          phase2_risk_pct: 0.06,
        });
        done();
      });

      configManager.updateRiskTuner(0.12, 0.06);
    });

    test('should reject invalid phase1 risk percentage', () => {
      expect(() => configManager.updateRiskTuner(-0.1, 0.05)).toThrow(
        'phase1_risk_pct must be a number between 0 and 1'
      );
      
      expect(() => configManager.updateRiskTuner(1.5, 0.05)).toThrow(
        'phase1_risk_pct must be a number between 0 and 1'
      );
      
      expect(() => configManager.updateRiskTuner('invalid', 0.05)).toThrow(
        'phase1_risk_pct must be a number between 0 and 1'
      );
    });

    test('should reject invalid phase2 risk percentage', () => {
      expect(() => configManager.updateRiskTuner(0.10, -0.1)).toThrow(
        'phase2_risk_pct must be a number between 0 and 1'
      );
      
      expect(() => configManager.updateRiskTuner(0.10, 1.5)).toThrow(
        'phase2_risk_pct must be a number between 0 and 1'
      );
    });
  });

  describe('Asset Whitelist', () => {
    test('should get default asset whitelist', () => {
      // Requirements: 90.2 - Asset Whitelist multi-select
      const whitelist = configManager.getAssetWhitelist();
      
      expect(whitelist.enabled).toBe(true);
      expect(whitelist.assets).toHaveProperty('BTCUSDT', true);
      expect(whitelist.assets).toHaveProperty('ETHUSDT', true);
      expect(whitelist.disabled_assets).toEqual([]);
    });

    test('should update asset whitelist', () => {
      // Requirements: 90.2 - Enable/Disable specific coins
      const updated = configManager.updateAssetWhitelist({
        'SOLUSDT': false,
        'BNBUSDT': false,
      });
      
      expect(updated.assets.SOLUSDT).toBe(false);
      expect(updated.assets.BNBUSDT).toBe(false);
      expect(configManager.getDisabledAssets()).toContain('SOLUSDT');
      expect(configManager.getDisabledAssets()).toContain('BNBUSDT');
    });

    test('should check if asset is enabled', () => {
      configManager.updateAssetWhitelist({
        'SOLUSDT': false,
      });
      
      expect(configManager.isAssetEnabled('BTCUSDT')).toBe(true);
      expect(configManager.isAssetEnabled('SOLUSDT')).toBe(false);
    });

    test('should validate signal against whitelist', () => {
      // Requirements: 90.5 - Reject signals for disabled assets
      configManager.updateAssetWhitelist({
        'SOLUSDT': false,
      });
      
      const validResult = configManager.validateSignal('BTCUSDT');
      expect(validResult.valid).toBe(true);
      
      const invalidResult = configManager.validateSignal('SOLUSDT');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.reason).toBe('ASSET_DISABLED');
      expect(invalidResult.message).toContain('SOLUSDT');
    });

    test('should allow all assets when whitelist is disabled', () => {
      configManager.updateAssetWhitelist({
        'SOLUSDT': false,
      });
      
      configManager.setWhitelistEnabled(false);
      
      expect(configManager.isAssetEnabled('SOLUSDT')).toBe(true);
      expect(configManager.validateSignal('SOLUSDT').valid).toBe(true);
    });

    test('should emit config:changed event on whitelist update', (done) => {
      // Requirements: 90.4 - Broadcast config changes
      configManager.on('config:changed', (data) => {
        expect(data.type).toBe('asset_whitelist');
        expect(data.disabled_assets).toContain('DOGEUSDT');
        done();
      });

      configManager.updateAssetWhitelist({
        'DOGEUSDT': false,
      });
    });

    test('should reject invalid asset whitelist format', () => {
      expect(() => configManager.updateAssetWhitelist(null)).toThrow(
        'assets must be an object'
      );
      
      expect(() => configManager.updateAssetWhitelist('invalid')).toThrow(
        'assets must be an object'
      );
      
      expect(() => configManager.updateAssetWhitelist({
        'BTCUSDT': 'invalid',
      })).toThrow('Invalid value for BTCUSDT: must be boolean');
    });
  });

  describe('API Keys', () => {
    test('should get API keys status without exposing secrets', () => {
      // Requirements: 90.3 - API Config input fields
      const status = configManager.getApiKeysStatus();
      
      expect(status).toEqual({
        broker: "BYBIT",
        has_api_key: false,
        has_api_secret: false,
        validated: false,
        last_validated: null,
      });
    });

    test('should update and validate API keys', async () => {
      // Requirements: 90.6 - Validate connection before saving
      mockBrokerGateway.testConnection.mockResolvedValue({
        success: true,
        message: 'Connection successful',
      });

      const result = await configManager.updateApiKeys('BYBIT', 'test_api_key', 'test_api_secret');
      
      expect(result.validated).toBe(true);
      expect(result.last_validated).toBeTruthy();
      expect(mockBrokerGateway.testConnection).toHaveBeenCalledWith('test_api_key', 'test_api_secret');
      
      const status = configManager.getApiKeysStatus();
      expect(status.has_api_key).toBe(true);
      expect(status.has_api_secret).toBe(true);
      expect(status.validated).toBe(true);
    });

    test('should reject API keys if validation fails', async () => {
      // Requirements: 90.6 - Validate connection before saving
      mockBrokerGateway.testConnection.mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
      });

      await expect(
        configManager.updateApiKeys('BYBIT', 'bad_key', 'bad_secret')
      ).rejects.toThrow('BYBIT API key validation failed: Invalid credentials');
      
      const status = configManager.getApiKeysStatus();
      expect(status.validated).toBe(false);
    });

    test('should require both API key and secret', async () => {
      await expect(
        configManager.updateApiKeys('BYBIT', '', 'secret')
      ).rejects.toThrow('broker, api_key, and api_secret are required');
      
      await expect(
        configManager.updateApiKeys('BYBIT', 'key', '')
      ).rejects.toThrow('broker, api_key, and api_secret are required');
    });

    test('should emit config:changed event on API keys update', async () => {
      // Requirements: 90.4 - Broadcast config changes
      mockBrokerGateway.testConnection.mockResolvedValue({
        success: true,
      });

      const eventPromise = new Promise((resolve) => {
        configManager.on('config:changed', (data) => {
          expect(data.type).toBe('api_keys');
          expect(data.validated).toBe(true);
          resolve();
        });
      });

      await configManager.updateApiKeys('BYBIT', 'test_key', 'test_secret');
      await eventPromise;
    });

    test('should validate API keys without broker gateway', async () => {
      const configWithoutBroker = new ConfigManager({
        logger: mockLogger,
      });

      const result = await configWithoutBroker.validateApiKeys(
        'test_api_key_long_enough',
        'test_api_secret_long_enough'
      );
      
      expect(result.valid).toBe(true);
      expect(result.message).toContain('connection not tested');
    });

    test('should reject short API keys', async () => {
      const configWithoutBroker = new ConfigManager({
        logger: mockLogger,
      });

      const result1 = await configWithoutBroker.validateApiKeys('short', 'test_secret_long');
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('minimum 10 characters required');
      
      const result2 = await configWithoutBroker.validateApiKeys('test_key_long', 'short');
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('minimum 10 characters required');
    });
  });

  describe('Configuration Management', () => {
    test('should get full configuration without exposing secrets', () => {
      const config = configManager.getConfig();
      
      expect(config.risk_tuner).toBeDefined();
      expect(config.asset_whitelist).toBeDefined();
      expect(config.api_keys).toBeDefined();
      expect(config.api_keys.mexc_api_key).toBe(null);
      expect(config.api_keys.mexc_api_secret).toBe(null);
    });

    test('should mask API keys in config response', async () => {
      mockBrokerGateway.testConnection.mockResolvedValue({ success: true });
      
      await configManager.updateApiKeys('BYBIT', 'real_key', 'real_secret');
      
      const config = configManager.getConfig();
      expect(config.api_keys.bybit_api_key).toBe('***');
      expect(config.api_keys.bybit_api_secret).toBe('***');
    });

    test('should reset configuration to defaults', () => {
      configManager.updateRiskTuner(0.20, 0.10);
      configManager.updateAssetWhitelist({ 'BTCUSDT': false });
      
      configManager.reset();
      
      const config = configManager.getConfig();
      expect(config.risk_tuner.phase1_risk_pct).toBe(0.10);
      expect(config.risk_tuner.phase2_risk_pct).toBe(0.05);
      expect(config.asset_whitelist.assets.BTCUSDT).toBe(true);
    });

    test('should emit config:changed event on reset', (done) => {
      configManager.on('config:changed', (data) => {
        expect(data.type).toBe('reset');
        done();
      });

      configManager.reset();
    });
  });

  describe('Whitelist Enforcement', () => {
    test('should enable/disable whitelist enforcement', () => {
      expect(configManager.setWhitelistEnabled(false)).toBe(false);
      expect(configManager.setWhitelistEnabled(true)).toBe(true);
    });

    test('should emit config:changed event on whitelist enforcement change', (done) => {
      configManager.on('config:changed', (data) => {
        expect(data.type).toBe('whitelist_enabled');
        expect(data.new).toBe(false);
        done();
      });

      configManager.setWhitelistEnabled(false);
    });

    test('should reject invalid whitelist enabled value', () => {
      expect(() => configManager.setWhitelistEnabled('invalid')).toThrow(
        'enabled must be a boolean'
      );
    });
  });

  describe('Disabled Assets Tracking', () => {
    test('should track disabled assets', () => {
      configManager.updateAssetWhitelist({
        'SOLUSDT': false,
        'DOGEUSDT': false,
        'XRPUSDT': false,
      });
      
      const disabled = configManager.getDisabledAssets();
      expect(disabled).toHaveLength(3);
      expect(disabled).toContain('SOLUSDT');
      expect(disabled).toContain('DOGEUSDT');
      expect(disabled).toContain('XRPUSDT');
    });

    test('should update disabled assets cache on whitelist change', () => {
      configManager.updateAssetWhitelist({ 'BTCUSDT': false });
      expect(configManager.getDisabledAssets()).toContain('BTCUSDT');
      
      configManager.updateAssetWhitelist({ 'BTCUSDT': true });
      expect(configManager.getDisabledAssets()).not.toContain('BTCUSDT');
    });
  });
});
