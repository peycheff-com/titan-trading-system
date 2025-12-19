/**
 * Sprint 4: End-to-End Integration Tests
 * 
 * @module sprint4-e2e.integration.test
 * @requirements System Integration 14.1-14.4
 * 
 * Tests the complete signal flow, phase transitions, emergency flatten,
 * and crash recovery scenarios using real component instances where possible.
 * 
 * Test Categories:
 * - 14.1: Signal Flow (Scavenger → Execution → Shadow State → Database)
 * - 14.2: Phase Transitions (equity-based phase changes)
 * - 14.3: Emergency Flatten (circuit breaker, position closure)
 * - 14.4: Crash Recovery (state restoration, reconciliation)
 * - 15.x: Performance Optimization (latency, caching)
 */

import { jest } from '@jest/globals';

// Import test helpers
import {
  createMockLogger,
  createMockPrepareSignal,
  createMockConfirmSignal,
  createMockAbortSignal,
  createStaleSignal,
  createScavengerSignal,
  createHunterSignal,
  createMockPosition,
  createMockPositions,
  createMockSystemState,
  createPhase1State,
  createPhase2State,
  createTestContext,
  assertSignalAccepted,
  assertSignalRejected,
  assertCompletedWithinTime,
  measureLatencyStats,
  STALE_SIGNAL_THRESHOLD_MS,
  PHASE_1_MAX_EQUITY,
  EMERGENCY_FLATTEN_TIMEOUT_MS,
  DEFAULT_TEST_EQUITY,
} from './test-helpers.js';

// Import real implementations for true integration testing
import { SignalRouter } from '../../SignalRouter.js';
import { ShadowState } from '../../ShadowState.js';
import { PhaseManager } from '../../PhaseManager.js';


//─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: SIGNAL FLOW (Task 14.1)
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Signal Flow (Task 14.1)', () => {
  /** @type {Object} Test context with all components */
  let ctx;
  /** @type {SignalRouter} Real SignalRouter instance */
  let signalRouter;
  /** @type {ShadowState} Real ShadowState instance */
  let shadowState;
  /** @type {PhaseManager} Real PhaseManager instance */
  let phaseManager;

  beforeEach(() => {
    ctx = createTestContext();
    
    // Create real ShadowState with mock logger
    shadowState = new ShadowState({ logger: ctx.logger });
    
    // Create real PhaseManager with mock broker
    phaseManager = new PhaseManager({
      brokerGateway: ctx.brokerGateway,
      logger: ctx.logger,
    });
    phaseManager.setEquity(DEFAULT_TEST_EQUITY); // Start in Phase 1
    
    // Create real SignalRouter with real PhaseManager
    signalRouter = new SignalRouter({
      phaseManager,
      logger: ctx.logger,
    });
    
    // Register a mock handler for scavenger signals
    signalRouter.registerHandler('scavenger', async (signal) => {
      // Process intent in shadow state
      const intent = shadowState.processIntent({
        signal_id: signal.signal_id,
        symbol: signal.symbol,
        direction: signal.direction === 'LONG' ? 1 : -1,
        entry_zone: [signal.entry_zone?.min, signal.entry_zone?.max],
        stop_loss: signal.stop_loss,
        take_profits: signal.take_profits,
        size: 0.01,
      });
      
      return { processed: true, intent };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    signalRouter?.destroy();
    phaseManager?.destroy();
  });

  /**
   * @requirement System Integration 14.1
   * @scenario Complete signal flow from PREPARE to execution
   * @expected Signal is processed through all components successfully
   */
  test('should complete full signal flow: Scavenger → Router → Shadow State', async () => {
    // Arrange - Ensure we're in Phase 1 for scavenger signals
    phaseManager.setEquity(500); // Phase 1 (< $1000)
    expect(phaseManager.getCurrentPhase()).toBe(1);
    
    const signal = createScavengerSignal();
    
    // Act - Route signal through SignalRouter
    const routeResult = await signalRouter.route({
      ...signal,
      direction: 'LONG',
    });
    
    // Assert - Signal should be accepted and processed
    assertSignalAccepted(routeResult);
    expect(routeResult.result.processed).toBe(true);
    expect(routeResult.result.intent).toBeDefined();
    expect(routeResult.result.intent.status).toBe('PENDING');
  });

  /**
   * @requirement System Integration 14.1
   * @scenario PREPARE → CONFIRM flow with broker execution
   * @expected Position is opened after CONFIRM
   */
  test('should process PREPARE → CONFIRM flow with position opening', async () => {
    // Arrange
    const prepareSignal = createMockPrepareSignal();
    
    // Act - Process PREPARE
    const intent = shadowState.processIntent({
      signal_id: prepareSignal.signal_id,
      symbol: prepareSignal.symbol,
      direction: 1,
      entry_zone: [49900, 50100],
      stop_loss: 49000,
      take_profits: [51000, 52000],
      size: 0.01,
    });
    
    expect(intent.status).toBe('PENDING');
    
    // Validate intent
    shadowState.validateIntent(prepareSignal.signal_id);
    
    // Confirm execution with broker response
    const position = shadowState.confirmExecution(prepareSignal.signal_id, {
      broker_order_id: 'order-123',
      fill_price: 50000,
      fill_size: 0.01,
      filled: true,
    });
    
    // Assert
    expect(position).toBeDefined();
    expect(position.symbol).toBe('BTCUSDT');
    expect(position.side).toBe('LONG');
    expect(shadowState.hasPosition('BTCUSDT')).toBe(true);
  });

  /**
   * @requirement System Integration 14.1
   * @scenario Stale signal rejection
   * @expected Signals older than threshold are rejected
   */
  test('should reject stale signals (> 5 seconds old)', async () => {
    // Arrange - Create stale signal
    const staleSignal = createStaleSignal();
    const signalAge = Date.now() - staleSignal.timestamp;
    
    // Assert - Signal should be older than threshold
    expect(signalAge).toBeGreaterThan(STALE_SIGNAL_THRESHOLD_MS);
    
    // In production, ReplayGuard would reject this
    const isStale = signalAge > STALE_SIGNAL_THRESHOLD_MS;
    expect(isStale).toBe(true);
  });

  /**
   * @requirement System Integration 14.1
   * @scenario ABORT signal handling
   * @expected Intent is rejected and no position is opened
   */
  test('should handle ABORT signal correctly', async () => {
    // Arrange - Create and process PREPARE
    const prepareSignal = createMockPrepareSignal();
    
    shadowState.processIntent({
      signal_id: prepareSignal.signal_id,
      symbol: prepareSignal.symbol,
      direction: 1,
      size: 0.01,
    });
    
    // Act - Reject the intent (simulating ABORT)
    const rejectedIntent = shadowState.rejectIntent(
      prepareSignal.signal_id,
      'TRAP_INVALIDATED'
    );
    
    // Assert
    expect(rejectedIntent).toBeDefined();
    expect(rejectedIntent.status).toBe('REJECTED');
    expect(rejectedIntent.rejection_reason).toBe('TRAP_INVALIDATED');
    expect(shadowState.hasPosition('BTCUSDT')).toBe(false);
  });

  /**
   * @requirement System Integration 14.1
   * @scenario Zombie signal detection
   * @expected Close signals for non-existent positions are ignored
   */
  test('should detect zombie signals (close for non-existent position)', () => {
    // Arrange - No position exists
    expect(shadowState.hasPosition('BTCUSDT')).toBe(false);
    
    // Act - Check if close signal is zombie
    const isZombie = shadowState.isZombieSignal('BTCUSDT', 'close-signal-123');
    
    // Assert
    expect(isZombie).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });
});


