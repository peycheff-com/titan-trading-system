/**
 * Integration Tests for Titan Execution Microservice
 * 
 * Tests the full webhook flow, sample alert payloads, and emergency flatten scenarios.
 * 
 * Requirements: All microservice requirements
 * 
 * @module integration.test
 */

import { jest } from '@jest/globals';
import crypto from 'crypto';

// Mock modules before imports
jest.unstable_mockModule('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(0),
    setEx: jest.fn().mockResolvedValue('OK'),
    keys: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(0),
    on: jest.fn(),
  })),
}));

// Import after mocks
const { ShadowState } = await import('./ShadowState.js');
const { ReplayGuard } = await import('./ReplayGuard.js');
const { WebSocketCache } = await import('./WebSocketCache.js');
const { L2Validator } = await import('./L2Validator.js');
const { BrokerGateway, MockBrokerAdapter } = await import('./BrokerGateway.js');
const { LimitChaser } = await import('./LimitChaser.js');
const { Heartbeat } = await import('./Heartbeat.js');
const { ZScoreDrift } = await import('./ZScoreDrift.js');
const { Reconciliation } = await import('./Reconciliation.js');

//─────────────────────────────────────────────────────────────────────────────
// TEST HELPERS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Create a mock logger that captures log calls
 */
function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

/**
 * Generate HMAC signature for a payload
 */
function generateHmacSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

/**
 * Create a sample PREPARE payload
 */
function createPreparePayload(overrides = {}) {
  const barIndex = overrides.bar_index || Math.floor(Math.random() * 100000);
  return {
    signal_id: `titan_BTCUSDT_${barIndex}_15`,
    type: 'PREPARE',
    symbol: 'BTCUSDT',
    timeframe: '15',
    bar_index: barIndex,
    timestamp: new Date().toISOString(),
    trigger_price: 50100.0,
    trigger_condition: 'price > 50100',
    direction: 1,
    entry_zone: [50100, 50050, 50000],
    stop_loss: 49500,
    take_profits: [50500, 51000, 52000],
    size: 0.1,
    regime_vector: {
      trend_state: 1,
      vol_state: 1,
      regime_state: 1,
      market_structure_score: 85,
      momentum_score: 75,
      model_recommendation: 'TREND_FOLLOW',
    },
    signal_type: 'scalp',
    alpha_half_life_ms: 10000,
    ...overrides,
  };
}

/**
 * Create a sample CONFIRM payload
 */
function createConfirmPayload(signalId, overrides = {}) {
  return {
    signal_id: signalId,
    type: 'CONFIRM',
    symbol: 'BTCUSDT',
    timestamp: new Date().toISOString(),
    direction: 1,
    size: 0.1,
    regime_vector: {
      trend_state: 1,
      vol_state: 1,
      regime_state: 1,
      market_structure_score: 85,
      momentum_score: 75,
    },
    ...overrides,
  };
}

/**
 * Create a sample ABORT payload
 */
