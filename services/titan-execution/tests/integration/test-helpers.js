/**
 * Test Helpers for Sprint 4 E2E Integration Tests
 * 
 * Provides factory functions, constants, and utilities for creating
 * consistent test fixtures across integration tests.
 * 
 * @module test-helpers
 */

import { jest } from '@jest/globals';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {number} Stale signal threshold in milliseconds */
export const STALE_SIGNAL_THRESHOLD_MS = 5000;

/** @constant {number} Phase 1 max equity threshold (matches PhaseManager.js) */
export const PHASE_1_MAX_EQUITY = 1000;

/** @constant {number} Phase 2 max equity threshold */
export const PHASE_2_MAX_EQUITY = 5000;

/** @constant {number} Default test equity */
export const DEFAULT_TEST_EQUITY = 1000;

/** @constant {number} Emergency flatten timeout in milliseconds */
export const EMERGENCY_FLATTEN_TIMEOUT_MS = 5000;

/** @constant {Object} Phase source mapping */
export const PHASE_SOURCE_MAP = {
  scavenger: 1,
  hunter: 2,
  sentinel: 3,
};

//─────────────────────────────────────────────────────────────────────────────
// MOCK LOGGER FACTORY
//─────────────────────────────────────────────────────────────────────────────

/**
 * Create a mock logger with Jest spies
 * @returns {Object} Mock logger with info, warn, error, debug methods
 */
export function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

//─────────────────────────────────────────────────────────────────────────────
// SIGNAL FACTORIES
//─────────────────────────────────────────────────────────────────────────────

/**
 * Create a mock PREPARE signal with sensible defaults
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock PREPARE signal
 */
export function createMockPrepareSignal(overrides = {}) {
  const barIndex = overrides.bar_index || Math.floor(Math.random() * 100000);
  const timestamp = overrides.timestamp || Date.now();
  
  return {
    signal_id: `sig-${barIndex}-${timestamp}`,
    type: 'PREPARE',
    source: 'scavenger',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entry_zone: { min: 49900, max: 50100 },
    stop_loss: 49000,
    take_profits: [51000, 52000, 53000],
    trap_metadata: {
      trapType: 'LIQUIDATION',
      confidence: 95,
    },
    bar_index: barIndex,
    timestamp,
    ...overrides,
  };
}

/**
 * Create a mock CONFIRM signal
 * @param {string} signalId - Signal ID to confirm
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock CONFIRM signal
 */