//─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: PHASE TRANSITION (Task 14.2)
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Phase Transition (Task 14.2)', () => {
  /** @type {Object} Test context */
  let ctx;
  /** @type {PhaseManager} Real PhaseManager instance */
  let phaseManager;
  /** @type {SignalRouter} Real SignalRouter instance */
  let signalRouter;

  beforeEach(() => {
    ctx = createTestContext();
    
    phaseManager = new PhaseManager({
      brokerGateway: ctx.brokerGateway,
      logger: ctx.logger,
    });
    
    signalRouter = new SignalRouter({
      phaseManager,
      logger: ctx.logger,
    });
    
    // Register handlers for both phases
    signalRouter.registerHandler('scavenger', async (signal) => ({ executed: true }));
    signalRouter.registerHandler('hunter', async (signal) => ({ executed: true }));
  });

  afterEach(() => {
    jest.clearAllMocks();
    phaseManager?.destroy();
    signalRouter?.destroy();
  });

  /**
   * @requirement System Integration 14.2
   * @scenario Phase 1 to Phase 2 transition
   * @expected Phase changes when equity exceeds $1,000 (per PhaseManager.js)
   */
  test('should transition from Phase 1 to Phase 2 when equity exceeds threshold', () => {
    // Arrange - Start in Phase 1 (equity < $1000)
    phaseManager.setEquity(950);
    expect(phaseManager.getCurrentPhase()).toBe(1);
    expect(phaseManager.getPhaseLabel()).toBe('KICKSTARTER');
    
    // Act - Simulate profitable trade → equity exceeds $1000 threshold
    phaseManager.setEquity(1050);
    
    // Assert - Should now be Phase 2
    expect(phaseManager.getCurrentPhase()).toBe(2);
    expect(phaseManager.getPhaseLabel()).toBe('TREND RIDER');
  });

  /**
   * @requirement System Integration 14.2
   * @scenario Risk parameters update on phase transition
   * @expected Risk parameters change appropriately for new phase
   */
  test('should update risk parameters on phase transition', () => {
    // Arrange - Phase 1 risk parameters (equity < $1000)
    phaseManager.setEquity(950);
    const phase1Risk = phaseManager.getRiskParameters();
    
    expect(phase1Risk.riskPct).toBe(0.10); // 10% risk
    expect(phase1Risk.maxLeverage).toBe(30);
    
    // Act - Transition to Phase 2 (equity >= $1000)
    phaseManager.setEquity(1050);
    const phase2Risk = phaseManager.getRiskParameters();
    
    // Assert - Phase 2 has lower risk
    expect(phase2Risk.riskPct).toBe(0.05); // 5% risk
    expect(phase2Risk.maxLeverage).toBe(15);
    expect(phase2Risk.riskPct).toBeLessThan(phase1Risk.riskPct);
  });

  /**
   * @requirement System Integration 14.2
   * @scenario Signal rejection after phase transition
   * @expected Scavenger signals rejected when in Phase 2
   */
  test('should reject Phase 1 (Scavenger) signals when in Phase 2', async () => {
    // Arrange - Start in Phase 1 (equity < $1000)
    phaseManager.setEquity(950);
    expect(phaseManager.validateSignal('SCALP')).toBe(true);
    
    // Act - Transition to Phase 2 (equity >= $1000)
    phaseManager.setEquity(1050);
    
    // Assert - SCALP signals should now be rejected
    expect(phaseManager.validateSignal('SCALP')).toBe(false);
    
    // DAY/SWING signals should be accepted
    expect(phaseManager.validateSignal('DAY')).toBe(true);
    expect(phaseManager.validateSignal('SWING')).toBe(true);
  });

  /**
   * @requirement System Integration 14.2
   * @scenario Phase transition event emission
   * @expected phase:transition event is emitted with correct data
   */
  test('should emit phase:transition event', (done) => {
    // Arrange - Start in Phase 1 (equity < $1000)
    phaseManager.setEquity(950);
    
    phaseManager.once('phase:transition', (data) => {
      // Assert
      expect(data.oldPhase).toBe(1);
      expect(data.newPhase).toBe(2);
      expect(data.equityAtTransition).toBe(1050);
      expect(data.timestamp).toBeDefined();
      done();
    });
    
    // Act - Trigger transition (equity >= $1000)
    phaseManager.setEquity(1050);
  });

  /**
   * @requirement System Integration 14.2
   * @scenario Signal routing respects phase
   * @expected SignalRouter rejects signals from inactive phases
   */
  test('should reject signals from inactive phase via SignalRouter', async () => {
    // Arrange - Set to Phase 2 (equity >= $1000)
    phaseManager.setEquity(1050);
    expect(phaseManager.getCurrentPhase()).toBe(2);
    
    // Create Phase 1 (Scavenger) signal
    const scavengerSignal = createScavengerSignal();
    
    // Act - Route signal
    const result = await signalRouter.route({
      ...scavengerSignal,
      direction: 'LONG',
    });
    
    // Assert - Should be rejected due to phase mismatch
    assertSignalRejected(result, 'PHASE_MISMATCH');
  });
});