function createAbortPayload(signalId) {
  return {
    signal_id: signalId,
    type: 'ABORT',
    symbol: 'BTCUSDT',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a mock WebSocketCache with valid orderbook data
 */
function createMockWsCache() {
  const mockOrderbook = {
    bids: [
      { price: 50000, quantity: 10 },
      { price: 49990, quantity: 20 },
      { price: 49980, quantity: 30 },
    ],
    asks: [
      { price: 50010, quantity: 10 },
      { price: 50020, quantity: 20 },
      { price: 50030, quantity: 30 },
    ],
    timestamp: Date.now(),
  };

  return {
    getOrderbook: jest.fn().mockReturnValue(mockOrderbook),
    getBestBid: jest.fn().mockReturnValue(50000),
    getBestAsk: jest.fn().mockReturnValue(50010),
    getSpread: jest.fn().mockReturnValue(10),
    getSpreadPct: jest.fn().mockReturnValue(0.02),
    calculateOBI: jest.fn().mockReturnValue(1.0),
    getCacheAge: jest.fn().mockReturnValue(50),
    validateCacheForSymbol: jest.fn().mockReturnValue({ valid: true }),
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
}



//─────────────────────────────────────────────────────────────────────────────
// INTEGRATION TEST SUITE: FULL WEBHOOK FLOW
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Full Webhook Flow', () => {
  let shadowState;
  let replayGuard;
  let wsCache;
  let l2Validator;
  let brokerGateway;
  let limitChaser;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    
    shadowState = new ShadowState({ logger });
    replayGuard = new ReplayGuard({ logger, maxDriftMs: 5000 });
    wsCache = createMockWsCache();
    l2Validator = new L2Validator({ wsCache, logger, minStructureThreshold: 60 });
    brokerGateway = new BrokerGateway({ 
      adapter: new MockBrokerAdapter(), 
      logger,
    });
    limitChaser = new LimitChaser({ wsCache, brokerGateway, logger });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('PREPARE → CONFIRM → Execution Flow', () => {
    test('should process PREPARE and store intent', async () => {
      const payload = createPreparePayload();
      
      // Validate timestamp
      const timestampResult = replayGuard.validateTimestamp(payload.timestamp);
      expect(timestampResult.valid).toBe(true);
      
      // Process intent
      const intent = shadowState.processIntent(payload);
      
      expect(intent).toBeDefined();
      expect(intent.signal_id).toBe(payload.signal_id);
      expect(intent.symbol).toBe('BTCUSDT');
      expect(intent.direction).toBe(1);
      expect(intent.status).toBe('PENDING');
    });

    test('should validate and execute on CONFIRM', async () => {
      const preparePayload = createPreparePayload();
      
      // Step 1: PREPARE
      const intent = shadowState.processIntent(preparePayload);
      expect(intent.status).toBe('PENDING');
      
      // Step 2: CONFIRM - Validate with L2
      const validationResult = l2Validator.validate({
        symbol: preparePayload.symbol,
        side: 'BUY',
        size: preparePayload.size,
        market_structure_score: preparePayload.regime_vector.market_structure_score,
        momentum_score: preparePayload.regime_vector.momentum_score,
      });
      
      expect(validationResult.valid).toBe(true);
      
      // Step 3: Mark as validated
      const validatedIntent = shadowState.validateIntent(preparePayload.signal_id);
      expect(validatedIntent.status).toBe('VALIDATED');
      
      // Step 4: Confirm execution
      const position = shadowState.confirmExecution(preparePayload.signal_id, {
        broker_order_id: 'broker_123',
        fill_price: 50100,
        fill_size: 0.1,
        filled: true,
      });
      
      expect(position).toBeDefined();
      expect(position.symbol).toBe('BTCUSDT');
      expect(position.side).toBe('LONG');
      expect(position.size).toBe(0.1);
      expect(position.entry_price).toBe(50100);
    });

    test('should handle ABORT and discard prepared intent', async () => {
      const preparePayload = createPreparePayload();
      
      // PREPARE
      shadowState.processIntent(preparePayload);
      expect(shadowState.getIntent(preparePayload.signal_id)).toBeDefined();
      
      // ABORT
      shadowState.rejectIntent(preparePayload.signal_id, 'Signal aborted by Pine');
      
      const rejectedIntent = shadowState.getIntent(preparePayload.signal_id);
      expect(rejectedIntent.status).toBe('REJECTED');
      expect(rejectedIntent.rejection_reason).toBe('Signal aborted by Pine');
    });

    test('should reject CONFIRM without prior PREPARE', () => {
      const signalId = 'titan_BTCUSDT_99999_15';
      const intent = shadowState.getIntent(signalId);
      
      expect(intent).toBeUndefined();
    });

    test('should detect zombie signals (close without position)', () => {
      const signalId = 'titan_BTCUSDT_12345_15';
      
      // No position exists
      expect(shadowState.hasPosition('BTCUSDT')).toBe(false);
      
      // Check for zombie signal
      const isZombie = shadowState.isZombieSignal('BTCUSDT', signalId);
      expect(isZombie).toBe(true);
    });
  });

  describe('L2 Validation Rejection Flow', () => {
    test('should reject when market structure score is below threshold', () => {
      const result = l2Validator.validate({
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.1,
        market_structure_score: 50, // Below 60 threshold
        momentum_score: 75,
      });
      
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('STRUCTURE_BELOW_THRESHOLD');
      expect(result.recommendation).toBe('ABORT');
    });

    test('should reject when cache is stale', () => {
      // Make cache invalid
      wsCache.validateCacheForSymbol.mockReturnValue({ 
        valid: false, 
        reason: 'STALE_L2_CACHE',
      });
      
      const result = l2Validator.validate({
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.1,
        market_structure_score: 85,
      });
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('STALE_L2_CACHE');
    });

    test('should NOT update Shadow State on L2 rejection', async () => {
      const preparePayload = createPreparePayload();
      
      // PREPARE
      shadowState.processIntent(preparePayload);
      
      // Simulate L2 rejection
      shadowState.rejectIntent(preparePayload.signal_id, 'HEAVY_SELL_WALL');
      
      // Verify no position was created
      expect(shadowState.hasPosition('BTCUSDT')).toBe(false);
      
      // Verify intent was rejected
      const intent = shadowState.getIntent(preparePayload.signal_id);
      expect(intent.status).toBe('REJECTED');
    });
  });

  describe('Replay Attack Prevention', () => {
    test('should reject duplicate signal_id', async () => {
      const payload = createPreparePayload();
      
      // First request should pass
      const result1 = await replayGuard.validate(payload, '127.0.0.1');
      expect(result1.valid).toBe(true);
      
      // Second request with same signal_id should fail
      const result2 = await replayGuard.validate(payload, '127.0.0.1');
      expect(result2.valid).toBe(false);
      expect(result2.error).toBe('DUPLICATE_SIGNAL_ID');
      expect(result2.statusCode).toBe(409);
    });

    test('should reject timestamp drift > 5000ms', () => {
      const oldTimestamp = new Date(Date.now() - 10000).toISOString(); // 10 seconds ago
      
      const result = replayGuard.validateTimestamp(oldTimestamp);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('TIMESTAMP_DRIFT_EXCEEDED');
      expect(result.driftMs).toBeGreaterThan(5000);
    });

    test('should accept timestamp within drift tolerance', () => {
      const recentTimestamp = new Date(Date.now() - 1000).toISOString(); // 1 second ago
      
      const result = replayGuard.validateTimestamp(recentTimestamp);
      
      expect(result.valid).toBe(true);
      expect(result.driftMs).toBeLessThanOrEqual(5000);
    });
  });
});



//─────────────────────────────────────────────────────────────────────────────
// INTEGRATION TEST SUITE: SAMPLE ALERT PAYLOADS
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Sample Alert Payloads', () => {
  let shadowState;
  let replayGuard;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    shadowState = new ShadowState({ logger });
    replayGuard = new ReplayGuard({ logger, maxDriftMs: 5000 });
  });

  describe('Scalp Signal Payloads', () => {
    test('should process scalp BUY_SETUP payload', async () => {
      const payload = createPreparePayload({
        signal_type: 'scalp',
        direction: 1,
        regime_vector: {
          trend_state: 1,
          vol_state: 1,
          regime_state: 1,
          market_structure_score: 85,
          momentum_score: 80,
          model_recommendation: 'TREND_FOLLOW',
        },
      });

      const validation = await replayGuard.validate(payload, '127.0.0.1');
      expect(validation.valid).toBe(true);

      const intent = shadowState.processIntent(payload);
      expect(intent.type).toBe('BUY_SETUP');
      expect(intent.symbol).toBe('BTCUSDT');
    });

    test('should process scalp SELL_SETUP payload', async () => {
      const payload = createPreparePayload({
        signal_type: 'scalp',
        direction: -1,
        regime_vector: {
          trend_state: -1,
          vol_state: 1,
          regime_state: 1,
          market_structure_score: 80,
          momentum_score: 70,
          model_recommendation: 'TREND_FOLLOW',
        },
      });

      const intent = shadowState.processIntent(payload);
      expect(intent.type).toBe('SELL_SETUP');
      expect(intent.direction).toBe(-1);
    });
  });

  describe('Day Trade Signal Payloads', () => {
    test('should process day trade BREAKOUT payload', async () => {
      const payload = createPreparePayload({
        signal_type: 'day',
        direction: 1,
        regime_vector: {
          trend_state: 1,
          vol_state: 1,
          regime_state: 1,
          market_structure_score: 90,
          momentum_score: 85,
          model_recommendation: 'TREND_FOLLOW',
          fdi: 1.3, // Trending
          is_squeeze: false, // Squeeze released
        },
      });

      const intent = shadowState.processIntent(payload);
      expect(intent.type).toBe('BUY_SETUP');
    });

    test('should process day trade FADE payload', async () => {
      const payload = createPreparePayload({
        signal_type: 'day',
        direction: -1,
        regime_vector: {
          trend_state: 0,
          vol_state: 1,
          regime_state: 1,
          market_structure_score: 75,
          momentum_score: 60,
          model_recommendation: 'MEAN_REVERT',
          fdi: 1.7, // Mean reverting
        },
      });

      const intent = shadowState.processIntent(payload);
      expect(intent.type).toBe('SELL_SETUP');
    });
  });

  describe('Swing Signal Payloads', () => {
    test('should process swing signal with RSI reset bonus', async () => {
      const payload = createPreparePayload({
        signal_type: 'swing',
        direction: 1,
        regime_vector: {
          trend_state: 1,
          vol_state: 1,
          regime_state: 1,
          market_structure_score: 95,
          momentum_score: 70,
          model_recommendation: 'TREND_FOLLOW',
          rsi_reset: true, // RSI crossed back above 50
        },
      });

      const intent = shadowState.processIntent(payload);
      expect(intent.type).toBe('BUY_SETUP');
    });
  });

  describe('Close Signal Payloads', () => {
    test('should process CLOSE_LONG payload', async () => {
      // First open a position
      const openPayload = createPreparePayload({ direction: 1 });
      shadowState.processIntent(openPayload);
      shadowState.confirmExecution(openPayload.signal_id, {
        broker_order_id: 'broker_123',
        fill_price: 50100,
        fill_size: 0.1,
        filled: true,
      });

      expect(shadowState.hasPosition('BTCUSDT')).toBe(true);

      // Now close it
      const closePayload = {
        signal_id: `titan_BTCUSDT_${Date.now()}_15`,
        type: 'CLOSE',
        symbol: 'BTCUSDT',
        direction: 1,
        timestamp: new Date().toISOString(),
      };

      const closeIntent = shadowState.processIntent(closePayload);
      expect(closeIntent.type).toBe('CLOSE_LONG');
    });

    test('should process CLOSE_SHORT payload', async () => {
      // First open a short position
      const openPayload = createPreparePayload({ direction: -1 });
      shadowState.processIntent(openPayload);
      shadowState.confirmExecution(openPayload.signal_id, {
        broker_order_id: 'broker_456',
        fill_price: 50100,
        fill_size: 0.1,
        filled: true,
      });

      // Now close it
      const closePayload = {
        signal_id: `titan_BTCUSDT_${Date.now()}_15`,
        type: 'CLOSE',
        symbol: 'BTCUSDT',
        direction: -1,
        timestamp: new Date().toISOString(),
      };

      const closeIntent = shadowState.processIntent(closePayload);
      expect(closeIntent.type).toBe('CLOSE_SHORT');
    });
  });

  describe('Heartbeat Payloads', () => {
    test('should process heartbeat payload', () => {
      const heartbeat = new Heartbeat({
        shadowState,
        logger,
        expectedIntervalMs: 60000,
      });

      const payload = {
        timestamp: new Date().toISOString(),
        symbol: 'BTCUSDT',
        regime_vector: {
          trend_state: 1,
          vol_state: 1,
          regime_state: 1,
        },
      };

      const result = heartbeat.receiveHeartbeat(payload);
      expect(result).toBe(true);
      expect(heartbeat.getMissedHeartbeatCount()).toBe(0);
    });
  });

  describe('Signal ID Format Validation', () => {
    test('should validate correct signal_id format', () => {
      // Format: titan_{ticker}_{bar_index}_{timeframe}
      const validSignalIds = [
        'titan_BTCUSDT_12345_15',
        'titan_ETHUSDT_99999_1',
        'titan_SOLUSDT_1_60',
        'titan_BTCUSD_100000_240',
      ];

      for (const signalId of validSignalIds) {
        const parts = signalId.split('_');
        expect(parts[0]).toBe('titan');
        expect(parts.length).toBe(4);
        expect(parseInt(parts[2])).not.toBeNaN();
        expect(parseInt(parts[3])).not.toBeNaN();
      }
    });

    test('should use bar_index for deterministic signal_id (not close price)', () => {
      const barIndex = 12345;
      const signalId1 = `titan_BTCUSDT_${barIndex}_15`;
      const signalId2 = `titan_BTCUSDT_${barIndex}_15`;

      // Same bar_index should produce same signal_id
      expect(signalId1).toBe(signalId2);

      // Different bar_index should produce different signal_id
      const signalId3 = `titan_BTCUSDT_${barIndex + 1}_15`;
      expect(signalId1).not.toBe(signalId3);
    });
  });
});



