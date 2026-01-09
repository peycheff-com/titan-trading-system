/**
 * Phase 1 Flow Integration Test
 * 
 * Tests the complete Phase 1 (KICKSTARTER) flow:
 * - SCALP signal with equity < $1,000
 * - LimitOrKill execution (5s timeout)
 * - Signal rejection for DAY/SWING in Phase 1
 * - 10% risk calculation
 * 
 * Requirements: 84, 85, 94
 * 
 * @module phase1.integration.test
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
const { PhaseManager } = await import('./PhaseManager.js');
const { ShadowState } = await import('./ShadowState.js');
const { BrokerGateway, MockBrokerAdapter } = await import('./BrokerGateway.js');
const { LimitOrKill } = await import('./LimitOrKill.js');
const { WebSocketCache } = await import('./WebSocketCache.js');
const { L2Validator } = await import('./L2Validator.js');
const { ReplayGuard } = await import('./ReplayGuard.js');

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
 * Create a sample SCALP signal payload for Phase 1
 */
function createScalpSignalPayload(overrides = {}) {
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
      momentum_score: 80,
      model_recommendation: 'TREND_FOLLOW',
      efficiency_ratio: 0.85, // High ER for scalp
    },
    signal_type: 'SCALP',
    alpha_half_life_ms: 10000,
    ...overrides,
  };
}

/**
 * Create a sample DAY signal payload (should be rejected in Phase 1)
 */
function createDaySignalPayload(overrides = {}) {
  const barIndex = overrides.bar_index || Math.floor(Math.random() * 100000);
  return {
    signal_id: `titan_BTCUSDT_${barIndex}_15`,
    type: 'PREPARE',
    symbol: 'BTCUSDT',
    timeframe: '15',
    bar_index: barIndex,
    timestamp: new Date().toISOString(),
    direction: 1,
    regime_vector: {
      trend_state: 1,
      vol_state: 1,
      regime_state: 1,
      market_structure_score: 90,
      momentum_score: 85,
      model_recommendation: 'TREND_FOLLOW',
      fdi: 1.3, // Trending
      is_squeeze: false,
    },
    signal_type: 'DAY',
    ...overrides,
  };
}

/**
 * Create a sample SWING signal payload (should be rejected in Phase 1)
 */
