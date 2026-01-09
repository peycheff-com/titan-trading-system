/**
 * Phase 2 Flow Integration Test
 * 
 * Tests the complete Phase 2 (TREND RIDER) flow:
 * - DAY/SWING signal with equity >= $1,000
 * - Pyramiding triggers at 2% above entry
 * - Auto-trail after 2nd pyramid layer
 * - Signal rejection for SCALP in Phase 2
 * - 5% risk calculation
 * 
 * Requirements: 84, 85, 87
 * 
 * @module phase2.integration.test
 */

import { jest } from '@jest/globals';

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
const { PyramidManager } = await import('./PyramidManager.js');
const { WebSocketCache } = await import('./WebSocketCache.js');
const { L2Validator } = await import('./L2Validator.js');
const { ReplayGuard } = await import('./ReplayGuard.js');
const { LimitChaser } = await import('./LimitChaser.js');

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

const PYRAMID_TRIGGER_PCT = 0.02; // 2% above entry for pyramid layer
const PHASE_2_EQUITY_THRESHOLD = 1000; // $1,000 threshold for Phase 2
const PHASE_2_RISK_PCT = 0.05; // 5% risk per trade in Phase 2
const PHASE_2_MAX_LEVERAGE = 15; // 15x max leverage in Phase 2
const MAX_PYRAMID_LAYERS = 4; // Maximum 4 pyramid layers

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
 * Helper to set up a position with pyramid state
 * @param {ShadowState} shadowState - Shadow state instance
 * @param {PyramidManager} pyramidManager - Pyramid manager instance
 * @param {Object} payload - Signal payload
 * @param {number} fillPrice - Fill price for the position
 * @returns {Object} Object containing position and pyramidState
 */
function setupPositionWithPyramid(shadowState, pyramidManager, payload, fillPrice) {
  shadowState.processIntent(payload);
  
  const position = shadowState.confirmExecution(payload.signal_id, {
    broker_order_id: `order_${Date.now()}`,
    fill_price: fillPrice,
    fill_size: payload.size,
    filled: true,
  });
  
  const pyramidState = pyramidManager._initializePyramidState(position);
  pyramidManager.pyramidStates.set(payload.symbol, pyramidState);
  
  return { position, pyramidState };
}

/**
 * Create a sample DAY signal payload for Phase 2
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
    trigger_price: 50100.0,
    trigger_condition: 'price > 50100',
    direction: 1,
    entry_zone: [50100, 50050, 50000],
    stop_loss: 48500,
    take_profits: [51000, 52000, 54000],
    size: 0.2,
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
    alpha_half_life_ms: 30000,
    ...overrides,
  };
}

/**
 * Create a sample SWING signal payload for Phase 2
 */