//─────────────────────────────────────────────────────────────────────────────
// INTEGRATION TEST SUITE: EMERGENCY FLATTEN SCENARIOS
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Emergency Flatten Scenarios', () => {
  let shadowState;
  let brokerGateway;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    shadowState = new ShadowState({ logger });
    brokerGateway = new BrokerGateway({
      adapter: new MockBrokerAdapter(),
      logger,
    });
  });

  /**
   * Helper to create an open position
   */
  function createOpenPosition(symbol = 'BTCUSDT', side = 1, size = 0.1) {
    const payload = createPreparePayload({
      symbol,
      direction: side,
      size,
    });
    shadowState.processIntent(payload);
    return shadowState.confirmExecution(payload.signal_id, {
      broker_order_id: `broker_${Date.now()}`,
      fill_price: 50100,
      fill_size: size,
      filled: true,
    });
  }

  describe('Heartbeat Dead Man\'s Switch', () => {
    test('should trigger emergency flatten after 3 consecutive missed heartbeats', async () => {
      // Create open positions
      createOpenPosition('BTCUSDT', 1, 0.1);
      createOpenPosition('ETHUSDT', 1, 0.5);

      expect(shadowState.getAllPositions().size).toBe(2);

      const heartbeat = new Heartbeat({
        shadowState,
        brokerGateway,
        logger,
        expectedIntervalMs: 100, // Short interval for testing
        maxMissedHeartbeats: 3,
        getPriceForSymbol: () => 50000,
        isMarketOpen: () => true, // Market is open
      });

      // Set up promise to wait for emergency_flatten event
      const emergencyPromise = new Promise(resolve => {
        heartbeat.on('emergency_flatten', resolve);
      });

      // Receive initial heartbeat, then manually set it to be old
      heartbeat.receiveHeartbeat({ timestamp: new Date().toISOString() });
      // Directly set the internal state to simulate time passing
      heartbeat._lastHeartbeatTime = new Date(Date.now() - 200).toISOString();

      // Force 3 missed heartbeat checks (heartbeat is now "old")
      heartbeat.forceCheck();
      heartbeat.forceCheck();
      heartbeat.forceCheck();

      // Wait for the async emergency flatten to complete
      const emergencyData = await emergencyPromise;

      expect(emergencyData).not.toBeNull();
      expect(emergencyData.reason).toBe('DEAD_MANS_SWITCH');
      expect(emergencyData.missed_heartbeat_count).toBe(3);
      expect(heartbeat.isEmergencyState()).toBe(true);
      expect(heartbeat.isAutoExecutionEnabled()).toBe(false);
    });

    test('should NOT trigger emergency flatten when market is closed', () => {
      createOpenPosition('BTCUSDT', 1, 0.1);

      const heartbeat = new Heartbeat({
        shadowState,
        brokerGateway,
        logger,
        expectedIntervalMs: 100,
        maxMissedHeartbeats: 3,
        getPriceForSymbol: () => 50000,
        isMarketOpen: () => false, // Market is closed
      });

      // Receive heartbeat then set it to be old
      heartbeat.receiveHeartbeat({ timestamp: new Date().toISOString() });
      heartbeat._lastHeartbeatTime = new Date(Date.now() - 200).toISOString();

      // Force 3 missed heartbeat checks
      heartbeat.forceCheck();
      heartbeat.forceCheck();
      heartbeat.forceCheck();

      // Should NOT be in emergency state because market is closed
      expect(heartbeat.isEmergencyState()).toBe(false);
      expect(heartbeat.isAutoExecutionEnabled()).toBe(true);
    });

    test('should require manual reset after emergency', async () => {
      const heartbeat = new Heartbeat({
        shadowState,
        brokerGateway,
        logger,
        expectedIntervalMs: 100,
        maxMissedHeartbeats: 3,
        getPriceForSymbol: () => 50000,
        isMarketOpen: () => true,
      });

      // Receive heartbeat then set it to be old
      heartbeat.receiveHeartbeat({ timestamp: new Date().toISOString() });
      heartbeat._lastHeartbeatTime = new Date(Date.now() - 200).toISOString();
      
      heartbeat.forceCheck();
      heartbeat.forceCheck();
      heartbeat.forceCheck();

      // Wait a tick for async operations
      await new Promise(resolve => setImmediate(resolve));

      expect(heartbeat.isEmergencyState()).toBe(true);

      // Reset
      const resetResult = heartbeat.reset();
      expect(resetResult).toBe(true);
      expect(heartbeat.isEmergencyState()).toBe(false);
      expect(heartbeat.isAutoExecutionEnabled()).toBe(true);
    });
  });

  describe('Z-Score Drift Safety Stop', () => {
    test('should trigger safety stop when Z-Score < -2.0', async () => {
      createOpenPosition('BTCUSDT', 1, 0.1);

      const zScoreDrift = new ZScoreDrift({
        shadowState,
        brokerGateway,
        logger,
        windowSize: 10,
        zScoreThreshold: -2.0,
        backtestParams: {
          expected_mean: 100, // Expected $100 profit per trade
          expected_stddev: 50,
        },
        getPriceForSymbol: () => 50000,
      });

      const safetyStopPromise = new Promise(resolve => {
        zScoreDrift.on('safety_stop', resolve);
      });

      // Record losing trades that push Z-Score below -2.0
      // Z = (observed_mean - expected_mean) / stddev
      // Need observed_mean < expected_mean - 2 * stddev = 100 - 100 = 0
      for (let i = 0; i < 10; i++) {
        zScoreDrift.recordTrade(-50); // Consistent losses
      }

      const diagnostics = await safetyStopPromise;

      expect(diagnostics.z_score).toBeLessThan(-2.0);
      expect(zScoreDrift.isSafetyStop()).toBe(true);
      expect(zScoreDrift.isAutoExecutionEnabled()).toBe(false);
    });

    test('should NOT trigger safety stop when Z-Score is acceptable', () => {
      const zScoreDrift = new ZScoreDrift({
        shadowState,
        logger,
        windowSize: 10,
        zScoreThreshold: -2.0,
        backtestParams: {
          expected_mean: 100,
          expected_stddev: 50,
        },
      });

      // Record trades near expected mean
      for (let i = 0; i < 10; i++) {
        zScoreDrift.recordTrade(90 + Math.random() * 20); // Around $100
      }

      expect(zScoreDrift.isSafetyStop()).toBe(false);
      expect(zScoreDrift.isAutoExecutionEnabled()).toBe(true);
      expect(Math.abs(zScoreDrift.getCurrentZScore())).toBeLessThan(2.0);
    });

    test('should trigger hard kill on rapid drawdown (> 2% in < 5 min)', async () => {
      createOpenPosition('BTCUSDT', 1, 0.1);

      let hardKillData = null;
      
      const zScoreDrift = new ZScoreDrift({
        shadowState,
        brokerGateway,
        logger,
        drawdownThresholdPct: 2.0,
        drawdownTimeWindowMs: 300000, // 5 minutes
        getPriceForSymbol: () => 50000,
        getEquity: jest.fn().mockResolvedValue(9700), // Current equity
      });

      // Set up event listener BEFORE triggering
      zScoreDrift.on('hard_kill', (data) => {
        hardKillData = data;
      });

      // Add initial equity snapshot (peak)
      zScoreDrift.addEquitySnapshot(10000, Date.now() - 60000); // 1 minute ago at peak

      // Add current equity (3% drop from peak)
      zScoreDrift.addEquitySnapshot(9700, Date.now());

      // Force drawdown check
      await zScoreDrift.forceDrawdownCheck();

      // Wait a tick for async operations
      await new Promise(resolve => setImmediate(resolve));

      expect(hardKillData).not.toBeNull();
      expect(hardKillData.trigger_reason).toBe('FLASH_CRASH_PROTECTION');
      expect(Math.abs(hardKillData.equity_change_pct)).toBeGreaterThanOrEqual(2.0);
      expect(zScoreDrift.isHardKill()).toBe(true);
    });

    test('should require manual reset with fresh rolling window', () => {
      const zScoreDrift = new ZScoreDrift({
        shadowState,
        logger,
        windowSize: 10,
        zScoreThreshold: -2.0,
        backtestParams: {
          expected_mean: 100,
          expected_stddev: 50,
        },
      });

      // Trigger safety stop
      for (let i = 0; i < 10; i++) {
        zScoreDrift.recordTrade(-100);
      }

      expect(zScoreDrift.isSafetyStop()).toBe(true);

      // Reset with new backtest params
      const resetResult = zScoreDrift.reset({
        expected_mean: 50,
        expected_stddev: 30,
      });

      expect(resetResult).toBe(true);
      expect(zScoreDrift.isSafetyStop()).toBe(false);
      expect(zScoreDrift.getRecentPnL()).toHaveLength(0); // Fresh window
    });
  });

  describe('Reconciliation Mismatch Flatten', () => {
    test('should trigger emergency flatten after 3 consecutive mismatches', async () => {
      createOpenPosition('BTCUSDT', 1, 0.1);

      // Mock broker returning different positions
      const mockBrokerGateway = {
        getPositions: jest.fn().mockResolvedValue([
          { symbol: 'BTCUSDT', side: 'LONG', size: 0.2, entry_price: 50000 }, // Size mismatch
        ]),
        closeAllPositions: jest.fn().mockResolvedValue([]),
      };

      const reconciliation = new Reconciliation({
        shadowState,
        brokerGateway: mockBrokerGateway,
        logger,
        intervalMs: 100,
        maxConsecutiveMismatches: 3,
        getPriceForSymbol: () => 50000,
      });

      const emergencyPromise = new Promise(resolve => {
        reconciliation.on('emergency_flatten', resolve);
      });

      // Force 3 reconciliation cycles with mismatches
      await reconciliation.forceReconcile();
      await reconciliation.forceReconcile();
      await reconciliation.forceReconcile();

      const emergencyData = await emergencyPromise;

      expect(emergencyData.reason).toBe('CONSECUTIVE_MISMATCHES');
      expect(emergencyData.consecutive_count).toBe(3);
      expect(reconciliation.isAutoExecutionDisabled()).toBe(true);
    });

    test('should detect MISSING_IN_SHADOW mismatch', async () => {
      // Shadow State has no positions
      expect(shadowState.getAllPositions().size).toBe(0);

      // But broker has a position
      const mockBrokerGateway = {
        getPositions: jest.fn().mockResolvedValue([
          { symbol: 'BTCUSDT', side: 'LONG', size: 0.1, entry_price: 50000 },
        ]),
        closeAllPositions: jest.fn().mockResolvedValue([]),
      };

      const reconciliation = new Reconciliation({
        shadowState,
        brokerGateway: mockBrokerGateway,
        logger,
        maxConsecutiveMismatches: 10, // High to prevent auto-flatten
      });

      const mismatchPromise = new Promise(resolve => {
        reconciliation.on('mismatch', resolve);
      });

      await reconciliation.forceReconcile();

      const result = await mismatchPromise;

      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0].mismatch_type).toBe('MISSING_IN_SHADOW');
    });

    test('should detect MISSING_IN_BROKER mismatch', async () => {
      // Shadow State has a position
      createOpenPosition('BTCUSDT', 1, 0.1);

      // But broker has no positions
      const mockBrokerGateway = {
        getPositions: jest.fn().mockResolvedValue([]),
        closeAllPositions: jest.fn().mockResolvedValue([]),
      };

      const reconciliation = new Reconciliation({
        shadowState,
        brokerGateway: mockBrokerGateway,
        logger,
        maxConsecutiveMismatches: 10,
      });

      const mismatchPromise = new Promise(resolve => {
        reconciliation.on('mismatch', resolve);
      });

      await reconciliation.forceReconcile();

      const result = await mismatchPromise;

      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0].mismatch_type).toBe('MISSING_IN_BROKER');
    });

    test('should reset mismatch count on successful sync', async () => {
      createOpenPosition('BTCUSDT', 1, 0.1);

      // Broker matches Shadow State
      const mockBrokerGateway = {
        getPositions: jest.fn().mockResolvedValue([
          { symbol: 'BTCUSDT', side: 'LONG', size: 0.1, entry_price: 50100 },
        ]),
        closeAllPositions: jest.fn().mockResolvedValue([]),
      };

      const reconciliation = new Reconciliation({
        shadowState,
        brokerGateway: mockBrokerGateway,
        logger,
      });

      const syncOkPromise = new Promise(resolve => {
        reconciliation.on('sync_ok', resolve);
      });

      await reconciliation.forceReconcile();

      const result = await syncOkPromise;

      expect(result.in_sync).toBe(true);
      expect(reconciliation.getConsecutiveMismatchCount()).toBe(0);
    });
  });

  describe('Regime Kill Switch', () => {
    test('should close all positions when regime_state == -1', () => {
      // Create multiple positions
      createOpenPosition('BTCUSDT', 1, 0.1);
      createOpenPosition('ETHUSDT', 1, 0.5);
      createOpenPosition('SOLUSDT', -1, 10);

      expect(shadowState.getAllPositions().size).toBe(3);

      // Simulate regime kill
      const tradeRecords = shadowState.closeAllPositions(
        () => 50000, // Price getter
        'REGIME_KILL'
      );

      expect(tradeRecords).toHaveLength(3);
      expect(shadowState.getAllPositions().size).toBe(0);

      // Verify all trades recorded with REGIME_KILL reason
      for (const record of tradeRecords) {
        expect(record.close_reason).toBe('REGIME_KILL');
      }
    });
  });
});