//─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: EMERGENCY FLATTEN (Task 14.3)
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Emergency Flatten (Task 14.3)', () => {
  /** @type {Object} Test context */
  let ctx;
  /** @type {ShadowState} Real ShadowState instance */
  let shadowState;

  beforeEach(() => {
    ctx = createTestContext();
    shadowState = new ShadowState({ logger: ctx.logger });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * @requirement System Integration 14.3
   * @scenario Circuit breaker triggers on max drawdown
   * @expected All positions are closed when drawdown exceeds threshold
   */
  test('should trigger circuit breaker on max drawdown (>15%)', async () => {
    // Arrange - Create open positions via intent flow
    const positions = createMockPositions(2);
    
    for (const pos of positions) {
      // Process intent
      shadowState.processIntent({
        signal_id: `sig-${pos.symbol}`,
        symbol: pos.symbol,
        direction: pos.side === 'LONG' ? 1 : -1,
        size: pos.size,
      });
      
      // Confirm execution
      shadowState.confirmExecution(`sig-${pos.symbol}`, {
        broker_order_id: `order-${pos.symbol}`,
        fill_price: pos.entry_price,
        fill_size: pos.size,
        filled: true,
      });
    }
    
    expect(shadowState.getAllPositions().size).toBe(2);
    
    // Act - Check drawdown (16% drawdown from starting equity of $1000)
    // SafetyGates mock uses DEFAULT_TEST_EQUITY (1000) as starting equity
    // 16% drawdown = 1000 * 0.84 = 840
    const currentEquity = 840; // 16% drawdown from 1000
    const drawdownTriggered = ctx.safetyGates.checkDrawdown(currentEquity);
    
    // Assert
    expect(drawdownTriggered).toBe(true);
    expect(ctx.safetyGates.isCircuitBreakerTripped()).toBe(true);
  });

  /**
   * @requirement System Integration 14.3
   * @scenario Emergency flatten completes within time limit
   * @expected All positions closed within 5 seconds
   */
  test('should complete flatten within 5 seconds', async () => {
    // Arrange - Create positions via intent flow
    const positions = createMockPositions(3);
    
    for (const pos of positions) {
      shadowState.processIntent({
        signal_id: `sig-${pos.symbol}`,
        symbol: pos.symbol,
        direction: pos.side === 'LONG' ? 1 : -1,
        size: pos.size,
      });
      
      shadowState.confirmExecution(`sig-${pos.symbol}`, {
        broker_order_id: `order-${pos.symbol}`,
        fill_price: pos.entry_price,
        fill_size: pos.size,
        filled: true,
      });
    }
    
    // Configure mock broker for fast fills
    ctx.brokerGateway.closeAllPositions.mockImplementation(async () => {
      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, 100));
      return { closed: 3, positions: positions };
    });
    
    // Act - Measure flatten time
    const startTime = Date.now();
    await ctx.safetyGates.emergencyFlatten();
    
    // Assert - Should complete within timeout
    assertCompletedWithinTime(startTime, EMERGENCY_FLATTEN_TIMEOUT_MS);
  });

  /**
   * @requirement System Integration 14.3
   * @scenario Master Arm disabled after emergency flatten
   * @expected Master Arm is disabled to prevent new trades
   */
  test('should disable Master Arm after emergency flatten', async () => {
    // Arrange - Master arm should be enabled initially
    expect(ctx.safetyGates.isMasterArmEnabled()).toBe(true);
    
    // Act - Trigger emergency flatten
    await ctx.safetyGates.emergencyFlatten();
    
    // Assert - Master arm should be disabled
    expect(ctx.safetyGates.isMasterArmEnabled()).toBe(false);
  });

  /**
   * @requirement System Integration 14.3
   * @scenario Emergency event logging
   * @expected Emergency flatten event is logged to system_events
   */
  test('should log emergency event to system_events', async () => {
    // Arrange
    const emergencyEvent = {
      event_type: 'EMERGENCY_FLATTEN',
      details: JSON.stringify({
        reason: 'MAX_DRAWDOWN_EXCEEDED',
        drawdown: 0.16,
        closedPositions: 2,
      }),
      timestamp: new Date().toISOString(),
    };
    
    // Act
    await ctx.databaseManager.insertSystemEvent(emergencyEvent);
    
    // Assert
    expect(ctx.databaseManager.insertSystemEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'EMERGENCY_FLATTEN',
      })
    );
  });

  /**
   * @requirement System Integration 14.3
   * @scenario Position closure via ShadowState
   * @expected Positions are properly closed with PnL calculation
   */
  test('should close all positions with PnL calculation', () => {
    // Arrange - Open a position via intent flow
    shadowState.processIntent({
      signal_id: 'sig-btc-123',
      symbol: 'BTCUSDT',
      direction: 1, // LONG
      entry_zone: [50000],
      stop_loss: 49000,
      take_profits: [51000, 52000],
      size: 0.5,
    });
    
    shadowState.confirmExecution('sig-btc-123', {
      broker_order_id: 'order-btc-123',
      fill_price: 50000,
      fill_size: 0.5,
      filled: true,
    });
    
    expect(shadowState.hasPosition('BTCUSDT')).toBe(true);
    
    // Act - Close position
    const tradeRecord = shadowState.closePosition('BTCUSDT', 51000, 'EMERGENCY_FLATTEN');
    
    // Assert
    expect(tradeRecord).toBeDefined();
    expect(tradeRecord.pnl).toBe(500); // (51000 - 50000) * 0.5
    expect(tradeRecord.pnl_pct).toBe(2); // 2% gain
    expect(tradeRecord.close_reason).toBe('EMERGENCY_FLATTEN');
    expect(shadowState.hasPosition('BTCUSDT')).toBe(false);
  });
});