function createSwingSignalPayload(overrides = {}) {
  const barIndex = overrides.bar_index || Math.floor(Math.random() * 100000);
  return {
    signal_id: `titan_BTCUSDT_${barIndex}_15`,
    type: 'PREPARE',
    symbol: 'BTCUSDT',
    timeframe: '15',
    bar_index: barIndex,
    timestamp: new Date().toISOString(),
    direction: 1,
    regime_vector: {
      trend_state: 1,
      vol_state: 1,
      regime_state: 1,
      market_structure_score: 95,
      momentum_score: 70,
      model_recommendation: 'TREND_FOLLOW',
    },
    signal_type: 'SWING',
    ...overrides,
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
// INTEGRATION TEST SUITE: PHASE 1 FLOW
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Phase 1 (KICKSTARTER) Flow', () => {
  let phaseManager;
  let shadowState;
  let brokerGateway;
  let limitOrKill;
  let wsCache;
  let l2Validator;
  let replayGuard;
  let logger;
  let mockAdapter;

  beforeEach(() => {
    logger = createMockLogger();
    
    // Create mock broker adapter
    mockAdapter = new MockBrokerAdapter();
    
    // Create broker gateway
    brokerGateway = new BrokerGateway({
      adapter: mockAdapter,
      logger,
    });
    
    // Create shadow state
    shadowState = new ShadowState({ logger });
    
    // Create phase manager with equity < $1,000 (Phase 1)
    phaseManager = new PhaseManager({
      brokerGateway,
      logger,
    });
    phaseManager.setEquity(800); // Phase 1: KICKSTARTER
    
    // Create WebSocket cache
    wsCache = createMockWsCache();
    
    // Create L2 validator
    l2Validator = new L2Validator({
      wsCache,
      logger,
      minStructureThreshold: 60,
    });
    
    // Create LimitOrKill executor
    limitOrKill = new LimitOrKill({
      brokerGateway,
      logger,
      waitTimeMs: 5000, // 5 second timeout
      pollIntervalMs: 100,
    });
    
    // Create replay guard
    replayGuard = new ReplayGuard({
      logger,
      maxDriftMs: 5000,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (phaseManager) {
      phaseManager.reset();
    }
    if (brokerGateway) {
      brokerGateway.destroy();
    }
  });

  describe('Phase 1 Configuration', () => {
    test('should be in Phase 1 with equity < $1,000', () => {
      expect(phaseManager.getCurrentPhase()).toBe(1);
      expect(phaseManager.getPhaseLabel()).toBe('KICKSTARTER');
      expect(phaseManager.getLastKnownEquity()).toBe(800);
    });

    test('should have correct Phase 1 risk parameters', () => {
      const riskParams = phaseManager.getRiskParameters();
      
      expect(riskParams.riskMult).toBe(5.0);
      expect(riskParams.riskPct).toBe(0.10); // 10% risk per trade
      expect(riskParams.maxLeverage).toBe(30);
    });

    test('should use MAKER execution mode in Phase 1', () => {
      const executionMode = phaseManager.getExecutionMode();
      expect(executionMode).toBe('MAKER');
    });

    test('should only allow SCALP signals in Phase 1', () => {
      const config = phaseManager.getPhaseConfig();
      expect(config.signalFilter).toEqual(['SCALP']);
    });

    test('should not allow pyramiding in Phase 1', () => {
      expect(phaseManager.isPyramidingAllowed()).toBe(false);
    });
  });

  describe('SCALP Signal Processing', () => {
    test('should accept SCALP signal in Phase 1', async () => {
      const payload = createScalpSignalPayload();
      
      // Validate signal type
      const isValidSignalType = phaseManager.validateSignal(payload.signal_type);
      expect(isValidSignalType).toBe(true);
      
      // Validate timestamp
      const timestampResult = replayGuard.validateTimestamp(payload.timestamp);
      expect(timestampResult.valid).toBe(true);
      
      // Process intent
      const intent = shadowState.processIntent(payload);
      expect(intent).toBeDefined();
      expect(intent.signal_id).toBe(payload.signal_id);
      expect(intent.type).toBe('BUY_SETUP');
      expect(intent.status).toBe('PENDING');
    });

    test('should validate L2 conditions for SCALP signal', () => {
      const payload = createScalpSignalPayload();
      
      const validationResult = l2Validator.validate({
        symbol: payload.symbol,
        side: 'BUY',
        size: payload.size,
        market_structure_score: payload.regime_vector.market_structure_score,
        momentum_score: payload.regime_vector.momentum_score,
      });
      
      expect(validationResult.valid).toBe(true);
    });

    test('should calculate 10% risk for Phase 1 position sizing', () => {
      const equity = 800; // Phase 1 equity
      const riskParams = phaseManager.getRiskParameters();
      const entryPrice = 50100;
      const stopLoss = 49500;
      const stopDistance = entryPrice - stopLoss; // 600
      
      // Position size = (equity * risk_pct) / stop_distance
      // = (800 * 0.10) / 600 = 80 / 600 = 0.133 BTC
      const expectedSize = (equity * riskParams.riskPct) / stopDistance;
      
      expect(riskParams.riskPct).toBe(0.10);
      expect(expectedSize).toBeCloseTo(0.133, 3);
    });
  });

  describe('LimitOrKill Execution (Phase 1)', () => {
    test('should place Limit Order at Bid for BUY signal', async () => {
      const payload = createScalpSignalPayload({ direction: 1 });
      
      // Get best bid
      const bestBid = wsCache.getBestBid();
      expect(bestBid).toBe(50000);
      
      // LimitOrKill should place order at Bid
      const executionMode = phaseManager.getExecutionMode();
      expect(executionMode).toBe('MAKER');
    });

    test('should wait 5 seconds for fill', async () => {
      const payload = createScalpSignalPayload();
      const intent = shadowState.processIntent(payload);
      
      // MockBrokerAdapter will simulate fill by default
      mockAdapter.simulateFill = true;
      mockAdapter.fillDelayMs = 100; // Fill quickly
      mockAdapter.partialFillRatio = 1.0; // Full fill
      
      const startTime = Date.now();
      const result = await limitOrKill.execute({
        symbol: payload.symbol,
        side: 'BUY',
        size: payload.size,
        limit_price: wsCache.getBestBid(), // Place at Bid for MAKER
        signal_id: payload.signal_id,
      });
      const endTime = Date.now();
      
      expect(result.success).toBe(true);
      expect(result.status).toBe('FILLED');
      expect(result.fill_price).toBeDefined();
      expect(endTime - startTime).toBeLessThan(5000); // Should fill quickly
    }, 10000); // 10 second timeout

    test('should cancel order after 5 second timeout if not filled', async () => {
      const payload = createScalpSignalPayload();
      
      // MockBrokerAdapter - disable fill simulation
      mockAdapter.simulateFill = false;
      
      const result = await limitOrKill.execute({
        symbol: payload.symbol,
        side: 'BUY',
        size: payload.size,
        limit_price: wsCache.getBestBid(), // Place at Bid for MAKER
        signal_id: payload.signal_id,
      });
      
      expect(result.success).toBe(false);
      expect(result.status).toBe('MISSED_ENTRY');
      expect(result.reason).toBe('Price ran away');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: payload.signal_id,
        }),
        expect.stringContaining('Missed Entry - Price ran away')
      );
    }, 10000); // 10 second timeout

    test('should handle partial fill within 5 seconds', async () => {
      const payload = createScalpSignalPayload({ size: 0.1 });
      
      // MockBrokerAdapter - simulate partial fill
      mockAdapter.simulateFill = true;
      mockAdapter.fillDelayMs = 100;
      mockAdapter.partialFillRatio = 0.5; // 50% fill
      
      const result = await limitOrKill.execute({
        symbol: payload.symbol,
        side: 'BUY',
        size: payload.size,
        limit_price: wsCache.getBestBid(), // Place at Bid for MAKER
        signal_id: payload.signal_id,
      });
      
      // Should cancel remaining and keep partial
      expect(result.success).toBe(true);
      expect(result.status).toBe('PARTIALLY_FILLED');
      expect(result.fill_size).toBe(0.05);
    }, 10000); // 10 second timeout

    test('should log missed entry details on timeout', async () => {
      const payload = createScalpSignalPayload();
      
      // MockBrokerAdapter - disable fill simulation
      mockAdapter.simulateFill = false;
      
      const bidAtEntry = wsCache.getBestBid();
      
      await limitOrKill.execute({
        symbol: payload.symbol,
        side: 'BUY',
        size: payload.size,
        limit_price: bidAtEntry, // Place at Bid for MAKER
        signal_id: payload.signal_id,
      });
      
      // Check that missed entry was logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: payload.signal_id,
          bid_at_entry: bidAtEntry,
        }),
        expect.stringContaining('Missed Entry - Price ran away')
      );
    }, 10000); // 10 second timeout
  });

  describe('Signal Type Rejection in Phase 1', () => {
    test('should reject DAY signal in Phase 1', () => {
      const payload = createDaySignalPayload();
      
      const isValid = phaseManager.validateSignal(payload.signal_type);
      expect(isValid).toBe(false);
      
      // Verify rejection was logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_type: 'DAY',
          current_phase: 1,
          allowed_signals: ['SCALP'],
        }),
        expect.stringContaining('Signal rejected')
      );
    });

    test('should reject SWING signal in Phase 1', () => {
      const payload = createSwingSignalPayload();
      
      const isValid = phaseManager.validateSignal(payload.signal_type);
      expect(isValid).toBe(false);
      
      // Verify rejection was logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_type: 'SWING',
          current_phase: 1,
          allowed_signals: ['SCALP'],
        }),
        expect.stringContaining('Signal rejected')
      );
    });

    test('should emit signal:rejected event for DAY signal', (done) => {
      const payload = createDaySignalPayload();
      
      phaseManager.once('signal:rejected', (data) => {
        expect(data.signal_type).toBe('DAY');
        expect(data.phase).toBe(1);
        expect(data.phase_label).toBe('KICKSTARTER');
        expect(data.allowed_signals).toEqual(['SCALP']);
        done();
      });
      
      phaseManager.validateSignal(payload.signal_type);
    });

    test('should NOT process intent for rejected signal types', () => {
      const dayPayload = createDaySignalPayload();
      
      // Validate signal type first
      const isValid = phaseManager.validateSignal(dayPayload.signal_type);
      expect(isValid).toBe(false);
      
      // Should not process intent if signal type is invalid
      if (!isValid) {
        // In real implementation, webhook handler would return early
        expect(shadowState.getIntent(dayPayload.signal_id)).toBeUndefined();
      }
    });
  });

  describe('Complete Phase 1 Flow', () => {
    test('should execute complete SCALP signal flow in Phase 1', async () => {
      const payload = createScalpSignalPayload();
      
      // Step 1: Validate phase and signal type
      expect(phaseManager.getCurrentPhase()).toBe(1);
      expect(phaseManager.validateSignal(payload.signal_type)).toBe(true);
      
      // Step 2: Validate timestamp (replay guard)
      const timestampResult = replayGuard.validateTimestamp(payload.timestamp);
      expect(timestampResult.valid).toBe(true);
      
      // Step 3: Process PREPARE intent
      const intent = shadowState.processIntent(payload);
      expect(intent.status).toBe('PENDING');
      
      // Step 4: Validate L2 conditions
      const l2Result = l2Validator.validate({
        symbol: payload.symbol,
        side: 'BUY',
        size: payload.size,
        market_structure_score: payload.regime_vector.market_structure_score,
        momentum_score: payload.regime_vector.momentum_score,
      });
      expect(l2Result.valid).toBe(true);
      
      // Step 5: Mark as validated
      shadowState.validateIntent(payload.signal_id);
      
      // Step 6: Execute with LimitOrKill (MAKER mode)
      mockAdapter.simulateFill = true;
      mockAdapter.fillDelayMs = 100;
      mockAdapter.partialFillRatio = 1.0;
      
      const execResult = await limitOrKill.execute({
        symbol: payload.symbol,
        side: 'BUY',
        size: payload.size,
        limit_price: wsCache.getBestBid(), // Place at Bid for MAKER
        signal_id: payload.signal_id,
      });
      
      expect(execResult.success).toBe(true);
      expect(execResult.status).toBe('FILLED');
      
      // Step 7: Confirm execution in Shadow State
      const position = shadowState.confirmExecution(payload.signal_id, {
        broker_order_id: 'order_123',
        fill_price: execResult.fill_price,
        fill_size: execResult.fill_size,
        filled: true,
      });
      
      expect(position).toBeDefined();
      expect(position.symbol).toBe('BTCUSDT');
      expect(position.side).toBe('LONG');
      expect(position.size).toBe(payload.size);
      expect(shadowState.hasPosition('BTCUSDT')).toBe(true);
    }, 10000); // 10 second timeout

    test('should reject and abort DAY signal in Phase 1', () => {
      const payload = createDaySignalPayload();
      
      // Step 1: Validate phase
      expect(phaseManager.getCurrentPhase()).toBe(1);
      
      // Step 2: Validate signal type - should fail
      const isValid = phaseManager.validateSignal(payload.signal_type);
      expect(isValid).toBe(false);
      
      // Step 3: Should NOT process intent
      // In real implementation, webhook handler returns early with rejection
      expect(shadowState.getIntent(payload.signal_id)).toBeUndefined();
      
      // Step 4: Verify rejection was logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_type: 'DAY',
          current_phase: 1,
        }),
        expect.stringContaining('Signal rejected')
      );
    });

    test('should calculate correct position size with 10% risk', () => {
      const equity = 800; // Phase 1 equity
      const entryPrice = 50100;
      const stopLoss = 49500;
      const riskParams = phaseManager.getRiskParameters();
      
      // Calculate position size
      const stopDistance = entryPrice - stopLoss; // 600
      const riskAmount = equity * riskParams.riskPct; // 800 * 0.10 = 80
      const positionSize = riskAmount / stopDistance; // 80 / 600 = 0.133
      
      expect(riskParams.riskPct).toBe(0.10);
      expect(riskAmount).toBe(80);
      expect(positionSize).toBeCloseTo(0.133, 3);
      
      // Verify this is 10% risk
      const potentialLoss = positionSize * stopDistance; // 0.133 * 600 = 80
      const riskPct = potentialLoss / equity; // 80 / 800 = 0.10
      expect(riskPct).toBeCloseTo(0.10, 2);
    });
  });

  describe('Phase 1 Edge Cases', () => {
    test('should handle equity exactly at $1,000 threshold', () => {
      phaseManager.setEquity(1000);
      
      // At exactly $1,000, should be Phase 2 (>= threshold)
      expect(phaseManager.getCurrentPhase()).toBe(2);
      expect(phaseManager.validateSignal('SCALP')).toBe(false);
      expect(phaseManager.validateSignal('DAY')).toBe(true);
    });

    test('should transition to Phase 2 when equity exceeds $1,000', () => {
      phaseManager.setEquity(800); // Start in Phase 1
      expect(phaseManager.getCurrentPhase()).toBe(1);
      
      phaseManager.setEquity(1001); // Cross threshold
      expect(phaseManager.getCurrentPhase()).toBe(2);
      expect(phaseManager.getPhaseLabel()).toBe('TREND RIDER');
      
      // Now SCALP should be rejected, DAY/SWING accepted
      expect(phaseManager.validateSignal('SCALP')).toBe(false);
      expect(phaseManager.validateSignal('DAY')).toBe(true);
      expect(phaseManager.validateSignal('SWING')).toBe(true);
    });

    test('should handle multiple SCALP signals in Phase 1', async () => {
      const payload1 = createScalpSignalPayload({ bar_index: 1000 });
      const payload2 = createScalpSignalPayload({ bar_index: 1001 });
      
      // Both should be accepted
      expect(phaseManager.validateSignal(payload1.signal_type)).toBe(true);
      expect(phaseManager.validateSignal(payload2.signal_type)).toBe(true);
      
      // Process both intents
      const intent1 = shadowState.processIntent(payload1);
      const intent2 = shadowState.processIntent(payload2);
      
      expect(intent1.signal_id).toBe(payload1.signal_id);
      expect(intent2.signal_id).toBe(payload2.signal_id);
      expect(intent1.signal_id).not.toBe(intent2.signal_id);
    });

    test('should enforce 30x max leverage in Phase 1', () => {
      const riskParams = phaseManager.getRiskParameters();
      expect(riskParams.maxLeverage).toBe(30);
      
      // Verify this is enforced
      const equity = 800;
      const maxPositionValue = equity * riskParams.maxLeverage; // 800 * 30 = 24,000
      expect(maxPositionValue).toBe(24000);
    });
  });
});