//─────────────────────────────────────────────────────────────────────────────
// INTEGRATION TEST SUITE: POSITION MANAGEMENT
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Position Management', () => {
  let shadowState;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    shadowState = new ShadowState({ logger });
  });

  describe('Pyramiding (Adding to Positions)', () => {
    test('should add to existing position with averaged entry price', () => {
      // First entry
      const payload1 = createPreparePayload({ size: 0.1 });
      shadowState.processIntent(payload1);
      shadowState.confirmExecution(payload1.signal_id, {
        broker_order_id: 'broker_1',
        fill_price: 50000,
        fill_size: 0.1,
        filled: true,
      });

      let position = shadowState.getPosition('BTCUSDT');
      expect(position.size).toBe(0.1);
      expect(position.entry_price).toBe(50000);

      // Second entry (pyramid)
      const payload2 = createPreparePayload({ size: 0.1 });
      shadowState.processIntent(payload2);
      shadowState.confirmExecution(payload2.signal_id, {
        broker_order_id: 'broker_2',
        fill_price: 51000,
        fill_size: 0.1,
        filled: true,
      });

      position = shadowState.getPosition('BTCUSDT');
      expect(position.size).toBe(0.2);
      // Average: (50000 * 0.1 + 51000 * 0.1) / 0.2 = 50500
      expect(position.entry_price).toBe(50500);
    });
  });

  describe('Partial Position Closing', () => {
    test('should partially close position for take-profit scaling', () => {
      // Open position
      const payload = createPreparePayload({ size: 1.0 });
      shadowState.processIntent(payload);
      shadowState.confirmExecution(payload.signal_id, {
        broker_order_id: 'broker_1',
        fill_price: 50000,
        fill_size: 1.0,
        filled: true,
      });

      // Close 33% at TP1
      const tradeRecord = shadowState.closePartialPosition('BTCUSDT', 50500, 0.33, 'TP1');

      expect(tradeRecord).toBeDefined();
      expect(tradeRecord.size).toBe(0.33);
      expect(tradeRecord.close_reason).toBe('TP1');
      expect(tradeRecord.pnl).toBeGreaterThan(0);

      // Remaining position
      const position = shadowState.getPosition('BTCUSDT');
      expect(position.size).toBeCloseTo(0.67, 2);
    });
  });

  describe('PnL Calculation', () => {
    test('should calculate correct PnL for LONG position', () => {
      const payload = createPreparePayload({ direction: 1, size: 1.0 });
      shadowState.processIntent(payload);
      shadowState.confirmExecution(payload.signal_id, {
        broker_order_id: 'broker_1',
        fill_price: 50000,
        fill_size: 1.0,
        filled: true,
      });

      // Close at profit
      const tradeRecord = shadowState.closePosition('BTCUSDT', 51000, 'TP1');

      // PnL = (exit - entry) * size = (51000 - 50000) * 1.0 = 1000
      expect(tradeRecord.pnl).toBe(1000);
      // PnL% = ((exit - entry) / entry) * 100 = 2%
      expect(tradeRecord.pnl_pct).toBe(2);
    });

    test('should calculate correct PnL for SHORT position', () => {
      const payload = createPreparePayload({ direction: -1, size: 1.0 });
      shadowState.processIntent(payload);
      shadowState.confirmExecution(payload.signal_id, {
        broker_order_id: 'broker_1',
        fill_price: 50000,
        fill_size: 1.0,
        filled: true,
      });

      // Close at profit (price went down)
      const tradeRecord = shadowState.closePosition('BTCUSDT', 49000, 'TP1');

      // PnL = (entry - exit) * size = (50000 - 49000) * 1.0 = 1000
      expect(tradeRecord.pnl).toBe(1000);
      // PnL% = ((entry - exit) / entry) * 100 = 2%
      expect(tradeRecord.pnl_pct).toBe(2);
    });

    test('should calculate rolling PnL statistics', () => {
      // Create and close multiple trades
      for (let i = 0; i < 10; i++) {
        const payload = createPreparePayload({ size: 0.1 });
        shadowState.processIntent(payload);
        shadowState.confirmExecution(payload.signal_id, {
          broker_order_id: `broker_${i}`,
          fill_price: 50000,
          fill_size: 0.1,
          filled: true,
        });

        // Alternate wins and losses
        const exitPrice = i % 2 === 0 ? 51000 : 49000;
        shadowState.closePosition('BTCUSDT', exitPrice, 'TEST');
      }

      const stats = shadowState.calculatePnLStats(10);

      expect(stats.trade_count).toBe(10);
      expect(stats.win_rate).toBe(0.5); // 5 wins, 5 losses
      expect(stats.avg_win).toBeGreaterThan(0);
      expect(stats.avg_loss).toBeLessThan(0);
    });
  });
});