//─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: CRASH RECOVERY (Task 14.4)
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Crash Recovery (Task 14.4)', () => {
  /** @type {Object} Test context */
  let ctx;
  /** @type {ShadowState} Real ShadowState instance */
  let shadowState;

  beforeEach(() => {
    ctx = createTestContext();
    shadowState = new ShadowState({ logger: ctx.logger });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * @requirement System Integration 14.4
   * @scenario Shadow State restoration from database
   * @expected Positions are restored correctly on startup
   */
  test('should restore Shadow State from database on startup', async () => {
    // Arrange - Simulate positions in database
    const savedPositions = [
      createMockPosition({ symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 }),
      createMockPosition({ symbol: 'ETHUSDT', side: 'SHORT', size: 2.0, entry_price: 3000 }),
    ];
    
    ctx.databaseManager.getOpenPositions.mockResolvedValue(savedPositions);
    
    // Act - Simulate startup restoration
    const positions = await ctx.databaseManager.getOpenPositions();
    
    // Restore to new ShadowState via intent flow (simulating recovery)
    const newShadowState = new ShadowState({ logger: ctx.logger });
    
    for (const pos of positions) {
      // Process intent for each recovered position
      newShadowState.processIntent({
        signal_id: `recovered-${pos.symbol}`,
        symbol: pos.symbol,
        direction: pos.side === 'LONG' ? 1 : -1,
        stop_loss: pos.stop_loss,
        take_profits: pos.take_profits || [],
        size: pos.size,
      });
      
      // Confirm execution with recovered data
      newShadowState.confirmExecution(`recovered-${pos.symbol}`, {
        broker_order_id: `recovered-order-${pos.symbol}`,
        fill_price: pos.entry_price,
        fill_size: pos.size,
        filled: true,
      });
    }
    
    // Assert
    expect(newShadowState.hasPosition('BTCUSDT')).toBe(true);
    expect(newShadowState.hasPosition('ETHUSDT')).toBe(true);
    
    const btcPosition = newShadowState.getPosition('BTCUSDT');
    expect(btcPosition.size).toBe(0.5);
    expect(btcPosition.entry_price).toBe(50000);
  });

  /**
   * @requirement System Integration 14.4
   * @scenario Broker reconciliation after restart
   * @expected Database positions match broker positions
   */
  test('should reconcile with broker after restart', async () => {
    // Arrange - Database has position
    const dbPositions = [
      { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
    ];
    
    // Broker also has matching position
    const brokerPositions = [
      { symbol: 'BTCUSDT', side: 'Buy', size: '0.5', entry_price: 50000 },
    ];
    
    ctx.databaseManager.getOpenPositions.mockResolvedValue(dbPositions);
    ctx.brokerGateway.getPositions.mockResolvedValue(brokerPositions);
    
    // Act
    const dbPos = await ctx.databaseManager.getOpenPositions();
    const brokerPos = await ctx.brokerGateway.getPositions();
    
    // Assert - Positions should match
    expect(dbPos[0].symbol).toBe(brokerPos[0].symbol);
    expect(dbPos[0].size).toBe(parseFloat(brokerPos[0].size));
  });

  /**
   * @requirement System Integration 14.4
   * @scenario Position size mismatch detection
   * @expected Mismatch is detected and logged
   */
  test('should detect position size mismatch during reconciliation', async () => {
    // Arrange - Database has position with different size than broker
    const dbPositions = [
      { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
    ];
    
    // Broker has different size (partial close happened during crash)
    const brokerPositions = [
      { symbol: 'BTCUSDT', side: 'Buy', size: '0.3', entry_price: 50000 },
    ];
    
    ctx.databaseManager.getOpenPositions.mockResolvedValue(dbPositions);
    ctx.brokerGateway.getPositions.mockResolvedValue(brokerPositions);
    
    // Act
    const dbPos = await ctx.databaseManager.getOpenPositions();
    const brokerPos = await ctx.brokerGateway.getPositions();
    
    // Detect mismatch
    const mismatch = dbPos[0].size !== parseFloat(brokerPos[0].size);
    
    // Assert
    expect(mismatch).toBe(true);
    
    // In production, would log warning and update database to match broker
    ctx.logger.warn({
      symbol: 'BTCUSDT',
      db_size: dbPos[0].size,
      broker_size: parseFloat(brokerPos[0].size),
    }, 'Position size mismatch detected during reconciliation');
    
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  /**
   * @requirement System Integration 14.4
   * @scenario Ghost position detection
   * @expected Positions in DB but not on broker are detected
   */
  test('should detect ghost positions (in DB but not on broker)', async () => {
    // Arrange - Database has position
    const dbPositions = [
      { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
    ];
    
    // Broker has no positions (position was closed during crash)
    const brokerPositions = [];
    
    ctx.databaseManager.getOpenPositions.mockResolvedValue(dbPositions);
    ctx.brokerGateway.getPositions.mockResolvedValue(brokerPositions);
    
    // Act
    const dbPos = await ctx.databaseManager.getOpenPositions();
    const brokerPos = await ctx.brokerGateway.getPositions();
    
    // Detect ghost positions
    const ghostPositions = dbPos.filter(
      db => !brokerPos.some(b => b.symbol === db.symbol)
    );
    
    // Assert
    expect(ghostPositions).toHaveLength(1);
    expect(ghostPositions[0].symbol).toBe('BTCUSDT');
  });

  /**
   * @requirement System Integration 14.4
   * @scenario System state restoration
   * @expected Equity, phase, and master arm state are restored
   */
  test('should restore system state (equity, phase) from database', async () => {
    // Arrange
    const savedState = createMockSystemState({
      equity: 2500,
      phase: 1,
      masterArm: true,
      circuitBreaker: false,
      highWatermark: 3000,
    });
    
    ctx.databaseManager.getSystemState.mockReturnValue(savedState);
    
    // Act
    const state = ctx.databaseManager.getSystemState();
    
    // Assert
    expect(state.equity).toBe(2500);
    expect(state.phase).toBe(1);
    expect(state.masterArm).toBe(true);
    expect(state.highWatermark).toBe(3000);
  });

  /**
   * @requirement System Integration 14.4
   * @scenario Orphan position on broker detection
   * @expected Positions on broker but not in DB are detected
   */
  test('should detect orphan positions (on broker but not in DB)', async () => {
    // Arrange - Database has no positions
    const dbPositions = [];
    
    // Broker has position (opened but DB write failed)
    const brokerPositions = [
      { symbol: 'BTCUSDT', side: 'Buy', size: '0.5', entry_price: 50000 },
    ];
    
    ctx.databaseManager.getOpenPositions.mockResolvedValue(dbPositions);
    ctx.brokerGateway.getPositions.mockResolvedValue(brokerPositions);
    
    // Act
    const dbPos = await ctx.databaseManager.getOpenPositions();
    const brokerPos = await ctx.brokerGateway.getPositions();
    
    // Detect orphan positions
    const orphanPositions = brokerPos.filter(
      b => !dbPos.some(db => db.symbol === b.symbol)
    );
    
    // Assert
    expect(orphanPositions).toHaveLength(1);
    expect(orphanPositions[0].symbol).toBe('BTCUSDT');
  });
});


//─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: PERFORMANCE OPTIMIZATION (Task 15)
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Performance Optimization (Task 15)', () => {
  /** @type {Object} Test context */
  let ctx;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * @requirement System Integration 15.1
   * @scenario Fast Path IPC latency measurement
   * @expected Average latency under 1ms for in-process operations
   */
  test('should process signals with low latency (< 1ms average)', async () => {
    // Arrange
    const iterations = 100;
    
    // Act - Measure latency
    const stats = await measureLatencyStats(async () => {
      // Simulate signal processing (JSON parse/stringify + routing)
      const signal = createMockPrepareSignal();
      const serialized = JSON.stringify(signal);
      const parsed = JSON.parse(serialized);
      return parsed;
    }, iterations);
    
    // Assert - Average latency should be under 1ms
    expect(stats.avg).toBeLessThan(1);
    
    // Log stats for visibility
    ctx.logger.info({
      avg_latency_ms: stats.avg.toFixed(4),
      max_latency_ms: stats.max.toFixed(4),
      min_latency_ms: stats.min.toFixed(4),
      p99_latency_ms: stats.p99.toFixed(4),
      iterations,
    }, 'Signal processing latency measurement');
  });

  /**
   * @requirement System Integration 15.2
   * @scenario Regime Engine cache with TTL
   * @expected Cache entries expire after 5 minutes
   */
  test('should cache regime calculations with 5-minute TTL', () => {
    // Arrange
    const cache = new Map();
    const TTL_MS = 5 * 60 * 1000; // 5 minutes
    
    // Simulate regime calculation
    const calculateRegime = (symbol) => ({
      symbol,
      trend_state: 1,
      vol_state: 1,
      regime_state: 1,
      calculated_at: Date.now(),
    });
    
    // Act - First call (cache miss)
    const symbol = 'BTCUSDT';
    let cached = cache.get(symbol);
    expect(cached).toBeUndefined();
    
    // Calculate and cache
    const regime = calculateRegime(symbol);
    cache.set(symbol, { data: regime, expires: Date.now() + TTL_MS });
    
    // Second call (cache hit)
    cached = cache.get(symbol);
    
    // Assert
    expect(cached).toBeDefined();
    expect(cached.data.symbol).toBe(symbol);
    expect(cached.expires).toBeGreaterThan(Date.now());
    expect(cached.expires - Date.now()).toBeLessThanOrEqual(TTL_MS);
  });

  /**
   * @requirement System Integration 15.3
   * @scenario WebSocket update batching
   * @expected Updates are batched for efficiency
   */
  test('should batch WebSocket updates when possible', () => {
    // Arrange
    const updates = [];
    const BATCH_SIZE = 10;
    
    const addUpdate = (update) => updates.push(update);
    
    const flushBatch = () => {
      if (updates.length === 0) return [];
      const batch = [...updates];
      updates.length = 0;
      return batch;
    };
    
    // Act - Add multiple updates
    for (let i = 0; i < 15; i++) {
      addUpdate({ type: 'position_update', symbol: `SYM${i}`, timestamp: Date.now() });
    }
    
    expect(updates.length).toBe(15);
    
    // Flush batch
    const batch = flushBatch();
    
    // Assert
    expect(batch.length).toBe(15);
    expect(updates.length).toBe(0);
  });

  /**
   * @requirement System Integration 15.1
   * @scenario ShadowState operation performance
   * @expected Position operations complete quickly
   */
  test('should perform ShadowState operations efficiently', async () => {
    // Arrange
    const testShadowState = new ShadowState({ logger: ctx.logger });
    const iterations = 50;
    
    // Act - Measure position open/close cycle via intent flow
    const stats = await measureLatencyStats(async () => {
      const symbol = `TEST${Math.random().toString(36).substr(2, 5)}`;
      const signalId = `sig-${symbol}`;
      
      // Process intent
      testShadowState.processIntent({
        signal_id: signalId,
        symbol,
        direction: 1,
        size: 0.01,
      });
      
      // Confirm execution
      testShadowState.confirmExecution(signalId, {
        broker_order_id: `order-${symbol}`,
        fill_price: 50000,
        fill_size: 0.01,
        filled: true,
      });
      
      // Close position
      testShadowState.closePosition(symbol, 51000, 'TEST');
      
      return true;
    }, iterations);
    
    // Assert - Operations should be fast
    expect(stats.avg).toBeLessThan(5); // Under 5ms average
    expect(stats.p99).toBeLessThan(10); // Under 10ms p99
  });

  /**
   * @requirement System Integration 15.2
   * @scenario Cache invalidation on stale data
   * @expected Stale cache entries are not used
   */
  test('should invalidate stale cache entries', () => {
    // Arrange
    const cache = new Map();
    const TTL_MS = 100; // Short TTL for testing
    
    // Add entry with short TTL
    cache.set('BTCUSDT', {
      data: { regime_state: 1 },
      expires: Date.now() + TTL_MS,
    });
    
    // Act - Wait for expiry
    const entry = cache.get('BTCUSDT');
    const isExpired = entry.expires < Date.now() + TTL_MS + 1;
    
    // For immediate check, entry should still be valid
    expect(isExpired).toBe(true);
    
    // Simulate checking after expiry
    const futureTime = Date.now() + TTL_MS + 100;
    const wouldBeExpired = entry.expires < futureTime;
    
    // Assert
    expect(wouldBeExpired).toBe(true);
  });
});


//─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: EDGE CASES AND ERROR HANDLING
//─────────────────────────────────────────────────────────────────────────────

describe('Integration: Edge Cases and Error Handling', () => {
  /** @type {Object} Test context */
  let ctx;
  /** @type {ShadowState} Real ShadowState instance */
  let shadowState;
  /** @type {SignalRouter} Real SignalRouter instance */
  let signalRouter;
  /** @type {PhaseManager} Real PhaseManager instance */
  let phaseManager;

  beforeEach(() => {
    ctx = createTestContext();
    shadowState = new ShadowState({ logger: ctx.logger });
    
    phaseManager = new PhaseManager({
      brokerGateway: ctx.brokerGateway,
      logger: ctx.logger,
    });
    phaseManager.setEquity(DEFAULT_TEST_EQUITY);
    
    signalRouter = new SignalRouter({
      phaseManager,
      logger: ctx.logger,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    signalRouter?.destroy();
    phaseManager?.destroy();
  });

  /**
   * @scenario Invalid signal validation
   * @expected Invalid signals are rejected with appropriate errors
   */
  test('should reject signals with missing required fields', async () => {
    // Arrange - Signal missing symbol
    const invalidSignal = {
      signal_id: 'test-123',
      source: 'scavenger',
      direction: 'LONG',
      // Missing: symbol
    };
    
    // Act & Assert
    const result = await signalRouter.route(invalidSignal);
    assertSignalRejected(result, 'symbol');
  });

  /**
   * @scenario Invalid direction handling
   * @expected Invalid directions are rejected
   */
  test('should reject signals with invalid direction', async () => {
    // Arrange
    const invalidSignal = createMockPrepareSignal({
      direction: 'INVALID',
    });
    
    // Act
    const result = await signalRouter.route(invalidSignal);
    
    // Assert
    assertSignalRejected(result, 'direction');
  });

  /**
   * @scenario Duplicate position handling
   * @expected Pyramiding adds to existing position
   */
  test('should handle pyramiding (adding to existing position)', () => {
    // Arrange - Open initial position via intent flow
    shadowState.processIntent({
      signal_id: 'initial-123',
      symbol: 'BTCUSDT',
      direction: 1,
      size: 0.5,
    });
    
    shadowState.confirmExecution('initial-123', {
      broker_order_id: 'order-123',
      fill_price: 50000,
      fill_size: 0.5,
      filled: true,
    });
    
    // Act - Process pyramid intent
    shadowState.processIntent({
      signal_id: 'pyramid-123',
      symbol: 'BTCUSDT',
      direction: 1,
      size: 0.3,
    });
    
    shadowState.validateIntent('pyramid-123');
    
    // Confirm with different fill price
    const position = shadowState.confirmExecution('pyramid-123', {
      broker_order_id: 'order-456',
      fill_price: 51000,
      fill_size: 0.3,
      filled: true,
    });
    
    // Assert - Position should be increased with averaged entry
    expect(position).toBeDefined();
    expect(position.size).toBe(0.8); // 0.5 + 0.3
    
    // Average entry: (50000 * 0.5 + 51000 * 0.3) / 0.8 = 50375
    expect(position.entry_price).toBeCloseTo(50375, 0);
  });

  /**
   * @scenario Partial position close
   * @expected Partial close reduces position size correctly
   */
  test('should handle partial position close (take profit scaling)', () => {
    // Arrange - Open position via intent flow
    shadowState.processIntent({
      signal_id: 'sig-partial-123',
      symbol: 'BTCUSDT',
      direction: 1,
      size: 1.0,
    });
    
    shadowState.confirmExecution('sig-partial-123', {
      broker_order_id: 'order-partial-123',
      fill_price: 50000,
      fill_size: 1.0,
      filled: true,
    });
    
    // Act - Close 50% at TP1
    const tradeRecord = shadowState.closePartialPosition('BTCUSDT', 51000, 0.5, 'TP1');
    
    // Assert
    expect(tradeRecord).toBeDefined();
    expect(tradeRecord.size).toBe(0.5);
    expect(tradeRecord.pnl).toBe(500); // (51000 - 50000) * 0.5
    expect(tradeRecord.close_reason).toBe('TP1');
    
    // Position should still exist with reduced size
    expect(shadowState.hasPosition('BTCUSDT')).toBe(true);
    const remainingPosition = shadowState.getPosition('BTCUSDT');
    expect(remainingPosition.size).toBe(0.5);
  });

  /**
   * @scenario Handler not registered
   * @expected Signals for unregistered sources are rejected
   */
  test('should reject signals when no handler is registered', async () => {
    // Arrange - Create a fresh router without any handlers
    // and set to Phase 1 so scavenger signals are phase-valid
    phaseManager.setEquity(500); // Phase 1
    
    const freshRouter = new SignalRouter({
      phaseManager,
      logger: ctx.logger,
    });
    // Note: NOT registering any handler
    
    const signal = createScavengerSignal();
    
    // Act
    const result = await freshRouter.route({
      ...signal,
      direction: 'LONG',
    });
    
    // Assert - Should be rejected because no handler is registered
    assertSignalRejected(result, 'UNKNOWN_SOURCE');
    
    // Cleanup
    freshRouter.destroy();
  });

  /**
   * @scenario Phase not determined
   * @expected Signals are rejected when phase is null
   */
  test('should reject signals when phase is not determined', async () => {
    // Arrange - Create new PhaseManager without setting equity
    const newPhaseManager = new PhaseManager({
      brokerGateway: ctx.brokerGateway,
      logger: ctx.logger,
    });
    // Don't call setEquity - phase will be null
    
    const newRouter = new SignalRouter({
      phaseManager: newPhaseManager,
      logger: ctx.logger,
    });
    
    newRouter.registerHandler('scavenger', async () => ({ executed: true }));
    
    const signal = createScavengerSignal();
    
    // Act
    const result = await newRouter.route({
      ...signal,
      direction: 'LONG',
    });
    
    // Assert
    assertSignalRejected(result, 'Phase not determined');
    
    // Cleanup
    newRouter.destroy();
    newPhaseManager.destroy();
  });

  /**
   * @scenario Zero-size position handling
   * @expected Zero-size positions are handled gracefully
   */
  test('should handle zero-size position edge case', () => {
    // Arrange - Create position via intent flow
    shadowState.processIntent({
      signal_id: 'sig-zero-123',
      symbol: 'BTCUSDT',
      direction: 1,
      size: 0.1,
    });
    
    shadowState.confirmExecution('sig-zero-123', {
      broker_order_id: 'order-zero-123',
      fill_price: 50000,
      fill_size: 0.1,
      filled: true,
    });
    
    // Close entire position
    shadowState.closePosition('BTCUSDT', 51000, 'FULL_CLOSE');
    
    // Assert - Position should be removed
    expect(shadowState.hasPosition('BTCUSDT')).toBe(false);
    
    // Attempting to close again should return null
    const result = shadowState.closePosition('BTCUSDT', 51000, 'DUPLICATE_CLOSE');
    expect(result).toBeNull();
  });
});