export function createMockConfirmSignal(signalId, overrides = {}) {
  return {
    type: 'CONFIRM',
    signal_id: signalId,
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Create a mock ABORT signal
 * @param {string} signalId - Signal ID to abort
 * @param {string} reason - Abort reason
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock ABORT signal
 */
export function createMockAbortSignal(signalId, reason = 'TRAP_INVALIDATED', overrides = {}) {
  return {
    type: 'ABORT',
    signal_id: signalId,
    reason,
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Create a stale signal (older than threshold)
 * @param {Object} overrides - Properties to override
 * @returns {Object} Stale mock signal
 */
export function createStaleSignal(overrides = {}) {
  return createMockPrepareSignal({
    timestamp: Date.now() - STALE_SIGNAL_THRESHOLD_MS - 1000,
    ...overrides,
  });
}

/**
 * Create a Scavenger-specific signal (Phase 1)
 * @param {Object} overrides - Properties to override
 * @returns {Object} Scavenger signal
 */
export function createScavengerSignal(overrides = {}) {
  return createMockPrepareSignal({
    source: 'scavenger',
    signal_type: 'SCALP',
    ...overrides,
  });
}

/**
 * Create a Hunter-specific signal (Phase 2)
 * @param {Object} overrides - Properties to override
 * @returns {Object} Hunter signal
 */
export function createHunterSignal(overrides = {}) {
  return createMockPrepareSignal({
    source: 'hunter',
    signal_type: 'DAY',
    ...overrides,
  });
}

//─────────────────────────────────────────────────────────────────────────────
// POSITION FACTORIES
//─────────────────────────────────────────────────────────────────────────────

/**
 * Create a mock position
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock position
 */
export function createMockPosition(overrides = {}) {
  return {
    id: `pos-${Date.now()}`,
    symbol: 'BTCUSDT',
    side: 'LONG',
    size: 0.01,
    entry_price: 50000,
    stop_loss: 49000,
    take_profits: [51000, 52000],
    signal_id: `sig-${Date.now()}`,
    opened_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create multiple mock positions
 * @param {number} count - Number of positions to create
 * @param {Object} baseOverrides - Base properties for all positions
 * @returns {Object[]} Array of mock positions
 */
export function createMockPositions(count, baseOverrides = {}) {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
  const sides = ['LONG', 'SHORT'];
  
  return Array.from({ length: count }, (_, i) => createMockPosition({
    id: `pos-${i + 1}`,
    symbol: symbols[i % symbols.length],
    side: sides[i % sides.length],
    ...baseOverrides,
  }));
}

//─────────────────────────────────────────────────────────────────────────────
// SYSTEM STATE FACTORIES
//─────────────────────────────────────────────────────────────────────────────

/**
 * Create mock system state
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock system state
 */
export function createMockSystemState(overrides = {}) {
  return {
    equity: DEFAULT_TEST_EQUITY,
    phase: 1,
    masterArm: true,
    circuitBreaker: false,
    highWatermark: DEFAULT_TEST_EQUITY,
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create Phase 1 system state ($200-$5K)
 * @param {Object} overrides - Properties to override
 * @returns {Object} Phase 1 system state
 */
export function createPhase1State(overrides = {}) {
  return createMockSystemState({
    equity: 2500,
    phase: 1,
    ...overrides,
  });
}

/**
 * Create Phase 2 system state ($5K-$50K)
 * @param {Object} overrides - Properties to override
 * @returns {Object} Phase 2 system state
 */
export function createPhase2State(overrides = {}) {
  return createMockSystemState({
    equity: 15000,
    phase: 2,
    ...overrides,
  });
}

//─────────────────────────────────────────────────────────────────────────────
// MOCK COMPONENT FACTORIES
//─────────────────────────────────────────────────────────────────────────────

/**
 * Create a mock DatabaseManager
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock DatabaseManager
 */
export function createMockDatabaseManager(overrides = {}) {
  const defaultState = createMockSystemState();
  
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    initDatabase: jest.fn().mockResolvedValue(undefined),
    getSystemState: jest.fn().mockReturnValue(defaultState),
    saveSystemState: jest.fn().mockResolvedValue(undefined),
    getPositions: jest.fn().mockReturnValue([]),
    getOpenPositions: jest.fn().mockResolvedValue([]),
    savePosition: jest.fn().mockResolvedValue(undefined),
    insertPosition: jest.fn().mockResolvedValue(undefined),
    closePosition: jest.fn().mockResolvedValue(undefined),
    saveTrade: jest.fn().mockResolvedValue(undefined),
    insertTrade: jest.fn().mockResolvedValue(undefined),
    getRecentTrades: jest.fn().mockResolvedValue([]),
    saveSystemEvent: jest.fn().mockResolvedValue(undefined),
    insertSystemEvent: jest.fn().mockResolvedValue(undefined),
    getSystemEvents: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Create a mock ShadowState
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock ShadowState
 */
export function createMockShadowState(overrides = {}) {
  const positions = new Map();
  const intents = new Map();
  
  return {
    initialize: jest.fn(),
    processIntent: jest.fn().mockImplementation((payload) => {
      const intent = {
        signal_id: payload.signal_id,
        symbol: payload.symbol,
        direction: payload.direction,
        status: 'PENDING',
        received_at: new Date().toISOString(),
      };
      intents.set(payload.signal_id, intent);
      return { ...intent };
    }),
    validateIntent: jest.fn().mockImplementation((signalId) => {
      const intent = intents.get(signalId);
      if (intent) {
        intent.status = 'VALIDATED';
        return { ...intent };
      }
      return null;
    }),
    confirmExecution: jest.fn().mockImplementation((signalId, response) => {
      if (!response.filled) return null;
      const intent = intents.get(signalId);
      const symbol = intent?.symbol || 'BTCUSDT';
      const pos = {
        symbol,
        side: intent?.direction === 1 ? 'LONG' : 'SHORT',
        size: response.fill_size,
        entry_price: response.fill_price,
        signal_id: signalId,
        opened_at: new Date().toISOString(),
      };
      positions.set(symbol, pos);
      return { ...pos };
    }),
    rejectIntent: jest.fn().mockImplementation((signalId, reason) => {
      const intent = intents.get(signalId);
      if (intent) {
        intent.status = 'REJECTED';
        intent.rejection_reason = reason;
        return { ...intent };
      }
      return null;
    }),
    getPosition: jest.fn().mockImplementation((symbol) => {
      const pos = positions.get(symbol);
      return pos ? { ...pos } : undefined;
    }),
    hasPosition: jest.fn().mockImplementation((symbol) => positions.has(symbol)),
    closePosition: jest.fn().mockImplementation((symbol, exitPrice, reason) => {
      const pos = positions.get(symbol);
      if (!pos) return null;
      positions.delete(symbol);
      const pnl = pos.side === 'LONG' 
        ? (exitPrice - pos.entry_price) * pos.size
        : (pos.entry_price - exitPrice) * pos.size;
      return { ...pos, exit_price: exitPrice, pnl, close_reason: reason };
    }),
    closePartialPosition: jest.fn().mockImplementation((symbol, exitPrice, closeSize, reason) => {
      const pos = positions.get(symbol);
      if (!pos) return null;
      const pnl = pos.side === 'LONG'
        ? (exitPrice - pos.entry_price) * closeSize
        : (pos.entry_price - exitPrice) * closeSize;
      pos.size -= closeSize;
      return { symbol, size: closeSize, exit_price: exitPrice, pnl, close_reason: reason };
    }),
    getAllPositions: jest.fn().mockImplementation(() => new Map(positions)),
    isZombieSignal: jest.fn().mockImplementation((symbol) => !positions.has(symbol)),
    clear: jest.fn().mockImplementation(() => {
      positions.clear();
      intents.clear();
    }),
    ...overrides,
  };
}

/**
 * Create a mock BrokerGateway
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock BrokerGateway
 */
export function createMockBrokerGateway(overrides = {}) {
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    sendOrder: jest.fn().mockResolvedValue({
      success: true,
      order_id: `order-${Date.now()}`,
      fill_price: 50000,
      fill_size: 0.01,
    }),
    cancelOrder: jest.fn().mockResolvedValue({ success: true }),
    getPositions: jest.fn().mockResolvedValue([]),
    getAccount: jest.fn().mockResolvedValue({
      equity: DEFAULT_TEST_EQUITY,
      cash: DEFAULT_TEST_EQUITY,
      margin_used: 0,
    }),
    closeAllPositions: jest.fn().mockResolvedValue({ closed: 0, positions: [] }),
    destroy: jest.fn(),
    ...overrides,
  };
}

/**
 * Create a mock PhaseManager
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock PhaseManager
 */
export function createMockPhaseManager(overrides = {}) {
  let currentPhase = 1;
  let equity = DEFAULT_TEST_EQUITY;
  
  return {
    initialize: jest.fn(),
    getCurrentPhase: jest.fn().mockImplementation(() => currentPhase),
    setEquity: jest.fn().mockImplementation((newEquity) => {
      equity = newEquity;
      // Match PhaseManager.js: Phase 1 < $1000, Phase 2 >= $1000
      currentPhase = newEquity < PHASE_1_MAX_EQUITY ? 1 : 2;
    }),
    getLastKnownEquity: jest.fn().mockImplementation(() => equity),
    checkPhaseTransition: jest.fn().mockImplementation((newEquity) => {
      const oldPhase = currentPhase;
      const newPhase = newEquity < PHASE_1_MAX_EQUITY ? 1 : 2;
      if (oldPhase !== newPhase) {
        return { from: oldPhase, to: newPhase, reason: 'EQUITY_THRESHOLD' };
      }
      return null;
    }),
    validateSignal: jest.fn().mockImplementation((signalType) => {
      if (currentPhase === 1) return signalType === 'SCALP';
      if (currentPhase === 2) return ['DAY', 'SWING'].includes(signalType);
      return false;
    }),
    getRiskParameters: jest.fn().mockImplementation(() => {
      if (currentPhase === 1) {
        return { riskPct: 0.10, maxLeverage: 30, riskMult: 5.0 };
      }
      return { riskPct: 0.05, maxLeverage: 15, riskMult: 2.5 };
    }),
    getPhaseLabel: jest.fn().mockImplementation(() => {
      return currentPhase === 1 ? 'KICKSTARTER' : 'TREND RIDER';
    }),
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    destroy: jest.fn(),
    ...overrides,
  };
}

/**
 * Create a mock SignalRouter
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock SignalRouter
 */
export function createMockSignalRouter(overrides = {}) {
  return {
    route: jest.fn().mockResolvedValue({ accepted: true, result: {} }),
    registerHandler: jest.fn(),
    unregisterHandler: jest.fn(),
    hasHandler: jest.fn().mockReturnValue(true),
    isPhaseActive: jest.fn().mockReturnValue(true),
    on: jest.fn(),
    emit: jest.fn(),
    destroy: jest.fn(),
    ...overrides,
  };
}

/**
 * Create a mock WebSocket cache
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock WebSocket cache
 */
export function createMockWsCache(overrides = {}) {
  return {
    getOrderbook: jest.fn().mockReturnValue({
      bids: [{ price: 50000, quantity: 10 }],
      asks: [{ price: 50010, quantity: 10 }],
      timestamp: Date.now(),
    }),
    getBestBid: jest.fn().mockReturnValue(50000),
    getBestAsk: jest.fn().mockReturnValue(50010),
    getSpread: jest.fn().mockReturnValue(10),
    getCacheAge: jest.fn().mockReturnValue(50),
    validateCacheForSymbol: jest.fn().mockReturnValue({ valid: true }),
    ...overrides,
  };
}

/**
 * Create a mock ReplayGuard
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock ReplayGuard
 */
export function createMockReplayGuard(overrides = {}) {
  return {
    validateTimestamp: jest.fn().mockReturnValue({ valid: true }),
    validateSignalId: jest.fn().mockReturnValue({ valid: true }),
    markProcessed: jest.fn(),
    ...overrides,
  };
}

/**
 * Create a mock SafetyGates
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock SafetyGates
 */
export function createMockSafetyGates(overrides = {}) {
  let masterArmEnabled = true;
  let circuitBreakerTripped = false;
  
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    checkDrawdown: jest.fn().mockImplementation((currentEquity) => {
      // Simulate 15% max drawdown check
      const drawdown = 1 - (currentEquity / DEFAULT_TEST_EQUITY);
      if (drawdown > 0.15) {
        circuitBreakerTripped = true;
        return true;
      }
      return false;
    }),
    isCircuitBreakerTripped: jest.fn().mockImplementation(() => circuitBreakerTripped),
    isMasterArmEnabled: jest.fn().mockImplementation(() => masterArmEnabled),
    emergencyFlatten: jest.fn().mockImplementation(async () => {
      masterArmEnabled = false;
      return { success: true, closedPositions: 0 };
    }),
    reset: jest.fn().mockImplementation(() => {
      masterArmEnabled = true;
      circuitBreakerTripped = false;
    }),
    ...overrides,
  };
}

//─────────────────────────────────────────────────────────────────────────────
// TEST CONTEXT FACTORY
//─────────────────────────────────────────────────────────────────────────────

/**
 * Create a complete test context with all mock components
 * @param {Object} overrides - Component overrides
 * @returns {Object} Test context with all mock components
 */
export function createTestContext(overrides = {}) {
  const logger = createMockLogger();
  const databaseManager = createMockDatabaseManager(overrides.databaseManager);
  const shadowState = createMockShadowState(overrides.shadowState);
  const brokerGateway = createMockBrokerGateway(overrides.brokerGateway);
  const phaseManager = createMockPhaseManager(overrides.phaseManager);
  const signalRouter = createMockSignalRouter(overrides.signalRouter);
  const wsCache = createMockWsCache(overrides.wsCache);
  const replayGuard = createMockReplayGuard(overrides.replayGuard);
  const safetyGates = createMockSafetyGates(overrides.safetyGates);
  
  return {
    logger,
    databaseManager,
    shadowState,
    brokerGateway,
    phaseManager,
    signalRouter,
    wsCache,
    replayGuard,
    safetyGates,
    
    // Utility method to reset all mocks
    resetAll() {
      jest.clearAllMocks();
      safetyGates.reset();
    },
    
    // Utility method to destroy all components
    destroyAll() {
      brokerGateway.destroy();
      phaseManager.destroy();
      signalRouter.destroy();
    },
  };
}

//─────────────────────────────────────────────────────────────────────────────
// ASSERTION HELPERS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Assert that a signal was accepted
 * @param {Object} result - Route result
 */
export function assertSignalAccepted(result) {
  expect(result).toBeDefined();
  expect(result.accepted).toBe(true);
  expect(result.reason).toBeUndefined();
}

/**
 * Assert that a signal was rejected with specific reason
 * @param {Object} result - Route result
 * @param {string} expectedReason - Expected rejection reason (partial match)
 */
export function assertSignalRejected(result, expectedReason) {
  expect(result).toBeDefined();
  expect(result.accepted).toBe(false);
  expect(result.reason).toBeDefined();
  if (expectedReason) {
    expect(result.reason).toContain(expectedReason);
  }
}

/**
 * Assert that an operation completed within time limit
 * @param {number} startTime - Start timestamp
 * @param {number} maxDurationMs - Maximum allowed duration in milliseconds
 */
export function assertCompletedWithinTime(startTime, maxDurationMs) {
  const elapsed = Date.now() - startTime;
  expect(elapsed).toBeLessThan(maxDurationMs);
}

//─────────────────────────────────────────────────────────────────────────────
// TIMING UTILITIES
//─────────────────────────────────────────────────────────────────────────────

/**
 * Measure execution time of an async function
 * @param {Function} fn - Async function to measure
 * @returns {Promise<{result: any, durationMs: number}>} Result and duration
 */
export async function measureExecutionTime(fn) {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1_000_000;
  
  return { result, durationMs };
}

/**
 * Measure latency over multiple iterations
 * @param {Function} fn - Async function to measure
 * @param {number} iterations - Number of iterations
 * @returns {Promise<{avg: number, max: number, min: number, p99: number}>} Latency stats
 */
export async function measureLatencyStats(fn, iterations = 100) {
  const latencies = [];
  
  for (let i = 0; i < iterations; i++) {
    const { durationMs } = await measureExecutionTime(fn);
    latencies.push(durationMs);
  }
  
  latencies.sort((a, b) => a - b);
  
  return {
    avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    max: latencies[latencies.length - 1],
    min: latencies[0],
    p99: latencies[Math.floor(iterations * 0.99)],
  };
}