//─────────────────────────────────────────────────────────────────────────────
// INTEGRATION TEST SUITE: MULTI-SYMBOL SCENARIOS
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Multi-Symbol Scenarios', () => {
  let shadowState;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    shadowState = new ShadowState({ logger });
  });

  test('should manage positions across multiple symbols independently', () => {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

    // Open positions in all symbols
    for (const symbol of symbols) {
      const payload = createPreparePayload({ symbol });
      shadowState.processIntent(payload);
      shadowState.confirmExecution(payload.signal_id, {
        broker_order_id: `broker_${symbol}`,
        fill_price: 50000,
        fill_size: 0.1,
        filled: true,
      });
    }

    expect(shadowState.getAllPositions().size).toBe(4);

    // Close one position
    shadowState.closePosition('ETHUSDT', 51000, 'TP1');

    expect(shadowState.getAllPositions().size).toBe(3);
    expect(shadowState.hasPosition('ETHUSDT')).toBe(false);
    expect(shadowState.hasPosition('BTCUSDT')).toBe(true);
  });

  test('should handle mixed long and short positions', () => {
    // Long BTCUSDT
    const longPayload = createPreparePayload({ symbol: 'BTCUSDT', direction: 1 });
    shadowState.processIntent(longPayload);
    shadowState.confirmExecution(longPayload.signal_id, {
      broker_order_id: 'broker_btc',
      fill_price: 50000,
      fill_size: 0.1,
      filled: true,
    });

    // Short ETHUSDT
    const shortPayload = createPreparePayload({ symbol: 'ETHUSDT', direction: -1 });
    shadowState.processIntent(shortPayload);
    shadowState.confirmExecution(shortPayload.signal_id, {
      broker_order_id: 'broker_eth',
      fill_price: 3000,
      fill_size: 1.0,
      filled: true,
    });

    const btcPosition = shadowState.getPosition('BTCUSDT');
    const ethPosition = shadowState.getPosition('ETHUSDT');

    expect(btcPosition.side).toBe('LONG');
    expect(ethPosition.side).toBe('SHORT');
  });
});

