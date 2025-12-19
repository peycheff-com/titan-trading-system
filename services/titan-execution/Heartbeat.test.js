/**
 * Heartbeat Dead Man's Switch Tests
 * 
 * Tests for Requirements 37.1-37.5 and Property 17
 * 
 * @module Heartbeat.test
 */

import { jest } from '@jest/globals';
import { Heartbeat } from './Heartbeat.js';

// Mock ShadowState
const createMockShadowState = () => ({
  closeAllPositions: jest.fn().mockReturnValue([
    { symbol: 'BTCUSDT', pnl: -100, close_reason: 'DEAD_MANS_SWITCH' },
  ]),
  getAllPositions: jest.fn().mockReturnValue(new Map()),
});

// Mock BrokerGateway
const createMockBrokerGateway = () => ({
  closeAllPositions: jest.fn().mockResolvedValue({ success: true }),
});

// Mock logger
const createMockLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

describe('Heartbeat', () => {
  let heartbeat;
  let mockShadowState;
  let mockBrokerGateway;
  let mockLogger;
  let mockSendAlert;

  beforeEach(() => {
    jest.useFakeTimers();
    mockShadowState = createMockShadowState();
    mockBrokerGateway = createMockBrokerGateway();
    mockLogger = createMockLogger();
    mockSendAlert = jest.fn().mockResolvedValue(undefined);
    
    heartbeat = new Heartbeat({
      shadowState: mockShadowState,
      brokerGateway: mockBrokerGateway,
      logger: mockLogger,
      sendAlert: mockSendAlert,
      expectedIntervalMs: 60000, // 60 seconds
      checkIntervalMs: 65000, // 65 seconds
      maxMissedHeartbeats: 3,
      isMarketOpen: () => true, // Default to market open
    });
  });

  afterEach(() => {
    heartbeat.stop();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw error if shadowState is not provided', () => {
      expect(() => new Heartbeat({})).toThrow('shadowState is required');
    });

    it('should initialize with default values', () => {
      const hb = new Heartbeat({ shadowState: mockShadowState });
      expect(hb.expectedIntervalMs).toBe(60000);
      expect(hb.maxMissedHeartbeats).toBe(3);
      expect(hb.isAutoExecutionEnabled()).toBe(true);
      expect(hb.isEmergencyState()).toBe(false);
    });

    it('should accept custom configuration', () => {
      const hb = new Heartbeat({
        shadowState: mockShadowState,
        expectedIntervalMs: 30000,
        maxMissedHeartbeats: 5,
      });
      expect(hb.expectedIntervalMs).toBe(30000);
      expect(hb.maxMissedHeartbeats).toBe(5);
    });
  });

  describe('receiveHeartbeat', () => {
    /**
     * Requirement 37.2: Update last_heartbeat_time and reset missed_heartbeat_count
     */
    it('should update last_heartbeat_time when heartbeat is received', () => {
      expect(heartbeat.getLastHeartbeatTime()).toBeNull();
      
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      
      expect(heartbeat.getLastHeartbeatTime()).not.toBeNull();
    });

    it('should reset missed_heartbeat_count when heartbeat is received', () => {
      // Simulate some missed heartbeats
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Advance time to miss heartbeats
      jest.advanceTimersByTime(65000);
      expect(heartbeat.getMissedHeartbeatCount()).toBe(1);
      
      // Receive heartbeat - should reset count
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:02:00Z' });
      expect(heartbeat.getMissedHeartbeatCount()).toBe(0);
    });

    it('should emit heartbeat_received event', () => {
      const handler = jest.fn();
      heartbeat.on('heartbeat_received', handler);
      
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z', symbol: 'BTCUSDT' });
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        pine_timestamp: '2025-12-02T10:00:00Z',
        payload: expect.objectContaining({ symbol: 'BTCUSDT' }),
      }));
    });

    it('should return true on successful heartbeat', () => {
      const result = heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      expect(result).toBe(true);
    });
  });

  describe('heartbeat monitoring', () => {
    /**
     * Requirement 37.3: Increment missed_heartbeat_count when heartbeat is missed
     */
    it('should increment missed_heartbeat_count when heartbeat is overdue', () => {
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      expect(heartbeat.getMissedHeartbeatCount()).toBe(0);
      
      // Advance time past expected interval
      jest.advanceTimersByTime(65000);
      
      expect(heartbeat.getMissedHeartbeatCount()).toBe(1);
    });

    it('should emit heartbeat_missed event when heartbeat is overdue', () => {
      const handler = jest.fn();
      heartbeat.on('heartbeat_missed', handler);
      
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      jest.advanceTimersByTime(65000);
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        missed_count: 1,
      }));
    });

    it('should not increment missed count if heartbeat is received in time', () => {
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Advance time but receive heartbeat before check
      jest.advanceTimersByTime(50000);
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:50Z' });
      
      jest.advanceTimersByTime(15000); // Total 65s, but heartbeat was received
      
      expect(heartbeat.getMissedHeartbeatCount()).toBe(0);
    });
  });

  describe('emergency flatten', () => {
    /**
     * Requirement 37.4: Trigger emergency_flatten_and_alert after 3 consecutive misses
     * Property 17: For any 3 consecutive missed heartbeats while market is open, 
     *              the system SHALL trigger emergency flatten
     */
    it('should trigger emergency flatten after 3 consecutive missed heartbeats', async () => {
      const emergencyHandler = jest.fn();
      heartbeat.on('emergency_flatten', emergencyHandler);
      
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Miss 3 heartbeats
      jest.advanceTimersByTime(65000); // Miss 1
      expect(heartbeat.getMissedHeartbeatCount()).toBe(1);
      
      jest.advanceTimersByTime(65000); // Miss 2
      expect(heartbeat.getMissedHeartbeatCount()).toBe(2);
      
      jest.advanceTimersByTime(65000); // Miss 3 - should trigger emergency
      
      // Allow async operations to complete
      await Promise.resolve();
      
      expect(emergencyHandler).toHaveBeenCalledWith(expect.objectContaining({
        reason: 'DEAD_MANS_SWITCH',
        missed_heartbeat_count: 3,
      }));
    });

    it('should close all positions via ShadowState on emergency', async () => {
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Miss 3 heartbeats
      jest.advanceTimersByTime(65000 * 3);
      await Promise.resolve();
      
      expect(mockShadowState.closeAllPositions).toHaveBeenCalledWith(
        expect.any(Function),
        'DEAD_MANS_SWITCH'
      );
    });

    it('should close all positions via BrokerGateway on emergency', async () => {
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Miss 3 heartbeats
      jest.advanceTimersByTime(65000 * 3);
      await Promise.resolve();
      
      expect(mockBrokerGateway.closeAllPositions).toHaveBeenCalled();
    });

    /**
     * Requirement 37.6: Send email/SMS alert on emergency
     */
    it('should send alert on emergency flatten', async () => {
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Miss 3 heartbeats
      jest.advanceTimersByTime(65000 * 3);
      await Promise.resolve();
      
      expect(mockSendAlert).toHaveBeenCalledWith(expect.objectContaining({
        type: 'EMERGENCY_FLATTEN',
        title: expect.stringContaining('Dead Man\'s Switch'),
      }));
    });

    /**
     * Requirement 37.7: Disable auto-execution after emergency
     */
    it('should disable auto-execution after emergency flatten', async () => {
      expect(heartbeat.isAutoExecutionEnabled()).toBe(true);
      
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Miss 3 heartbeats
      jest.advanceTimersByTime(65000 * 3);
      await Promise.resolve();
      
      expect(heartbeat.isAutoExecutionEnabled()).toBe(false);
      expect(heartbeat.isEmergencyState()).toBe(true);
    });

    it('should not trigger emergency again while in emergency state', async () => {
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Miss 3 heartbeats - trigger emergency
      jest.advanceTimersByTime(65000 * 3);
      await Promise.resolve();
      
      expect(mockShadowState.closeAllPositions).toHaveBeenCalledTimes(1);
      
      // Miss more heartbeats - should not trigger again
      jest.advanceTimersByTime(65000 * 3);
      await Promise.resolve();
      
      expect(mockShadowState.closeAllPositions).toHaveBeenCalledTimes(1);
    });
  });

  describe('market hours', () => {
    /**
     * Requirement 37.5: NOT trigger emergency flatten when market is closed
     */
    it('should NOT trigger emergency flatten when market is closed', async () => {
      const emergencyHandler = jest.fn();
      heartbeat.on('emergency_flatten', emergencyHandler);
      
      // Set market as closed
      heartbeat.setIsMarketOpenFunction(() => false);
      
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Miss 3 heartbeats
      jest.advanceTimersByTime(65000 * 3);
      await Promise.resolve();
      
      expect(emergencyHandler).not.toHaveBeenCalled();
      expect(heartbeat.isEmergencyState()).toBe(false);
    });

    it('should trigger emergency flatten when market is open', async () => {
      const emergencyHandler = jest.fn();
      heartbeat.on('emergency_flatten', emergencyHandler);
      
      // Market is open (default in test setup)
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Miss 3 heartbeats
      jest.advanceTimersByTime(65000 * 3);
      await Promise.resolve();
      
      expect(emergencyHandler).toHaveBeenCalled();
    });

    it('should use custom isMarketOpen function', () => {
      let marketOpen = true;
      heartbeat.setIsMarketOpenFunction(() => marketOpen);
      
      expect(heartbeat.isMarketOpen()).toBe(true);
      
      marketOpen = false;
      expect(heartbeat.isMarketOpen()).toBe(false);
    });

    it('should check trading days from marketHours config', () => {
      // Create heartbeat without custom isMarketOpen
      const hb = new Heartbeat({
        shadowState: mockShadowState,
        marketHours: {
          openHour: 9,
          closeHour: 17,
          tradingDays: [1, 2, 3, 4, 5], // Mon-Fri only
        },
      });
      
      // Mock Date to be a Saturday
      const saturday = new Date('2025-12-06T12:00:00Z'); // Saturday
      jest.setSystemTime(saturday);
      
      expect(hb.isMarketOpen()).toBe(false);
      
      // Mock Date to be a Monday during trading hours
      const monday = new Date('2025-12-01T12:00:00Z'); // Monday 12:00 UTC
      jest.setSystemTime(monday);
      
      expect(hb.isMarketOpen()).toBe(true);
    });
  });

  describe('manual reset', () => {
    /**
     * Requirement 37.7: Require manual reset before re-enabling auto-execution
     */
    it('should require manual reset after emergency', async () => {
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Trigger emergency
      jest.advanceTimersByTime(65000 * 3);
      await Promise.resolve();
      
      expect(heartbeat.isAutoExecutionEnabled()).toBe(false);
      
      // Reset
      const result = heartbeat.reset();
      
      expect(result).toBe(true);
      expect(heartbeat.isAutoExecutionEnabled()).toBe(true);
      expect(heartbeat.isEmergencyState()).toBe(false);
      expect(heartbeat.getMissedHeartbeatCount()).toBe(0);
    });

    it('should return false if reset called when not in emergency state', () => {
      const result = heartbeat.reset();
      expect(result).toBe(false);
    });

    it('should emit reset event', async () => {
      const resetHandler = jest.fn();
      heartbeat.on('reset', resetHandler);
      
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Trigger emergency
      jest.advanceTimersByTime(65000 * 3);
      await Promise.resolve();
      
      heartbeat.reset();
      
      expect(resetHandler).toHaveBeenCalledWith(expect.objectContaining({
        timestamp: expect.any(String),
      }));
    });

    it('should clear last_heartbeat_time on reset to require fresh heartbeat', async () => {
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Trigger emergency
      jest.advanceTimersByTime(65000 * 3);
      await Promise.resolve();
      
      heartbeat.reset();
      
      expect(heartbeat.getLastHeartbeatTime()).toBeNull();
    });
  });

  describe('status', () => {
    it('should return complete status object', () => {
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      
      const status = heartbeat.getStatus();
      
      expect(status).toEqual(expect.objectContaining({
        last_heartbeat_time: expect.any(String),
        missed_heartbeat_count: 0,
        is_emergency_state: false,
        auto_execution_enabled: true,
        expected_interval_ms: 60000,
        is_monitoring: false,
        is_market_open: true,
        timestamp: expect.any(String),
      }));
    });
  });

  describe('start/stop', () => {
    it('should start monitoring', () => {
      expect(heartbeat.isMonitoring()).toBe(false);
      
      heartbeat.start();
      
      expect(heartbeat.isMonitoring()).toBe(true);
    });

    it('should stop monitoring', () => {
      heartbeat.start();
      expect(heartbeat.isMonitoring()).toBe(true);
      
      heartbeat.stop();
      
      expect(heartbeat.isMonitoring()).toBe(false);
    });

    it('should not start twice', () => {
      heartbeat.start();
      heartbeat.start(); // Should log warning but not error
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        {},
        'Heartbeat monitoring already running'
      );
    });
  });

  describe('forceCheck', () => {
    it('should allow forcing a heartbeat check', () => {
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      
      // Advance time past expected interval
      jest.advanceTimersByTime(70000);
      
      // Force check without starting monitoring
      heartbeat.forceCheck();
      
      expect(heartbeat.getMissedHeartbeatCount()).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should not trigger emergency if no heartbeat ever received', () => {
      const emergencyHandler = jest.fn();
      heartbeat.on('emergency_flatten', emergencyHandler);
      
      heartbeat.start();
      
      // Advance time significantly
      jest.advanceTimersByTime(65000 * 5);
      
      // Should not trigger emergency - system might be starting up
      expect(emergencyHandler).not.toHaveBeenCalled();
    });

    it('should handle broker gateway errors gracefully', async () => {
      mockBrokerGateway.closeAllPositions.mockRejectedValue(new Error('Broker error'));
      
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Trigger emergency
      jest.advanceTimersByTime(65000 * 3);
      await Promise.resolve();
      
      // Should still complete emergency flatten despite broker error
      expect(heartbeat.isEmergencyState()).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Broker error' }),
        'Failed to close broker positions'
      );
    });

    it('should handle alert sending errors gracefully', async () => {
      mockSendAlert.mockRejectedValue(new Error('Alert error'));
      
      heartbeat.receiveHeartbeat({ timestamp: '2025-12-02T10:00:00Z' });
      heartbeat.start();
      
      // Trigger emergency
      jest.advanceTimersByTime(65000 * 3);
      await Promise.resolve();
      
      // Should still complete emergency flatten despite alert error
      expect(heartbeat.isEmergencyState()).toBe(true);
    });
  });
});
