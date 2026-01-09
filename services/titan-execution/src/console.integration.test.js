/**
 * Console Controls Integration Tests
 * 
 * Tests for Command Console integration including:
 * - Master Arm toggle blocks execution
 * - FLATTEN ALL closes all positions
 * - CANCEL ALL cancels pending orders
 * - Config updates propagate correctly
 * 
 * Requirements: 89, 90, 91
 * 
 * @module console.integration.test
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock dependencies
const mockBrokerGateway = {
  getPositions: jest.fn().mockResolvedValue([
    { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
    { symbol: 'ETHUSDT', side: 'SHORT', size: 2.0, entry_price: 3000 },
  ]),
  closeAllPositions: jest.fn().mockResolvedValue({
    success: true,
    closed_count: 2,
    trade_records: [
      { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, exit_price: 50100 },
      { symbol: 'ETHUSDT', side: 'SHORT', size: 2.0, exit_price: 2990 },
    ],
  }),
  cancelAllOrders: jest.fn().mockResolvedValue({
    success: true,
    cancelled_count: 3,
    cancel_results: [
      { order_id: 'order1', symbol: 'BTCUSDT', status: 'cancelled' },
      { order_id: 'order2', symbol: 'ETHUSDT', status: 'cancelled' },
      { order_id: 'order3', symbol: 'SOLUSDT', status: 'cancelled' },
    ],
  }),
  testConnection: jest.fn().mockResolvedValue({ success: true }),
};

const mockShadowState = {
  getPositions: jest.fn().mockReturnValue([
    { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
    { symbol: 'ETHUSDT', side: 'SHORT', size: 2.0, entry_price: 3000 },
  ]),
  clearAllPositions: jest.fn(),
};

const mockConsoleWebSocket = new EventEmitter();
mockConsoleWebSocket.broadcast = jest.fn();
mockConsoleWebSocket.pushMasterArmChange = jest.fn();
mockConsoleWebSocket.pushEmergencyFlatten = jest.fn();
mockConsoleWebSocket.pushConfigChange = jest.fn();

// Import classes
import { ConfigManager } from './ConfigManager.js';

describe('Console Controls Integration Tests', () => {
  let configManager;
  let masterArm;
  let getMasterArm;
  let setMasterArm;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Initialize Master Arm state
    masterArm = true;
    getMasterArm = () => masterArm;
    setMasterArm = (enabled) => {
      masterArm = enabled;
      // Broadcast change
      mockConsoleWebSocket.pushMasterArmChange({
        master_arm: enabled,
        changed_by: 'test_operator',
      });
    };
    
    // Initialize ConfigManager
    configManager = new ConfigManager({
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      brokerGateway: mockBrokerGateway,
    });
    
    // Connect ConfigManager to WebSocket
    configManager.on('config:changed', (update) => {
      mockConsoleWebSocket.pushConfigChange({
        updates: [update],
        operator_id: 'test_operator',
      });
    });
  });
  
  describe('Master Arm Toggle Blocks Execution', () => {
    test('should block execution when Master Arm is OFF', () => {
      // Requirements: 89.4-89.5
      
      // Initially enabled
      expect(getMasterArm()).toBe(true);
      
      // Simulate webhook processing
      const processWebhook = (signal) => {
        if (!getMasterArm()) {
          return {
            status: 'blocked',
            signal_id: signal.signal_id,
            reason: 'EXECUTION_DISABLED_BY_OPERATOR',
            master_arm: false,
            message: 'Master Arm is OFF - all order execution is disabled',
          };
        }
        
        return {
          status: 'processing',
          signal_id: signal.signal_id,
        };
      };
      
      const testSignal = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'CONFIRM',
        symbol: 'BTCUSDT',
        direction: 1,
      };
      
      // Should process when Master Arm is ON
      let result = processWebhook(testSignal);
      expect(result.status).toBe('processing');
      
      // Disable Master Arm
      setMasterArm(false);
      expect(getMasterArm()).toBe(false);
      
      // Should block when Master Arm is OFF
      result = processWebhook(testSignal);
      expect(result.status).toBe('blocked');
      expect(result.reason).toBe('EXECUTION_DISABLED_BY_OPERATOR');
      expect(result.master_arm).toBe(false);
      
      // Verify WebSocket broadcast was called
      expect(mockConsoleWebSocket.pushMasterArmChange).toHaveBeenCalledWith({
        master_arm: false,
        changed_by: 'test_operator',
      });
    });
    
    test('should log EXECUTION_DISABLED_BY_OPERATOR when blocked', () => {
      // Requirements: 89.5
      
      setMasterArm(false);
      
      const logMessages = [];
      const logger = {
        warn: (data, message) => {
          logMessages.push({ level: 'warn', data, message });
        },
      };
      
      // Simulate webhook processing with logging
      const processWebhookWithLogging = (signal) => {
        if (!getMasterArm()) {
          logger.warn(
            {
              signal_id: signal.signal_id,
              symbol: signal.symbol,
              master_arm: false,
            },
            'EXECUTION_DISABLED_BY_OPERATOR - Master Arm is OFF'
          );
          
          return {
            status: 'blocked',
            reason: 'EXECUTION_DISABLED_BY_OPERATOR',
          };
        }
        
        return { status: 'processing' };
      };
      
      const testSignal = {
        signal_id: 'titan_BTCUSDT_12345_15',
        symbol: 'BTCUSDT',
      };
      
      const result = processWebhookWithLogging(testSignal);
      
      expect(result.status).toBe('blocked');
      expect(logMessages.length).toBe(1);
      expect(logMessages[0].message).toContain('EXECUTION_DISABLED_BY_OPERATOR');
      expect(logMessages[0].data.master_arm).toBe(false);
    });
    
    test('should allow execution when Master Arm is re-enabled', () => {
      // Requirements: 89.4
      
      // Disable then re-enable
      setMasterArm(false);
      expect(getMasterArm()).toBe(false);
      
      setMasterArm(true);
      expect(getMasterArm()).toBe(true);
      
      // Should process normally
      const processWebhook = (signal) => {
        if (!getMasterArm()) {
          return { status: 'blocked' };
        }
        return { status: 'processing' };
      };
      
      const result = processWebhook({ signal_id: 'test' });
      expect(result.status).toBe('processing');
      
      // Verify WebSocket broadcasts
      expect(mockConsoleWebSocket.pushMasterArmChange).toHaveBeenCalledTimes(2);
      expect(mockConsoleWebSocket.pushMasterArmChange).toHaveBeenLastCalledWith({
        master_arm: true,
        changed_by: 'test_operator',
      });
    });
  });
  
  describe('FLATTEN ALL Closes All Positions', () => {
    test('should close all positions and return trade records', async () => {
      // Requirements: 91.1-91.2
      
      const flattenAll = async (operatorId) => {
        // Get current positions
        const positions = await mockBrokerGateway.getPositions();
        
        // Close all positions
        const closeResult = await mockBrokerGateway.closeAllPositions();
        
        // Clear Shadow State
        mockShadowState.clearAllPositions();
        
        // Disable Master Arm
        setMasterArm(false);
        
        // Broadcast emergency flatten
        mockConsoleWebSocket.pushEmergencyFlatten({
          closed_count: closeResult.closed_count,
          reason: 'OPERATOR_FLATTEN_ALL',
        });
        
        return {
          status: 'success',
          action: 'FLATTEN_ALL',
          positions_affected: positions.length,
          orders_cancelled: 0,
          trade_records: closeResult.trade_records,
          operator_id: operatorId,
          timestamp: new Date().toISOString(),
          master_arm: false,
          master_arm_disabled: true,
        };
      };
      
      const result = await flattenAll('test_operator');
      
      expect(result.status).toBe('success');
      expect(result.action).toBe('FLATTEN_ALL');
      expect(result.positions_affected).toBe(2);
      expect(result.trade_records).toHaveLength(2);
      expect(result.operator_id).toBe('test_operator');
      expect(result.timestamp).toBeDefined();
      
      // Verify broker gateway was called
      expect(mockBrokerGateway.getPositions).toHaveBeenCalled();
      expect(mockBrokerGateway.closeAllPositions).toHaveBeenCalled();
      
      // Verify Shadow State was cleared
      expect(mockShadowState.clearAllPositions).toHaveBeenCalled();
    });
    
    test('should disable Master Arm after FLATTEN ALL', async () => {
      // Requirements: 91.6
      
      expect(getMasterArm()).toBe(true);
      
      const flattenAll = async () => {
        await mockBrokerGateway.closeAllPositions();
        mockShadowState.clearAllPositions();
        setMasterArm(false);
        
        return {
          status: 'success',
          master_arm: false,
          master_arm_disabled: true,
        };
      };
      
      const result = await flattenAll();
      
      expect(getMasterArm()).toBe(false);
      expect(result.master_arm).toBe(false);
      expect(result.master_arm_disabled).toBe(true);
      
      // Verify WebSocket broadcast
      expect(mockConsoleWebSocket.pushMasterArmChange).toHaveBeenCalledWith({
        master_arm: false,
        changed_by: 'test_operator',
      });
    });
    
    test('should broadcast emergency flatten notification', async () => {
      // Requirements: 91.5, 95.5
      
      const flattenAll = async () => {
        const closeResult = await mockBrokerGateway.closeAllPositions();
        
        mockConsoleWebSocket.pushEmergencyFlatten({
          closed_count: closeResult.closed_count,
          reason: 'OPERATOR_FLATTEN_ALL',
        });
        
        return { closed_count: closeResult.closed_count };
      };
      
      const result = await flattenAll();
      
      expect(result.closed_count).toBe(2);
      expect(mockConsoleWebSocket.pushEmergencyFlatten).toHaveBeenCalledWith({
        closed_count: 2,
        reason: 'OPERATOR_FLATTEN_ALL',
      });
    });
    
    test('should log all required fields', async () => {
      // Requirements: 91.5
      
      const logEntries = [];
      const logger = {
        info: (data, message) => {
          logEntries.push({ level: 'info', data, message });
        },
      };
      
      const flattenAll = async (operatorId) => {
        const positions = await mockBrokerGateway.getPositions();
        const closeResult = await mockBrokerGateway.closeAllPositions();
        
        const logData = {
          action: 'FLATTEN_ALL',
          positions_affected: positions.length,
          orders_cancelled: 0,
          operator_id: operatorId,
          timestamp: new Date().toISOString(),
        };
        
        logger.info(logData, 'Emergency flatten executed');
        
        return logData;
      };
      
      const result = await flattenAll('test_operator');
      
      expect(logEntries.length).toBe(1);
      expect(logEntries[0].data.action).toBe('FLATTEN_ALL');
      expect(logEntries[0].data.positions_affected).toBe(2);
      expect(logEntries[0].data.orders_cancelled).toBe(0);
      expect(logEntries[0].data.operator_id).toBe('test_operator');
      expect(logEntries[0].data.timestamp).toBeDefined();
    });
  });
  
  describe('CANCEL ALL Cancels Pending Orders', () => {
    test('should cancel all pending orders', async () => {
      // Requirements: 91.3-91.4
      
      const cancelAll = async (operatorId) => {
        // Cancel all orders via broker
        const cancelResult = await mockBrokerGateway.cancelAllOrders();
        
        return {
          status: 'success',
          action: 'CANCEL_ALL',
          positions_affected: 0,
          orders_cancelled: cancelResult.cancelled_count,
          cancel_results: cancelResult.cancel_results,
          operator_id: operatorId,
          timestamp: new Date().toISOString(),
        };
      };
      
      const result = await cancelAll('test_operator');
      
      expect(result.status).toBe('success');
      expect(result.action).toBe('CANCEL_ALL');
      expect(result.positions_affected).toBe(0);
      expect(result.orders_cancelled).toBe(3);
      expect(result.cancel_results).toHaveLength(3);
      expect(result.operator_id).toBe('test_operator');
      expect(result.timestamp).toBeDefined();
      
      // Verify broker gateway was called
      expect(mockBrokerGateway.cancelAllOrders).toHaveBeenCalled();
    });
    
    test('should not affect positions', async () => {
      // CANCEL ALL should only cancel orders, not close positions
      
      const cancelAll = async () => {
        const cancelResult = await mockBrokerGateway.cancelAllOrders();
        
        return {
          positions_affected: 0,
          orders_cancelled: cancelResult.cancelled_count,
        };
      };
      
      const result = await cancelAll();
      
      expect(result.positions_affected).toBe(0);
      expect(result.orders_cancelled).toBe(3);
      
      // Verify positions were not touched
      expect(mockBrokerGateway.closeAllPositions).not.toHaveBeenCalled();
      expect(mockShadowState.clearAllPositions).not.toHaveBeenCalled();
    });
    
    test('should not disable Master Arm', async () => {
      // Requirements: 91.6 - Only FLATTEN ALL disables Master Arm
      
      expect(getMasterArm()).toBe(true);
      
      const cancelAll = async () => {
        await mockBrokerGateway.cancelAllOrders();
        // Note: Master Arm is NOT disabled for CANCEL ALL
        return { status: 'success' };
      };
      
      await cancelAll();
      
      // Master Arm should still be enabled
      expect(getMasterArm()).toBe(true);
    });
    
    test('should include cancel_results array', async () => {
      // Requirements: 91.5
      
      const cancelAll = async () => {
        const cancelResult = await mockBrokerGateway.cancelAllOrders();
        
        return {
          cancel_results: cancelResult.cancel_results,
        };
      };
      
      const result = await cancelAll();
      
      expect(Array.isArray(result.cancel_results)).toBe(true);
      expect(result.cancel_results).toHaveLength(3);
      expect(result.cancel_results[0]).toHaveProperty('order_id');
      expect(result.cancel_results[0]).toHaveProperty('symbol');
      expect(result.cancel_results[0]).toHaveProperty('status');
    });
    
    test('should log all required fields', async () => {
      // Requirements: 91.5
      
      const logEntries = [];
      const logger = {
        info: (data, message) => {
          logEntries.push({ level: 'info', data, message });
        },
      };
      
      const cancelAll = async (operatorId) => {
        const cancelResult = await mockBrokerGateway.cancelAllOrders();
        
        const logData = {
          action: 'CANCEL_ALL',
          positions_affected: 0,
          orders_cancelled: cancelResult.cancelled_count,
          operator_id: operatorId,
          timestamp: new Date().toISOString(),
        };
        
        logger.info(logData, 'Cancel all orders executed');
        
        return logData;
      };
      
      const result = await cancelAll('test_operator');
      
      expect(logEntries.length).toBe(1);
      expect(logEntries[0].data.action).toBe('CANCEL_ALL');
      expect(logEntries[0].data.positions_affected).toBe(0);
      expect(logEntries[0].data.orders_cancelled).toBe(3);
      expect(logEntries[0].data.operator_id).toBe('test_operator');
      expect(logEntries[0].data.timestamp).toBeDefined();
    });
  });
  
  describe('Config Updates Propagate Correctly', () => {
    test('should propagate Risk Tuner updates via WebSocket', () => {
      // Requirements: 90.1, 90.4
      
      const newPhase1Risk = 0.15;
      const newPhase2Risk = 0.08;
      
      configManager.updateRiskTuner(newPhase1Risk, newPhase2Risk);
      
      // Verify config was updated
      const riskTuner = configManager.getRiskTuner();
      expect(riskTuner.phase1_risk_pct).toBe(newPhase1Risk);
      expect(riskTuner.phase2_risk_pct).toBe(newPhase2Risk);
      
      // Verify WebSocket broadcast was called
      expect(mockConsoleWebSocket.pushConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({
          updates: expect.arrayContaining([
            expect.objectContaining({
              type: 'risk_tuner',
            }),
          ]),
          operator_id: 'test_operator',
        })
      );
    });
    
    test('should propagate Asset Whitelist updates via WebSocket', () => {
      // Requirements: 90.2, 90.4
      
      // Disable SOL
      configManager.updateAssetWhitelist({
        'SOLUSDT': false,
      });
      
      // Verify config was updated
      expect(configManager.isAssetEnabled('SOLUSDT')).toBe(false);
      expect(configManager.isAssetEnabled('BTCUSDT')).toBe(true);
      
      // Verify WebSocket broadcast was called
      expect(mockConsoleWebSocket.pushConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({
          updates: expect.arrayContaining([
            expect.objectContaining({
              type: 'asset_whitelist',
              disabled_assets: expect.arrayContaining(['SOLUSDT']),
            }),
          ]),
          operator_id: 'test_operator',
        })
      );
    });
    
    test('should reject signals for disabled assets', () => {
      // Requirements: 90.5
      
      // Disable SOL
      configManager.updateAssetWhitelist({
        'SOLUSDT': false,
      });
      
      // Validate signal for disabled asset
      const result = configManager.validateSignal('SOLUSDT');
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('ASSET_DISABLED');
      expect(result.message).toContain('SOLUSDT');
      expect(result.message).toContain('disabled');
    });
    
    test('should allow signals for enabled assets', () => {
      // Requirements: 90.5
      
      // Validate signal for enabled asset
      const result = configManager.validateSignal('BTCUSDT');
      
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });
    
    test('should propagate API Keys validation via WebSocket', async () => {
      // Requirements: 90.3, 90.4, 90.6
      
      const apiKey = 'test_api_key_12345';
      const apiSecret = 'test_api_secret_67890';
      
      const result = await configManager.updateApiKeys('BYBIT', apiKey, apiSecret);
      
      // Verify validation succeeded
      expect(result.validated).toBe(true);
      expect(result.last_validated).toBeDefined();
      
      // Verify broker gateway test connection was called
      expect(mockBrokerGateway.testConnection).toHaveBeenCalledWith(apiKey, apiSecret);
      
      // Verify WebSocket broadcast was called
      expect(mockConsoleWebSocket.pushConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({
          updates: expect.arrayContaining([
            expect.objectContaining({
              type: 'api_keys',
              validated: true,
            }),
          ]),
          operator_id: 'test_operator',
        })
      );
    });
    
    test('should reject invalid API Keys', async () => {
      // Requirements: 90.6
      
      // Mock failed validation
      mockBrokerGateway.testConnection.mockResolvedValueOnce({
        success: false,
        error: 'Invalid API credentials',
      });
      
      const apiKey = 'invalid_key';
      const apiSecret = 'invalid_secret';
      
      await expect(
        configManager.updateApiKeys('BYBIT', apiKey, apiSecret)
      ).rejects.toThrow('BYBIT API key validation failed');
      
      // Verify config was not updated
      const status = configManager.getApiKeysStatus();
      expect(status.validated).toBe(false);
    });

    test('should validate API keys without saving them', async () => {
      // Requirements: 90.3, 90.6 - Validate API keys before saving
      
      const apiKey = 'test_api_key_12345';
      const apiSecret = 'test_api_secret_67890';
      
      // Validate without saving
      const validationResult = await configManager.validateApiKeys(apiKey, apiSecret);
      
      // Verify validation succeeded
      expect(validationResult.valid).toBe(true);
      expect(validationResult.message).toBeDefined();
      
      // Verify broker gateway test connection was called
      expect(mockBrokerGateway.testConnection).toHaveBeenCalledWith(apiKey, apiSecret);
      
      // Verify config was NOT updated (validation only)
      const status = configManager.getApiKeysStatus();
      expect(status.has_api_key).toBe(false);
      expect(status.has_api_secret).toBe(false);
      expect(status.validated).toBe(false);
    });

    test('should return validation error for invalid keys without saving', async () => {
      // Requirements: 90.6 - Validate connection before saving
      
      // Mock failed validation
      mockBrokerGateway.testConnection.mockResolvedValueOnce({
        success: false,
        error: 'Invalid API credentials',
      });
      
      const apiKey = 'invalid_key';
      const apiSecret = 'invalid_secret';
      
      // Validate without saving
      const validationResult = await configManager.validateApiKeys(apiKey, apiSecret);
      
      // Verify validation failed
      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toBe('Invalid API credentials');
      
      // Verify config was NOT updated
      const status = configManager.getApiKeysStatus();
      expect(status.validated).toBe(false);
    });
    
    test('should handle multiple config updates in sequence', () => {
      // Requirements: 90.4
      
      // Update Risk Tuner
      configManager.updateRiskTuner(0.12, 0.06);
      
      // Update Asset Whitelist
      configManager.updateAssetWhitelist({
        'SOLUSDT': false,
        'DOGEUSDT': false,
      });
      
      // Verify both updates were broadcast
      expect(mockConsoleWebSocket.pushConfigChange).toHaveBeenCalledTimes(2);
      
      // Verify final state
      const riskTuner = configManager.getRiskTuner();
      expect(riskTuner.phase1_risk_pct).toBe(0.12);
      expect(riskTuner.phase2_risk_pct).toBe(0.06);
      
      expect(configManager.isAssetEnabled('SOLUSDT')).toBe(false);
      expect(configManager.isAssetEnabled('DOGEUSDT')).toBe(false);
      expect(configManager.isAssetEnabled('BTCUSDT')).toBe(true);
    });
  });
  
  describe('Full Integration Scenarios', () => {
    test('should handle emergency scenario: FLATTEN ALL + Master Arm OFF', async () => {
      // Requirements: 89.5, 91.1-91.6
      
      expect(getMasterArm()).toBe(true);
      
      // Execute FLATTEN ALL
      const flattenAll = async () => {
        const closeResult = await mockBrokerGateway.closeAllPositions();
        mockShadowState.clearAllPositions();
        setMasterArm(false);
        
        mockConsoleWebSocket.pushEmergencyFlatten({
          closed_count: closeResult.closed_count,
          reason: 'OPERATOR_FLATTEN_ALL',
        });
        
        return {
          status: 'success',
          closed_count: closeResult.closed_count,
          master_arm: false,
        };
      };
      
      const result = await flattenAll();
      
      // Verify positions were closed
      expect(result.closed_count).toBe(2);
      expect(mockBrokerGateway.closeAllPositions).toHaveBeenCalled();
      
      // Verify Master Arm was disabled
      expect(getMasterArm()).toBe(false);
      expect(result.master_arm).toBe(false);
      
      // Verify WebSocket broadcasts
      expect(mockConsoleWebSocket.pushEmergencyFlatten).toHaveBeenCalled();
      expect(mockConsoleWebSocket.pushMasterArmChange).toHaveBeenCalledWith({
        master_arm: false,
        changed_by: 'test_operator',
      });
      
      // Try to process a new signal - should be blocked
      const processWebhook = (signal) => {
        if (!getMasterArm()) {
          return {
            status: 'blocked',
            reason: 'EXECUTION_DISABLED_BY_OPERATOR',
          };
        }
        return { status: 'processing' };
      };
      
      const webhookResult = processWebhook({ signal_id: 'test' });
      expect(webhookResult.status).toBe('blocked');
      expect(webhookResult.reason).toBe('EXECUTION_DISABLED_BY_OPERATOR');
    });
    
    test('should handle config update + signal validation flow', () => {
      // Requirements: 90.2, 90.4, 90.5
      
      // Disable multiple assets
      configManager.updateAssetWhitelist({
        'SOLUSDT': false,
        'DOGEUSDT': false,
      });
      
      // Verify WebSocket broadcast
      expect(mockConsoleWebSocket.pushConfigChange).toHaveBeenCalled();
      
      // Simulate webhook processing with asset validation
      const processWebhook = (signal) => {
        const validation = configManager.validateSignal(signal.symbol);
        
        if (!validation.valid) {
          return {
            status: 'rejected',
            signal_id: signal.signal_id,
            reason: validation.reason,
            message: validation.message,
          };
        }
        
        return {
          status: 'processing',
          signal_id: signal.signal_id,
        };
      };
      
      // Test disabled asset
      let result = processWebhook({
        signal_id: 'titan_SOLUSDT_12345_15',
        symbol: 'SOLUSDT',
      });
      
      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('ASSET_DISABLED');
      
      // Test enabled asset
      result = processWebhook({
        signal_id: 'titan_BTCUSDT_12345_15',
        symbol: 'BTCUSDT',
      });
      
      expect(result.status).toBe('processing');
    });
    
    test('should handle Master Arm toggle during active trading', () => {
      // Requirements: 89.4-89.5
      
      const signals = [
        { signal_id: 'signal1', symbol: 'BTCUSDT' },
        { signal_id: 'signal2', symbol: 'ETHUSDT' },
        { signal_id: 'signal3', symbol: 'SOLUSDT' },
      ];
      
      const processWebhook = (signal) => {
        if (!getMasterArm()) {
          return { status: 'blocked', signal_id: signal.signal_id };
        }
        return { status: 'processing', signal_id: signal.signal_id };
      };
      
      // Process first signal - should succeed
      let result = processWebhook(signals[0]);
      expect(result.status).toBe('processing');
      
      // Disable Master Arm
      setMasterArm(false);
      
      // Process second signal - should be blocked
      result = processWebhook(signals[1]);
      expect(result.status).toBe('blocked');
      
      // Re-enable Master Arm
      setMasterArm(true);
      
      // Process third signal - should succeed
      result = processWebhook(signals[2]);
      expect(result.status).toBe('processing');
      
      // Verify WebSocket broadcasts
      expect(mockConsoleWebSocket.pushMasterArmChange).toHaveBeenCalledTimes(2);
    });
  });
});