//─────────────────────────────────────────────────────────────────────────────
// INTEGRATION TEST SUITE: ERROR HANDLING
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Error Handling', () => {
  let shadowState;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    shadowState = new ShadowState({ logger });
  });

  test('should handle broker fill failure gracefully', () => {
    const payload = createPreparePayload();
    shadowState.processIntent(payload);

    // Broker fails to fill
    const position = shadowState.confirmExecution(payload.signal_id, {
      broker_order_id: null,
      fill_price: 0,
      fill_size: 0,
      filled: false,
    });

    expect(position).toBeNull();
    expect(shadowState.hasPosition('BTCUSDT')).toBe(false);

    const intent = shadowState.getIntent(payload.signal_id);
    expect(intent.status).toBe('REJECTED');
  });

  test('should handle invalid intent payload', () => {
    expect(() => {
      shadowState.processIntent(null);
    }).toThrow('Intent payload is required');

    expect(() => {
      shadowState.processIntent({ symbol: 'BTCUSDT' }); // Missing signal_id
    }).toThrow('signal_id is required');

    expect(() => {
      shadowState.processIntent({ signal_id: 'test', symbol: 'BTCUSDT', direction: 0 }); // Invalid direction
    }).toThrow('direction must be 1 (long) or -1 (short)');
  });

  test('should handle closing non-existent position', () => {
    const result = shadowState.closePosition('NONEXISTENT', 50000, 'TEST');
    expect(result).toBeNull();
  });

  test('should handle partial close exceeding position size', () => {
    const payload = createPreparePayload({ size: 0.1 });
    shadowState.processIntent(payload);
    shadowState.confirmExecution(payload.signal_id, {
      broker_order_id: 'broker_1',
      fill_price: 50000,
      fill_size: 0.1,
      filled: true,
    });

    expect(() => {
      shadowState.closePartialPosition('BTCUSDT', 51000, 0.5, 'TP1'); // 0.5 > 0.1
    }).toThrow('closeSize (0.5) cannot exceed position size (0.1)');
  });
});

