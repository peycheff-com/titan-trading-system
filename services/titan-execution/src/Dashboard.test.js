/**
 * Dashboard Tests
 * 
 * Tests for the Ink Terminal Dashboard component and DashboardManager.
 * 
 * Requirements: 49.1-49.7
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock ink before importing Dashboard
jest.unstable_mockModule('ink', () => ({
  render: jest.fn(() => ({ unmount: jest.fn() })),
  Box: ({ children }) => children,
  Text: ({ children }) => children,
  Newline: () => null,
  useInput: jest.fn(),
  useApp: () => ({ exit: jest.fn() }),
}));

// Import after mocking
const { dashboardBus, DashboardManager } = await import('./Dashboard.js');

describe('Dashboard', () => {
  beforeEach(() => {
    // Clear all event listeners between tests
    dashboardBus.removeAllListeners();
  });

  describe('dashboardBus', () => {
    test('should be an EventEmitter instance', () => {
      expect(dashboardBus).toBeInstanceOf(EventEmitter);
    });

    test('should emit and receive log events', (done) => {
      const logData = { level: 'INFO', message: 'Test message' };
      
      dashboardBus.once('log', (data) => {
        expect(data).toEqual(logData);
        done();
      });
      
      dashboardBus.emit('log', logData);
    });

    test('should emit and receive position events', (done) => {
      const position = {
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0.5,
        entry_price: 50000,
      };
      
      dashboardBus.once('position:opened', (data) => {
        expect(data).toEqual(position);
        done();
      });
      
      dashboardBus.emit('position:opened', position);
    });

    test('should emit and receive webhook events', (done) => {
      // Requirement 49.7: Flash notification on webhook receive
      const webhook = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
      };
      
      dashboardBus.once('webhook:received', (data) => {
        expect(data).toEqual(webhook);
        done();
      });
      
      dashboardBus.emit('webhook:received', webhook);
    });

    test('should emit and receive regime update events', (done) => {
      // Requirement 49.5: Display regime_state, market_structure_score, hurst, entropy
      const regime = {
        regime_state: 1,
        market_structure_score: 85,
        hurst: 0.65,
        entropy: 0.3,
        model_recommendation: 'TREND_FOLLOW',
      };
      
      dashboardBus.once('regime:update', (data) => {
        expect(data).toEqual(regime);
        done();
      });
      
      dashboardBus.emit('regime:update', regime);
    });

    test('should emit and receive health update events', (done) => {
      // Requirement 49.6: Display last_heartbeat, z_score_drift, broker_connection_status
      const health = {
        last_heartbeat: new Date().toISOString(),
        z_score: -0.5,
        broker_connected: true,
        auto_execution_enabled: true,
      };
      
      dashboardBus.once('health:update', (data) => {
        expect(data).toEqual(health);
        done();
      });
      
      dashboardBus.emit('health:update', health);
    });
  });

  describe('DashboardManager', () => {
    let manager;
    let mockShadowState;
    let mockHeartbeat;
    let mockZScoreDrift;

    beforeEach(() => {
      // Create mock components with EventEmitter
      mockShadowState = new EventEmitter();
      mockHeartbeat = new EventEmitter();
      mockZScoreDrift = new EventEmitter();
      
      manager = new DashboardManager({
        shadowState: mockShadowState,
        heartbeat: mockHeartbeat,
        zScoreDrift: mockZScoreDrift,
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
      });
    });

    afterEach(() => {
      if (manager.isRunning()) {
        manager.stop();
      }
    });

    test('should create DashboardManager instance', () => {
      expect(manager).toBeInstanceOf(DashboardManager);
      expect(manager.isRunning()).toBe(false);
    });

    test('should start and stop dashboard', async () => {
      await manager.start();
      expect(manager.isRunning()).toBe(true);
      
      manager.stop();
      expect(manager.isRunning()).toBe(false);
    });

    test('should not start twice', async () => {
      await manager.start();
      await manager.start(); // Should warn but not error
      expect(manager.isRunning()).toBe(true);
    });

    test('should log messages to dashboard bus', async () => {
      await manager.start();
      
      const logPromise = new Promise((resolve) => {
        dashboardBus.once('log', resolve);
      });
      
      manager.log('INFO', 'Test message', { key: 'value' });
      
      const logData = await logPromise;
      expect(logData.level).toBe('INFO');
      expect(logData.message).toBe('Test message');
      expect(logData.data).toEqual({ key: 'value' });
    });

    test('should update regime display', async () => {
      await manager.start();
      
      const regimePromise = new Promise((resolve) => {
        dashboardBus.once('regime:update', resolve);
      });
      
      const regime = {
        regime_state: 1,
        market_structure_score: 75,
        hurst: 0.6,
        entropy: 0.4,
      };
      
      manager.updateRegime(regime);
      
      const regimeData = await regimePromise;
      expect(regimeData).toEqual(regime);
    });

    test('should update health display', async () => {
      await manager.start();
      
      const healthPromise = new Promise((resolve) => {
        dashboardBus.once('health:update', resolve);
      });
      
      const health = {
        last_heartbeat: new Date().toISOString(),
        z_score: -1.5,
        broker_connected: true,
      };
      
      manager.updateHealth(health);
      
      const healthData = await healthPromise;
      expect(healthData).toEqual(health);
    });

    test('should update stats display', async () => {
      await manager.start();
      
      const statsPromise = new Promise((resolve) => {
        dashboardBus.once('stats:update', resolve);
      });
      
      const stats = {
        trade_count: 10,
        win_rate: 0.6,
        total_pnl: 500,
      };
      
      manager.updateStats(stats);
      
      const statsData = await statsPromise;
      expect(statsData).toEqual(stats);
    });

    test('should update price for symbol', async () => {
      await manager.start();
      
      const pricePromise = new Promise((resolve) => {
        dashboardBus.once('price:update', resolve);
      });
      
      manager.updatePrice('BTCUSDT', 51000);
      
      const priceData = await pricePromise;
      expect(priceData).toEqual({ symbol: 'BTCUSDT', price: 51000 });
    });

    test('should notify webhook received', async () => {
      // Requirement 49.7: Flash notification on webhook receive
      await manager.start();
      
      const webhookPromise = new Promise((resolve) => {
        dashboardBus.once('webhook:received', resolve);
      });
      
      const webhook = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'CONFIRM',
        symbol: 'BTCUSDT',
      };
      
      manager.notifyWebhook(webhook);
      
      const webhookData = await webhookPromise;
      expect(webhookData).toEqual(webhook);
    });

    describe('Event Bridging', () => {
      // Requirement 49.2: Emit to internal EventEmitter bus for UI updates
      
      test('should bridge ShadowState position:opened events', async () => {
        await manager.start();
        
        const positionPromise = new Promise((resolve) => {
          dashboardBus.once('position:opened', resolve);
        });
        
        const position = {
          symbol: 'ETHUSDT',
          side: 'SHORT',
          size: 1.0,
          entry_price: 3000,
        };
        
        mockShadowState.emit('position:opened', position);
        
        const positionData = await positionPromise;
        expect(positionData).toEqual(position);
      });

      test('should bridge ShadowState position:closed events', async () => {
        await manager.start();
        
        const tradePromise = new Promise((resolve) => {
          dashboardBus.once('position:closed', resolve);
        });
        
        const trade = {
          symbol: 'BTCUSDT',
          side: 'LONG',
          pnl: 100,
          pnl_pct: 2.5,
        };
        
        mockShadowState.emit('position:closed', trade);
        
        const tradeData = await tradePromise;
        expect(tradeData).toEqual(trade);
      });

      test('should bridge ShadowState intent:processed events as webhook:received', async () => {
        await manager.start();
        
        const webhookPromise = new Promise((resolve) => {
          dashboardBus.once('webhook:received', resolve);
        });
        
        const intent = {
          signal_id: 'titan_BTCUSDT_99999_15',
          type: 'BUY_SETUP',
          symbol: 'BTCUSDT',
        };
        
        mockShadowState.emit('intent:processed', intent);
        
        const webhookData = await webhookPromise;
        expect(webhookData.signal_id).toBe(intent.signal_id);
        expect(webhookData.type).toBe(intent.type);
        expect(webhookData.symbol).toBe(intent.symbol);
      });

      test('should bridge Heartbeat heartbeat_received events', async () => {
        await manager.start();
        
        const heartbeatPromise = new Promise((resolve) => {
          dashboardBus.once('heartbeat:received', resolve);
        });
        
        const heartbeatData = {
          received_at: new Date().toISOString(),
          pine_timestamp: new Date().toISOString(),
        };
        
        mockHeartbeat.emit('heartbeat_received', heartbeatData);
        
        const data = await heartbeatPromise;
        expect(data).toEqual(heartbeatData);
      });

      test('should bridge Heartbeat heartbeat_missed events', async () => {
        await manager.start();
        
        const missedPromise = new Promise((resolve) => {
          dashboardBus.once('heartbeat:missed', resolve);
        });
        
        const missedData = {
          missed_count: 2,
          time_since_last_ms: 130000,
        };
        
        mockHeartbeat.emit('heartbeat_missed', missedData);
        
        const data = await missedPromise;
        expect(data).toEqual(missedData);
      });

      test('should bridge Heartbeat emergency_flatten events', async () => {
        await manager.start();
        
        const emergencyPromise = new Promise((resolve) => {
          dashboardBus.once('emergency_flatten', resolve);
        });
        
        const emergencyData = {
          reason: 'DEAD_MANS_SWITCH',
          missed_heartbeat_count: 3,
          positions_closed: 2,
        };
        
        mockHeartbeat.emit('emergency_flatten', emergencyData);
        
        const data = await emergencyPromise;
        expect(data).toEqual(emergencyData);
      });

      test('should bridge ZScoreDrift safety_stop events', async () => {
        await manager.start();
        
        const safetyPromise = new Promise((resolve) => {
          dashboardBus.once('safety_stop', resolve);
        });
        
        const safetyData = {
          z_score: -2.5,
          recent_pnl_mean: -50,
          expected_mean: 10,
        };
        
        mockZScoreDrift.emit('safety_stop', safetyData);
        
        const data = await safetyPromise;
        expect(data).toEqual(safetyData);
      });

      test('should bridge ZScoreDrift hard_kill events', async () => {
        await manager.start();
        
        const hardKillPromise = new Promise((resolve) => {
          dashboardBus.once('hard_kill', resolve);
        });
        
        const hardKillData = {
          trigger_reason: 'FLASH_CRASH_PROTECTION',
          equity_change_pct: -3.5,
          positions_closed: 3,
        };
        
        mockZScoreDrift.emit('hard_kill', hardKillData);
        
        const data = await hardKillPromise;
        expect(data).toEqual(hardKillData);
      });

      test('should bridge reset events from Heartbeat', async () => {
        await manager.start();
        
        const resetPromise = new Promise((resolve) => {
          dashboardBus.once('reset', resolve);
        });
        
        mockHeartbeat.emit('reset');
        
        await resetPromise;
        // If we get here, the event was bridged successfully
        expect(true).toBe(true);
      });

      test('should bridge reset events from ZScoreDrift', async () => {
        await manager.start();
        
        const resetPromise = new Promise((resolve) => {
          dashboardBus.once('reset', resolve);
        });
        
        mockZScoreDrift.emit('reset');
        
        await resetPromise;
        // If we get here, the event was bridged successfully
        expect(true).toBe(true);
      });
    });

    test('should cleanup event listeners on stop', async () => {
      await manager.start();
      
      // Verify events are bridged
      let eventReceived = false;
      dashboardBus.once('position:opened', () => {
        eventReceived = true;
      });
      
      mockShadowState.emit('position:opened', { symbol: 'TEST' });
      expect(eventReceived).toBe(true);
      
      // Stop and verify events are no longer bridged
      manager.stop();
      
      eventReceived = false;
      dashboardBus.once('position:opened', () => {
        eventReceived = true;
      });
      
      mockShadowState.emit('position:opened', { symbol: 'TEST2' });
      
      // Give a small delay to ensure event would have been processed
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(eventReceived).toBe(false);
    });
  });
});