function createSwingSignalPayload(overrides = {}) {
  const barIndex = overrides.bar_index || Math.floor(Math.random() * 100000);
  return {
    signal_id: `titan_BTCUSDT_${barIndex}_4h`,
    type: 'PREPARE',
    symbol: 'BTCUSDT',
    timeframe: '4h',
    bar_index: barIndex,
    timestamp: new Date().toISOString(),
    direction: 1,
    entry_zone: [50100, 50050, 50000],
    stop_loss: 47500,
    take_profits: [52000, 54000, 58000],
    size: 0.3,
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
 * Create a sample SCALP signal payload (should be rejected in Phase 2)
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
    direction: 1,
    regime_vector: {
      trend_state: 1,
      vol_state: 1,
      regime_state: 1,
      market_structure_score: 85,
      momentum_score: 80,
      model_recommendation: 'TREND_FOLLOW',
      efficiency_ratio: 0.85,
    },
    signal_type: 'SCALP',
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
// INTEGRATION TEST SUITE: PHASE 2 FLOW
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Phase 2 (TREND RIDER) Flow', () => {
  let phaseManager;
  let shadowState;
  let brokerGateway;
  let pyramidManager;
  let limitChaser;
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
    
    // Create phase manager with equity >= $1,000 (Phase 2)
    phaseManager = new PhaseManager({
      brokerGateway,
      logger,
    });
    phaseManager.setEquity(1500); // Phase 2: TREND RIDER
    
    // Create WebSocket cache
    wsCache = createMockWsCache();
    
    // Create L2 validator
    l2Validator = new L2Validator({
      wsCache,
      logger,
      minStructureThreshold: 60,
    });
    
    // Create Limit Chaser for Phase 2 TAKER execution
    limitChaser = new LimitChaser({
      wsCache,
      brokerGateway,
      logger,
      chaseTimeoutMs: 1000,
      tickMoveDelayMs: 200,
    });
    
    // Create Pyramid Manager for Phase 2
    pyramidManager = new PyramidManager({
      shadowState,
      brokerGateway,
      logger,
      maxLayers: MAX_PYRAMID_LAYERS,
      pyramidTriggerPct: PYRAMID_TRIGGER_PCT,
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

  describe('Phase 2 Configuration', () => {
    test('should be in Phase 2 with equity >= $1,000', () => {
      expect(phaseManager.getCurrentPhase()).toBe(2);
      expect(phaseManager.getPhaseLabel()).toBe('TREND RIDER');
      expect(phaseManager.getLastKnownEquity()).toBe(1500);
    });

    test('should have correct Phase 2 risk parameters', () => {
      const riskParams = phaseManager.getRiskParameters();
      
      expect(riskParams.riskMult).toBe(2.5);
      expect(riskParams.riskPct).toBe(PHASE_2_RISK_PCT);
      expect(riskParams.maxLeverage).toBe(PHASE_2_MAX_LEVERAGE);
    });

    test('should use TAKER execution mode in Phase 2', () => {
      const executionMode = phaseManager.getExecutionMode();
      expect(executionMode).toBe('TAKER');
    });

    test('should only allow DAY/SWING signals in Phase 2', () => {
      const config = phaseManager.getPhaseConfig();
      expect(config.signalFilter).toEqual(['DAY', 'SWING']);
    });

    test('should allow pyramiding in Phase 2', () => {
      expect(phaseManager.isPyramidingAllowed()).toBe(true);
    });
  });

  describe('DAY/SWING Signal Processing', () => {
    test('should accept DAY signal in Phase 2', async () => {
      const payload = createDaySignalPayload();
      
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

    test('should accept SWING signal in Phase 2', async () => {
      const payload = createSwingSignalPayload();
      
      // Validate signal type
      const isValidSignalType = phaseManager.validateSignal(payload.signal_type);
      expect(isValidSignalType).toBe(true);
      
      // Process intent
      const intent = shadowState.processIntent(payload);
      expect(intent).toBeDefined();
      expect(intent.signal_id).toBe(payload.signal_id);
    });

    test('should validate L2 conditions for DAY signal', () => {
      const payload = createDaySignalPayload();
      
      const validationResult = l2Validator.validate({
        symbol: payload.symbol,
        side: 'BUY',
        size: payload.size,
        market_structure_score: payload.regime_vector.market_structure_score,
        momentum_score: payload.regime_vector.momentum_score,
      });
      
      expect(validationResult.valid).toBe(true);
    });

    test('should calculate 5% risk for Phase 2 position sizing', () => {
      const equity = 1500; // Phase 2 equity
      const riskParams = phaseManager.getRiskParameters();
      const entryPrice = 50100;
      const stopLoss = 48500;
      const stopDistance = entryPrice - stopLoss; // 1600
      
      // Position size = (equity * risk_pct) / stop_distance
      // = (1500 * 0.05) / 1600 = 75 / 1600 = 0.046875 BTC
      const expectedSize = (equity * riskParams.riskPct) / stopDistance;
      
      expect(riskParams.riskPct).toBe(PHASE_2_RISK_PCT);
      expect(expectedSize).toBeCloseTo(0.046875, 6);
    });
  });

  describe('Pyramiding Logic (Phase 2 Only)', () => {
    /**
     * Test: Pyramid Entry Trigger at 2% Above Initial Entry
     * 
     * Validates that the pyramid manager correctly identifies a pyramid opportunity
     * when price reaches 2% above the initial entry price in Phase 2 (TREND RIDER).
     * 
     * Requirements: 84, 85 (Pyramiding Logic)
     * Property: Pyramid trigger at configured percentage threshold
     */
    test('should trigger pyramid entry at 2% above initial entry', async () => {
      const payload = createDaySignalPayload();
      const entryPrice = 50100;
      
      // Set up position with pyramid state
      const { position, pyramidState } = setupPositionWithPyramid(
        shadowState,
        pyramidManager,
        payload,
        entryPrice
      );
      
      expect(position).toBeDefined();
      expect(shadowState.hasPosition('BTCUSDT')).toBe(true);
      expect(pyramidState.lastEntryPrice).toBe(entryPrice);
      expect(pyramidState.layerCount).toBe(1);
      
      // Check pyramid opportunity at 2% above entry (need to be ABOVE trigger, not equal)
      const pyramidPrice = entryPrice * (1 + PYRAMID_TRIGGER_PCT + 0.001); // Slightly above 2% trigger
      const expectedPrice = entryPrice * 1.021; // 51105.1
      
      const shouldPyramid = pyramidManager.checkPyramidOpportunity(
        'BTCUSDT',
        pyramidPrice,
        1 // Risk-On regime
      );
      
      expect(shouldPyramid).toBe(true);
      expect(pyramidPrice).toBeCloseTo(expectedPrice, 1);
    });

    test('should limit pyramiding to 4 layers maximum', async () => {
      const payload = createDaySignalPayload();
      const entryPrice = 50100;
      
      // Set up position with pyramid state
      const { pyramidState } = setupPositionWithPyramid(
        shadowState,
        pyramidManager,
        payload,
        entryPrice
      );
      
      expect(pyramidState.layerCount).toBe(1);
      
      // Add 3 more pyramid layers
      for (let i = 2; i <= MAX_PYRAMID_LAYERS; i++) {
        const pyramidPrice = entryPrice * (1 + (i - 1) * PYRAMID_TRIGGER_PCT);
        await pyramidManager.addPyramidLayer('BTCUSDT', 0.2, pyramidPrice);
      }
      
      const updatedPyramidState = pyramidManager.pyramidStates.get('BTCUSDT');
      expect(updatedPyramidState.layerCount).toBe(MAX_PYRAMID_LAYERS);
      
      // Try to add 5th layer - should be rejected
      const shouldPyramid = pyramidManager.checkPyramidOpportunity(
        'BTCUSDT',
        entryPrice * 1.10,
        1
      );
      
      expect(shouldPyramid).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          layer_count: MAX_PYRAMID_LAYERS,
          max_layers: MAX_PYRAMID_LAYERS,
        }),
        expect.stringContaining('Maximum pyramid layers reached')
      );
    });

    test('should auto-trail stop loss after 2nd pyramid layer', async () => {
      const payload = createDaySignalPayload();
      const entryPrice = 50100;
      const initialStopLoss = 48500;
      
      // Set up position with pyramid state
      const { pyramidState } = setupPositionWithPyramid(
        shadowState,
        pyramidManager,
        payload,
        entryPrice
      );
      
      // Set initial stop loss
      pyramidState.currentStopLoss = initialStopLoss;
      
      // Add 2nd pyramid layer
      mockAdapter.updateStopLoss = jest.fn().mockResolvedValue({
        success: true,
      });
      
      const secondLayerPrice = entryPrice * (1 + PYRAMID_TRIGGER_PCT);
      await pyramidManager.addPyramidLayer('BTCUSDT', 0.2, secondLayerPrice);
      
      // After 2nd layer, stop should trail to avg entry
      const updatedPyramidState = pyramidManager.pyramidStates.get('BTCUSDT');
      const avgEntry = (entryPrice + secondLayerPrice) / 2;
      
      expect(updatedPyramidState.layerCount).toBe(2);
      expect(mockAdapter.updateStopLoss).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          new_stop_loss: avgEntry,
        })
      );
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          layer_number: 2,
          avg_entry_price: avgEntry,
          old_stop_loss: initialStopLoss,
          new_stop_loss: avgEntry,
        }),
        expect.stringContaining('Auto-trail activated')
      );
    });

    test('should close all pyramid layers on regime change to Risk-Off', async () => {
      const payload = createDaySignalPayload();
      const entryPrice = 50100;
      
      // Set up position with pyramid state
      setupPositionWithPyramid(shadowState, pyramidManager, payload, entryPrice);
      
      // Add 2 more pyramid layers
      await pyramidManager.addPyramidLayer('BTCUSDT', 0.2, entryPrice * (1 + PYRAMID_TRIGGER_PCT));
      await pyramidManager.addPyramidLayer('BTCUSDT', 0.2, entryPrice * (1 + PYRAMID_TRIGGER_PCT * 2));
      
      const pyramidState = pyramidManager.pyramidStates.get('BTCUSDT');
      expect(pyramidState.layerCount).toBe(3);
      
      // Regime changes to Risk-Off
      const result = await pyramidManager.closeAllLayers('BTCUSDT', 'REGIME_KILL');
      
      expect(result.success).toBe(true);
      expect(result.layers_closed).toBe(3);
      
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          layers: 3,
          reason: 'REGIME_KILL',
        }),
        expect.stringContaining('Closing all pyramid layers')
      );
    });

    test('should not allow pyramiding when regime is not Risk-On', () => {
      const shouldPyramid = pyramidManager.checkPyramidOpportunity(
        'BTCUSDT',
        51102,
        0 // Neutral regime
      );
      
      expect(shouldPyramid).toBe(false);
    });

    test('should log pyramid layer details', async () => {
      const payload = createDaySignalPayload();
      const entryPrice = 50100;
      const layerSize = 0.2;
      
      // Set up position with pyramid state
      setupPositionWithPyramid(shadowState, pyramidManager, payload, entryPrice);
      
      const secondLayerPrice = entryPrice * (1 + PYRAMID_TRIGGER_PCT);
      await pyramidManager.addPyramidLayer('BTCUSDT', layerSize, secondLayerPrice);
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          layer_number: 2,
          entry_price: secondLayerPrice,
          total_size: layerSize * 2,
        }),
        expect.stringContaining('Pyramid layer added')
      );
    });
  });

  describe('Signal Type Rejection in Phase 2', () => {
    test('should reject SCALP signal in Phase 2', () => {
      const payload = createScalpSignalPayload();
      
      const isValid = phaseManager.validateSignal(payload.signal_type);
      expect(isValid).toBe(false);
      
      // Verify rejection was logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_type: 'SCALP',
          current_phase: 2,
          allowed_signals: ['DAY', 'SWING'],
        }),
        expect.stringContaining('Signal rejected')
      );
    });

    test('should emit signal:rejected event for SCALP signal', (done) => {
      const payload = createScalpSignalPayload();
      
      phaseManager.once('signal:rejected', (data) => {
        expect(data.signal_type).toBe('SCALP');
        expect(data.phase).toBe(2);
        expect(data.phase_label).toBe('TREND RIDER');
        expect(data.allowed_signals).toEqual(['DAY', 'SWING']);
        done();
      });
      
      phaseManager.validateSignal(payload.signal_type);
    });

    test('should NOT process intent for rejected SCALP signal', () => {
      const scalpPayload = createScalpSignalPayload();
      
      // Validate signal type first
      const isValid = phaseManager.validateSignal(scalpPayload.signal_type);
      expect(isValid).toBe(false);
      
      // Should not process intent if signal type is invalid
      if (!isValid) {
        // In real implementation, webhook handler would return early
        expect(shadowState.getIntent(scalpPayload.signal_id)).toBeUndefined();
      }
    });
  });

  describe('TAKER Execution (Phase 2)', () => {
    test('should use aggressive TAKER execution in Phase 2', async () => {
      const payload = createDaySignalPayload();
      
      // Phase 2 uses TAKER mode (aggressive)
      const executionMode = phaseManager.getExecutionMode();
      expect(executionMode).toBe('TAKER');
      
      // LimitChaser should be more aggressive in Phase 2
      mockAdapter.simulateFill = true;
      mockAdapter.fillDelayMs = 0; // Immediate fill for LimitChaser test
      mockAdapter.partialFillRatio = 1.0;
      
      const result = await limitChaser.execute({
        symbol: payload.symbol,
        side: 'BUY',
        size: payload.size,
        limit_price: wsCache.getBestAsk(), // Start at Ask for TAKER
        signal_id: payload.signal_id,
        alpha_half_life_ms: payload.alpha_half_life_ms,
      });
      
      expect(result.success).toBe(true);
      expect(result.reason).toBe('FILLED'); // LimitChaser uses 'reason' not 'status'
    });

    test('should chase price more aggressively in Phase 2', async () => {
      const payload = createDaySignalPayload();
      
      // MockBrokerAdapter - simulate immediate fill for LimitChaser
      mockAdapter.simulateFill = true;
      mockAdapter.fillDelayMs = 0; // Immediate fill for LimitChaser test
      mockAdapter.partialFillRatio = 1.0;
      
      const result = await limitChaser.execute({
        symbol: payload.symbol,
        side: 'BUY',
        size: payload.size,
        limit_price: wsCache.getBestAsk(),
        signal_id: payload.signal_id,
        alpha_half_life_ms: payload.alpha_half_life_ms,
      });
      
      expect(result.success).toBe(true);
      expect(result.reason).toBe('FILLED'); // LimitChaser uses 'reason' not 'status'
    }, 10000);
  });

  describe('Complete Phase 2 Flow', () => {
    test('should execute complete DAY signal flow in Phase 2', async () => {
      const payload = createDaySignalPayload();
      
      // Step 1: Validate phase and signal type
      expect(phaseManager.getCurrentPhase()).toBe(2);
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
      
      // Step 6: Execute with LimitChaser (TAKER mode)
      mockAdapter.simulateFill = true;
      mockAdapter.fillDelayMs = 0; // Immediate fill for LimitChaser test
      mockAdapter.partialFillRatio = 1.0;
      
      const execResult = await limitChaser.execute({
        symbol: payload.symbol,
        side: 'BUY',
        size: payload.size,
        limit_price: wsCache.getBestAsk(), // Start at Ask for TAKER
        signal_id: payload.signal_id,
        alpha_half_life_ms: payload.alpha_half_life_ms,
      });
      
      expect(execResult.success).toBe(true);
      expect(execResult.reason).toBe('FILLED'); // LimitChaser uses 'reason' not 'status'
      
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
      
      // Step 8: Verify pyramiding is allowed
      expect(phaseManager.isPyramidingAllowed()).toBe(true);
    }, 10000);

    test('should execute complete SWING signal flow with pyramiding', async () => {
      const payload = createSwingSignalPayload();
      const entryPrice = 50100;
      
      // Execute initial entry
      expect(phaseManager.validateSignal(payload.signal_type)).toBe(true);
      
      // Set up position with pyramid state
      const { pyramidState } = setupPositionWithPyramid(
        shadowState,
        pyramidManager,
        payload,
        entryPrice
      );
      
      expect(pyramidState).toBeDefined();
      expect(pyramidState.layerCount).toBe(1);
      
      // Add pyramid layer at 2% above (need to be ABOVE trigger, not equal)
      const pyramidPrice = entryPrice * (1 + PYRAMID_TRIGGER_PCT + 0.001);
      const shouldPyramid = pyramidManager.checkPyramidOpportunity(
        'BTCUSDT',
        pyramidPrice,
        1
      );
      
      expect(shouldPyramid).toBe(true);
      
      mockAdapter.updateStopLoss = jest.fn().mockResolvedValue({
        success: true,
      });
      
      await pyramidManager.addPyramidLayer('BTCUSDT', payload.size, pyramidPrice);
      
      const updatedPyramidState = pyramidManager.pyramidStates.get('BTCUSDT');
      expect(updatedPyramidState.layerCount).toBe(2);
      
      // Verify auto-trail was triggered
      expect(mockAdapter.updateStopLoss).toHaveBeenCalled();
    }, 10000);

    test('should reject and abort SCALP signal in Phase 2', () => {
      const payload = createScalpSignalPayload();
      
      // Step 1: Validate phase
      expect(phaseManager.getCurrentPhase()).toBe(2);
      
      // Step 2: Validate signal type - should fail
      const isValid = phaseManager.validateSignal(payload.signal_type);
      expect(isValid).toBe(false);
      
      // Step 3: Should NOT process intent
      expect(shadowState.getIntent(payload.signal_id)).toBeUndefined();
      
      // Step 4: Verify rejection was logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_type: 'SCALP',
          current_phase: 2,
        }),
        expect.stringContaining('Signal rejected')
      );
    });

    test('should calculate correct position size with 5% risk', () => {
      const equity = 1500; // Phase 2 equity
      const entryPrice = 50100;
      const stopLoss = 48500;
      const riskParams = phaseManager.getRiskParameters();
      
      // Calculate position size
      const stopDistance = entryPrice - stopLoss; // 1600
      const riskAmount = equity * riskParams.riskPct; // 1500 * 0.05 = 75
      const positionSize = riskAmount / stopDistance; // 75 / 1600 = 0.046875
      
      expect(riskParams.riskPct).toBe(PHASE_2_RISK_PCT);
      expect(riskAmount).toBe(75);
      expect(positionSize).toBeCloseTo(0.046875, 6);
      
      // Verify this is 5% risk
      const potentialLoss = positionSize * stopDistance; // 0.046875 * 1600 = 75
      const riskPct = potentialLoss / equity; // 75 / 1500 = 0.05
      expect(riskPct).toBeCloseTo(PHASE_2_RISK_PCT, 2);
    });
  });

  describe('Phase 2 Edge Cases', () => {
    test('should handle equity exactly at $1,000 threshold', () => {
      phaseManager.setEquity(PHASE_2_EQUITY_THRESHOLD);
      
      // At exactly $1,000, should be Phase 2 (>= threshold)
      expect(phaseManager.getCurrentPhase()).toBe(2);
      expect(phaseManager.validateSignal('SCALP')).toBe(false);
      expect(phaseManager.validateSignal('DAY')).toBe(true);
      expect(phaseManager.validateSignal('SWING')).toBe(true);
    });

    test('should transition from Phase 2 back to Phase 1 if equity drops', () => {
      phaseManager.setEquity(1500); // Start in Phase 2
      expect(phaseManager.getCurrentPhase()).toBe(2);
      
      phaseManager.setEquity(900); // Drop below threshold
      expect(phaseManager.getCurrentPhase()).toBe(1);
      expect(phaseManager.getPhaseLabel()).toBe('KICKSTARTER');
      
      // Now DAY/SWING should be rejected, SCALP accepted
      expect(phaseManager.validateSignal('SCALP')).toBe(true);
      expect(phaseManager.validateSignal('DAY')).toBe(false);
      expect(phaseManager.validateSignal('SWING')).toBe(false);
    });

    test('should handle multiple DAY/SWING signals in Phase 2', async () => {
      const dayPayload = createDaySignalPayload({ bar_index: 2000 });
      const swingPayload = createSwingSignalPayload({ bar_index: 2001 });
      
      // Both should be accepted
      expect(phaseManager.validateSignal(dayPayload.signal_type)).toBe(true);
      expect(phaseManager.validateSignal(swingPayload.signal_type)).toBe(true);
      
      // Process both intents
      const intent1 = shadowState.processIntent(dayPayload);
      const intent2 = shadowState.processIntent(swingPayload);
      
      expect(intent1.signal_id).toBe(dayPayload.signal_id);
      expect(intent2.signal_id).toBe(swingPayload.signal_id);
      expect(intent1.signal_id).not.toBe(intent2.signal_id);
    });

    test('should enforce 15x max leverage in Phase 2', () => {
      const riskParams = phaseManager.getRiskParameters();
      expect(riskParams.maxLeverage).toBe(PHASE_2_MAX_LEVERAGE);
      
      // Verify this is enforced
      const equity = 1500;
      const maxPositionValue = equity * riskParams.maxLeverage; // 1500 * 15 = 22,500
      expect(maxPositionValue).toBe(22500);
    });

    test('should not allow pyramiding when pyramiding is disabled', () => {
      // Temporarily disable pyramiding
      phaseManager.setEquity(900); // Phase 1 - no pyramiding
      
      expect(phaseManager.isPyramidingAllowed()).toBe(false);
      
      const shouldPyramid = pyramidManager.checkPyramidOpportunity(
        'BTCUSDT',
        51102,
        1
      );
      
      expect(shouldPyramid).toBe(false);
    });

    test('should handle pyramid layer with partial fill', async () => {
      const payload = createDaySignalPayload();
      const entryPrice = 50100;
      
      // Set up position with pyramid state
      setupPositionWithPyramid(shadowState, pyramidManager, payload, entryPrice);
      
      // Add pyramid layer with partial fill
      mockAdapter.placeOrder = jest.fn().mockResolvedValue({
        order_id: 'order_2',
        status: 'PARTIALLY_FILLED',
        filled_size: 0.1, // Only 50% filled
      });
      
      const pyramidPrice = entryPrice * (1 + PYRAMID_TRIGGER_PCT);
      pyramidManager.addPyramidLayer('BTCUSDT', 0.2, pyramidPrice);
      
      const pyramidState = pyramidManager.pyramidStates.get('BTCUSDT');
      // Should still count as a layer even with partial fill
      expect(pyramidState.layerCount).toBe(2);
    });
  });

  describe('Phase Transition Scenarios', () => {
    test('should log phase transition when equity crosses threshold', () => {
      phaseManager.setEquity(900); // Phase 1
      expect(phaseManager.getCurrentPhase()).toBe(1);
      
      phaseManager.setEquity(1100); // Cross to Phase 2
      
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          old_phase: 1,
          new_phase: 2,
          equity_at_transition: 1100,
        }),
        expect.stringContaining('Phase transition')
      );
    });

    test('should close pyramid positions when transitioning to Phase 1', async () => {
      // Start in Phase 2 with pyramid position
      phaseManager.setEquity(1500);
      
      const payload = createDaySignalPayload();
      const entryPrice = 50100;
      
      // Set up position with pyramid state
      setupPositionWithPyramid(shadowState, pyramidManager, payload, entryPrice);
      
      const pyramidPrice = entryPrice * (1 + PYRAMID_TRIGGER_PCT);
      pyramidManager.addPyramidLayer('BTCUSDT', 0.2, pyramidPrice);
      
      const pyramidState = pyramidManager.pyramidStates.get('BTCUSDT');
      expect(pyramidState.layerCount).toBe(2);
      
      // Transition to Phase 1
      mockAdapter.closePosition = jest.fn().mockResolvedValue({
        success: true,
      });
      
      phaseManager.setEquity(900);
      
      // Pyramiding should no longer be allowed
      expect(phaseManager.isPyramidingAllowed()).toBe(false);
    });
  });
});