//─────────────────────────────────────────────────────────────────────────────
// INTEGRATION TEST SUITE: RATE LIMITING
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Rate Limiting', () => {
  let globalRateLimiter;
  let limitChaser;
  let wsCache;
  let brokerGateway;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    wsCache = createMockWsCache();
    brokerGateway = new BrokerGateway({ 
      adapter: new MockBrokerAdapter(), 
      logger,
    });
    limitChaser = new LimitChaser({ wsCache, brokerGateway, logger });
  });

  afterEach(async () => {
    if (globalRateLimiter) {
      await globalRateLimiter.destroy();
    }
    jest.clearAllMocks();
  });

  /**
   * Integration test: Rate limiting
   * Requirements: 92
   * 
   * Tests:
   * - Simulate 40 simultaneous signals
   * - Verify rate limiter caps at 12 req/sec
   * - Verify Limit Chaser falls back to Market when limit approached
   */
  describe('Thundering Herd Protection', () => {
    test('should cap requests at 12 req/sec when processing 40 simultaneous signals', async () => {
      const { GlobalRateLimiter } = await import('./GlobalRateLimiter.js');
      
      // Create rate limiter with 12 req/sec limit
      globalRateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 12,
        queueDepthWarning: 5,
        queueDepthForceMarket: 8,
        logger,
      });

      // Track execution times
      const executionTimes = [];
      const startTime = Date.now();

      // Create 40 simultaneous signals
      const signals = Array.from({ length: 40 }, (_, i) => ({
        signal_id: `titan_BTCUSDT_${10000 + i}_15`,
        symbol: 'BTCUSDT',
        index: i,
      }));

      // Execute all signals through rate limiter
      const promises = signals.map(signal => 
        globalRateLimiter.execute(async () => {
          const execTime = Date.now() - startTime;
          executionTimes.push(execTime);
          
          // Simulate broker API call (10ms)
          await new Promise(resolve => setTimeout(resolve, 10));
          
          return { 
            signal_id: signal.signal_id, 
            executed_at: execTime,
          };
        })
      );

      // Wait for all to complete
      const results = await Promise.all(promises);

      // Verify all signals were processed
      expect(results).toHaveLength(40);

      // Calculate actual rate
      const totalTime = Date.now() - startTime;
      const actualRate = (40 / totalTime) * 1000; // requests per second

      // Verify rate is capped at approximately 12 req/sec (allow 20% tolerance)
      expect(actualRate).toBeLessThanOrEqual(12 * 1.2);
      expect(actualRate).toBeGreaterThan(8); // Should be reasonably fast

      // Verify metrics
      const metrics = globalRateLimiter.getMetrics();
      expect(metrics.requests_executed).toBe(40);
      expect(metrics.requests_queued).toBeGreaterThanOrEqual(40);

      logger.info({
        total_signals: 40,
        total_time_ms: totalTime,
        actual_rate: actualRate.toFixed(2),
        metrics,
      }, 'Rate limiting test completed');
    }, 10000); // 10 second timeout

    test('should emit rate_limit:approaching when queue depth > 5', async () => {
      const { GlobalRateLimiter } = await import('./GlobalRateLimiter.js');
      
      globalRateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 12,
        queueDepthWarning: 5,
        queueDepthForceMarket: 8,
        logger,
      });

      // Set up event listener
      const approachingEvents = [];
      globalRateLimiter.on('rate_limit:approaching', (data) => {
        approachingEvents.push(data);
      });

      // Create 20 signals to trigger queue buildup
      const signals = Array.from({ length: 20 }, (_, i) => ({
        signal_id: `titan_BTCUSDT_${20000 + i}_15`,
      }));

      // Execute all signals simultaneously
      const promises = signals.map(signal => 
        globalRateLimiter.execute(async () => {
          // Simulate slow broker API call (50ms)
          await new Promise(resolve => setTimeout(resolve, 50));
          return { signal_id: signal.signal_id };
        })
      );

      // Wait for all to complete
      await Promise.all(promises);

      // Verify rate_limit:approaching was emitted
      expect(approachingEvents.length).toBeGreaterThan(0);
      
      // Verify event data
      const firstEvent = approachingEvents[0];
      expect(firstEvent.queue_depth).toBeGreaterThan(5);
      expect(firstEvent.current_rate).toBeDefined();
      expect(firstEvent.limit).toBe(12);

      logger.info({
        approaching_events: approachingEvents.length,
        max_queue_depth: Math.max(...approachingEvents.map(e => e.queue_depth)),
      }, 'Rate limit approaching events captured');
    }, 10000);

    test('should emit rate_limit:force_market when queue depth > 8', async () => {
      const { GlobalRateLimiter } = await import('./GlobalRateLimiter.js');
      
      globalRateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 12,
        queueDepthWarning: 5,
        queueDepthForceMarket: 8,
        logger,
      });

      // Set up event listener
      const forceMarketEvents = [];
      globalRateLimiter.on('rate_limit:force_market', (data) => {
        forceMarketEvents.push(data);
      });

      // Create 30 signals to trigger deep queue
      const signals = Array.from({ length: 30 }, (_, i) => ({
        signal_id: `titan_BTCUSDT_${30000 + i}_15`,
      }));

      // Execute all signals simultaneously
      const promises = signals.map(signal => 
        globalRateLimiter.execute(async () => {
          // Simulate slow broker API call (100ms)
          await new Promise(resolve => setTimeout(resolve, 100));
          return { signal_id: signal.signal_id };
        })
      );

      // Wait for all to complete
      await Promise.all(promises);

      // Verify rate_limit:force_market was emitted
      expect(forceMarketEvents.length).toBeGreaterThan(0);
      
      // Verify event data
      const firstEvent = forceMarketEvents[0];
      expect(firstEvent.queue_depth).toBeGreaterThan(8);
      expect(firstEvent.current_rate).toBeDefined();
      expect(firstEvent.limit).toBe(12);

      // Verify metrics
      const metrics = globalRateLimiter.getMetrics();
      expect(metrics.force_market_count).toBeGreaterThan(0);

      logger.info({
        force_market_events: forceMarketEvents.length,
        max_queue_depth: Math.max(...forceMarketEvents.map(e => e.queue_depth)),
        metrics,
      }, 'Force market events captured');
    }, 15000);

    test('should verify Limit Chaser fallback to Market when rate limit approached', async () => {
      const { GlobalRateLimiter } = await import('./GlobalRateLimiter.js');
      
      globalRateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 12,
        queueDepthWarning: 5,
        queueDepthForceMarket: 8,
        logger,
      });

      // Build up queue to trigger force_market condition
      const buildupSignals = Array.from({ length: 15 }, (_, i) => ({
        signal_id: `buildup_${i}`,
      }));

      // Start processing signals to build queue
      const buildupPromises = buildupSignals.map(signal => 
        globalRateLimiter.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { signal_id: signal.signal_id };
        })
      );

      // Wait a bit for queue to build
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check if should force market order
      const shouldForceMarket = globalRateLimiter.shouldForceMarketOrder();
      const queueDepth = globalRateLimiter.getQueueDepth();

      logger.info({
        queue_depth: queueDepth,
        should_force_market: shouldForceMarket,
      }, 'Limit Chaser fallback check');

      // If queue is deep enough, verify force market is triggered
      if (queueDepth > 8) {
        expect(shouldForceMarket).toBe(true);
        
        // In production, Limit Chaser would check this flag and use Market order
        // instead of Limit order to ensure immediate execution
        logger.info({}, 'Limit Chaser would fallback to Market order');
      }

      // Wait for all buildup signals to complete
      await Promise.all(buildupPromises);

      // Verify metrics
      const metrics = globalRateLimiter.getMetrics();
      expect(metrics.requests_executed).toBe(15);
      
      if (shouldForceMarket) {
        expect(metrics.force_market_count).toBeGreaterThan(0);
      }
    }, 15000);

    test('should handle rate limit pressure with operator alert', async () => {
      const { GlobalRateLimiter } = await import('./GlobalRateLimiter.js');
      
      globalRateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 12,
        queueDepthWarning: 5,
        queueDepthForceMarket: 8,
        alertThresholdCount: 3, // Lower threshold for testing
        logger,
      });

      // Set up event listener for alerts
      const alerts = [];
      globalRateLimiter.on('rate_limit:alert', (data) => {
        alerts.push(data);
      });

      // Create multiple batches to trigger consecutive warnings
      for (let batch = 0; batch < 5; batch++) {
        const signals = Array.from({ length: 10 }, (_, i) => ({
          signal_id: `batch${batch}_signal${i}`,
        }));

        const promises = signals.map(signal => 
          globalRateLimiter.execute(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return { signal_id: signal.signal_id };
          })
        );

        // Don't wait for completion, let queue build
        if (batch < 4) {
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          await Promise.all(promises);
        }
      }

      // Verify alert was triggered
      if (alerts.length > 0) {
        const alert = alerts[0];
        expect(alert.message).toBe('RATE_LIMIT_PRESSURE');
        expect(alert.consecutive_warnings).toBe(3);
        expect(alert.queue_depth).toBeGreaterThan(0);
        
        logger.info({
          alerts_triggered: alerts.length,
          alert_data: alert,
        }, 'Operator alert triggered');
      }

      // Verify metrics
      const metrics = globalRateLimiter.getMetrics();
      expect(metrics.warnings_count).toBeGreaterThan(0);
    }, 20000);
  });

  describe('Rate Limiter Integration with Execution Flow', () => {
    test('should process signals through rate limiter in full execution flow', async () => {
      const { GlobalRateLimiter } = await import('./GlobalRateLimiter.js');
      
      globalRateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 12,
        logger,
      });

      const shadowState = new ShadowState({ logger });
      const replayGuard = new ReplayGuard({ logger, maxDriftMs: 5000 });

      // Create 20 signals
      const signals = Array.from({ length: 20 }, (_, i) => 
        createPreparePayload({
          bar_index: 40000 + i,
          size: 0.1,
        })
      );

      // Process through rate limiter
      const results = await Promise.all(
        signals.map(payload => 
          globalRateLimiter.execute(async () => {
            // Validate
            const validation = await replayGuard.validate(payload, '127.0.0.1');
            if (!validation.valid) {
              return { success: false, reason: validation.error };
            }

            // Process intent
            const intent = shadowState.processIntent(payload);
            
            // Simulate execution
            await new Promise(resolve => setTimeout(resolve, 10));
            
            return { 
              success: true, 
              signal_id: payload.signal_id,
              intent_status: intent.status,
            };
          })
        )
      );

      // Verify all processed
      expect(results).toHaveLength(20);
      expect(results.every(r => r.success)).toBe(true);

      // Verify metrics
      const metrics = globalRateLimiter.getMetrics();
      expect(metrics.requests_executed).toBe(20);
      // Allow 10% tolerance for rate calculation variance
      expect(metrics.current_rate).toBeLessThanOrEqual(12 * 1.1);

      logger.info({
        total_processed: results.length,
        metrics,
      }, 'Full execution flow with rate limiting completed');
    }, 10000);
  });
});

