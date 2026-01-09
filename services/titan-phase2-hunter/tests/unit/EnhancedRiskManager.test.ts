/**
 * Unit Tests for Enhanced Risk Manager
 * 
 * Tests for Task 7: Enhanced Risk Management System
 * Requirements: 8.1-8.7
 */

import {
  EnhancedRiskManager,
  DEFAULT_ENHANCED_RISK_CONFIG,
  RiskCondition,
  RiskAdjustments
} from '../../src/risk/EnhancedRiskManager';
import {
  OracleScore,
  GlobalCVDData,
  BotTrapAnalysis,
  PredictionMarketEvent,
  EventCategory,
  ImpactLevel,
  ConnectionStatus
} from '../../src/types/enhanced-2026';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockPredictionEvent(
  overrides: Partial<PredictionMarketEvent> = {}
): PredictionMarketEvent {
  return {
    id: 'test-event-1',
    title: 'Test Event',
    description: 'Test event description',
    probability: 50,
    volume: 1000000,
    liquidity: 500000,
    category: EventCategory.CRYPTO_PRICE,
    impact: ImpactLevel.MEDIUM,
    resolution: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours from now
    lastUpdate: new Date(),
    source: 'polymarket',
    ...overrides
  };
}

function createMockOracleScore(
  overrides: Partial<OracleScore> = {}
): OracleScore {
  return {
    sentiment: 50,
    confidence: 75,
    events: [],
    veto: false,
    vetoReason: null,
    convictionMultiplier: 1.0,
    timestamp: new Date(),
    ...overrides
  };
}


function createMockGlobalCVD(
  overrides: Partial<GlobalCVDData> = {}
): GlobalCVDData {
  return {
    aggregatedCVD: 500,
    exchangeFlows: [
      { exchange: 'binance', cvd: 200, volume: 1000000, trades: 5000, weight: 0.4, timestamp: new Date(), status: ConnectionStatus.CONNECTED },
      { exchange: 'coinbase', cvd: 150, volume: 800000, trades: 4000, weight: 0.35, timestamp: new Date(), status: ConnectionStatus.CONNECTED },
      { exchange: 'kraken', cvd: 150, volume: 500000, trades: 2000, weight: 0.25, timestamp: new Date(), status: ConnectionStatus.CONNECTED }
    ],
    consensus: 'bullish',
    confidence: 80,
    manipulation: {
      detected: false,
      suspectExchange: null,
      divergenceScore: 10,
      pattern: 'none'
    },
    timestamp: new Date(),
    ...overrides
  };
}

function createMockBotTrapAnalysis(
  overrides: Partial<BotTrapAnalysis> = {}
): BotTrapAnalysis {
  return {
    isSuspect: false,
    suspicionScore: 20,
    patterns: [],
    recommendations: [],
    timestamp: new Date(),
    ...overrides
  };
}

// ============================================================================
// ENHANCED RISK MANAGER TESTS
// ============================================================================

describe('EnhancedRiskManager', () => {
  let riskManager: EnhancedRiskManager;

  beforeEach(() => {
    riskManager = new EnhancedRiskManager({
      monitoringEnabled: false // Disable for unit tests
    });
  });

  afterEach(() => {
    riskManager.destroy();
  });

  describe('initialization', () => {
    test('should initialize with default config', () => {
      const config = riskManager.getConfig();
      expect(config.highImpactEventThreshold).toBe(70);
      expect(config.minExchangesRequired).toBe(2);
    });

    test('should initialize with custom config', () => {
      const customManager = new EnhancedRiskManager({
        highImpactEventThreshold: 80,
        monitoringEnabled: false
      });
      const config = customManager.getConfig();
      expect(config.highImpactEventThreshold).toBe(80);
      customManager.destroy();
    });

    test('should start with no active conditions', () => {
      const state = riskManager.getState();
      expect(state.activeConditions.length).toBe(0);
    });

    test('should start with default adjustments', () => {
      const adjustments = riskManager.getAdjustments();
      expect(adjustments.positionSizeMultiplier).toBe(1.0);
      expect(adjustments.haltNewEntries).toBe(false);
    });
  });


  describe('high-impact event detection (Requirement 8.1)', () => {
    test('should activate condition when high-impact event exceeds threshold', () => {
      const highImpactEvent = createMockPredictionEvent({
        probability: 75,
        impact: ImpactLevel.HIGH
      });

      const oracleScore = createMockOracleScore({
        events: [highImpactEvent]
      });

      const condition = riskManager.evaluateHighImpactEvents(oracleScore);

      expect(condition).not.toBeNull();
      expect(condition?.type).toBe('HIGH_IMPACT_EVENT');
      expect(condition?.severity).toBe('high');
    });

    test('should reduce position size by 50% for high-impact events', () => {
      const highImpactEvent = createMockPredictionEvent({
        probability: 75,
        impact: ImpactLevel.HIGH
      });

      const oracleScore = createMockOracleScore({
        events: [highImpactEvent]
      });

      riskManager.evaluateHighImpactEvents(oracleScore);
      const adjustments = riskManager.getAdjustments();

      expect(adjustments.positionSizeMultiplier).toBe(0.5);
    });

    test('should not activate for events below threshold', () => {
      const lowProbEvent = createMockPredictionEvent({
        probability: 60,
        impact: ImpactLevel.HIGH
      });

      const oracleScore = createMockOracleScore({
        events: [lowProbEvent]
      });

      const condition = riskManager.evaluateHighImpactEvents(oracleScore);

      expect(condition).toBeNull();
    });

    test('should mark extreme events as critical severity', () => {
      const extremeEvent = createMockPredictionEvent({
        probability: 80,
        impact: ImpactLevel.EXTREME
      });

      const oracleScore = createMockOracleScore({
        events: [extremeEvent]
      });

      const condition = riskManager.evaluateHighImpactEvents(oracleScore);

      expect(condition?.severity).toBe('critical');
      expect(condition?.adjustments.haltNewEntries).toBe(true);
    });
  });

  describe('prediction market volatility (Requirement 8.2)', () => {
    test('should activate condition for extreme uncertainty', () => {
      const uncertainEvent1 = createMockPredictionEvent({
        id: 'event-1',
        probability: 48,
        impact: ImpactLevel.HIGH
      });
      const uncertainEvent2 = createMockPredictionEvent({
        id: 'event-2',
        probability: 52,
        impact: ImpactLevel.HIGH
      });

      const oracleScore = createMockOracleScore({
        events: [uncertainEvent1, uncertainEvent2]
      });

      const condition = riskManager.evaluatePredictionUncertainty(oracleScore);

      expect(condition).not.toBeNull();
      expect(condition?.type).toBe('EXTREME_UNCERTAINTY');
    });

    test('should tighten stop loss for extreme uncertainty', () => {
      const uncertainEvent1 = createMockPredictionEvent({
        id: 'event-1',
        probability: 48,
        impact: ImpactLevel.HIGH
      });
      const uncertainEvent2 = createMockPredictionEvent({
        id: 'event-2',
        probability: 52,
        impact: ImpactLevel.HIGH
      });

      const oracleScore = createMockOracleScore({
        events: [uncertainEvent1, uncertainEvent2]
      });

      riskManager.evaluatePredictionUncertainty(oracleScore);
      const adjustments = riskManager.getAdjustments();

      expect(adjustments.stopLossAdjustment).toBeLessThan(0);
    });
  });


  describe('scheduled event risk adjustments (Requirements 8.4, 8.5)', () => {
    test('should activate condition for imminent high-impact events', () => {
      const imminentEvent = createMockPredictionEvent({
        probability: 60,
        impact: ImpactLevel.HIGH,
        resolution: new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours
      });

      const oracleScore = createMockOracleScore({
        events: [imminentEvent]
      });

      const condition = riskManager.evaluateScheduledEvents(oracleScore);

      expect(condition).not.toBeNull();
      expect(condition?.type).toBe('SCHEDULED_EVENT');
    });

    test('should reduce position size by 30% for scheduled events', () => {
      const imminentEvent = createMockPredictionEvent({
        probability: 60,
        impact: ImpactLevel.HIGH,
        resolution: new Date(Date.now() + 12 * 60 * 60 * 1000)
      });

      const oracleScore = createMockOracleScore({
        events: [imminentEvent]
      });

      riskManager.evaluateScheduledEvents(oracleScore);
      const adjustments = riskManager.getAdjustments();

      expect(adjustments.positionSizeMultiplier).toBe(0.7); // 1 - 0.3
    });

    test('should halt entries for events within 1 hour', () => {
      const veryImminentEvent = createMockPredictionEvent({
        probability: 60,
        impact: ImpactLevel.HIGH,
        resolution: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
      });

      const oracleScore = createMockOracleScore({
        events: [veryImminentEvent]
      });

      riskManager.evaluateScheduledEvents(oracleScore);
      const adjustments = riskManager.getAdjustments();

      expect(adjustments.haltNewEntries).toBe(true);
    });
  });

  describe('Global CVD divergence monitoring (Requirement 8.3)', () => {
    test('should activate condition for high CVD divergence', () => {
      const globalCVD = createMockGlobalCVD({
        manipulation: {
          detected: false,
          suspectExchange: null,
          divergenceScore: 60,
          pattern: 'none'
        }
      });

      const condition = riskManager.evaluateCVDDivergence(globalCVD);

      expect(condition).not.toBeNull();
      expect(condition?.type).toBe('CVD_DIVERGENCE');
    });

    test('should halt entries when manipulation detected', () => {
      const globalCVD = createMockGlobalCVD({
        manipulation: {
          detected: true,
          suspectExchange: 'binance',
          divergenceScore: 80,
          pattern: 'single_exchange_outlier'
        }
      });

      riskManager.evaluateCVDDivergence(globalCVD);
      const adjustments = riskManager.getAdjustments();

      expect(adjustments.haltNewEntries).toBe(true);
      expect(adjustments.positionSizeMultiplier).toBe(0.5);
    });

    test('should deactivate condition when divergence normalizes', () => {
      // First activate
      const highDivergence = createMockGlobalCVD({
        manipulation: { detected: false, suspectExchange: null, divergenceScore: 60, pattern: 'none' }
      });
      riskManager.evaluateCVDDivergence(highDivergence);
      expect(riskManager.getState().activeConditions.length).toBe(1);

      // Then normalize
      const normalDivergence = createMockGlobalCVD({
        manipulation: { detected: false, suspectExchange: null, divergenceScore: 20, pattern: 'none' }
      });
      riskManager.evaluateCVDDivergence(normalDivergence);
      
      const state = riskManager.getState();
      const cvdCondition = state.activeConditions.find(c => c.type === 'CVD_DIVERGENCE');
      expect(cvdCondition).toBeUndefined();
    });
  });


  describe('Bot trap frequency monitoring (Requirement 8.3)', () => {
    test('should track bot trap rate', () => {
      // Record some signals
      for (let i = 0; i < 10; i++) {
        riskManager.recordSignal(i < 6); // 60% bot traps
      }

      const stats = riskManager.getStatistics();
      expect(stats.botTrapRate).toBe(0.6);
    });

    test('should activate condition when bot trap rate exceeds threshold', () => {
      // Record signals to exceed 50% threshold
      for (let i = 0; i < 10; i++) {
        riskManager.recordSignal(i < 6); // 60% bot traps
      }

      const condition = riskManager.evaluateBotTrapFrequency(null);

      expect(condition).not.toBeNull();
      expect(condition?.type).toBe('BOT_TRAP_FREQUENCY');
    });

    test('should mark as critical when rate exceeds 80%', () => {
      // Record signals to exceed 80%
      for (let i = 0; i < 10; i++) {
        riskManager.recordSignal(i < 9); // 90% bot traps
      }

      const condition = riskManager.evaluateBotTrapFrequency(null);

      expect(condition?.severity).toBe('critical');
      expect(condition?.adjustments.haltNewEntries).toBe(true);
    });
  });

  describe('multi-exchange failure protocols (Requirement 8.6)', () => {
    test('should track exchange status', () => {
      riskManager.updateExchangeStatus('binance', ConnectionStatus.CONNECTED);
      riskManager.updateExchangeStatus('coinbase', ConnectionStatus.CONNECTED);
      riskManager.updateExchangeStatus('kraken', ConnectionStatus.DISCONNECTED);

      const stats = riskManager.getStatistics();
      expect(stats.exchangeOnlineCount).toBe(2);
    });

    test('should activate condition for single exchange offline', () => {
      riskManager.updateExchangeStatus('binance', ConnectionStatus.CONNECTED);
      riskManager.updateExchangeStatus('coinbase', ConnectionStatus.CONNECTED);
      riskManager.updateExchangeStatus('kraken', ConnectionStatus.DISCONNECTED);

      const state = riskManager.getState();
      const offlineCondition = state.activeConditions.find(c => c.type === 'EXCHANGE_OFFLINE');

      expect(offlineCondition).toBeDefined();
      expect(offlineCondition?.severity).toBe('medium');
    });

    test('should halt entries when multiple exchanges fail', () => {
      riskManager.updateExchangeStatus('binance', ConnectionStatus.CONNECTED);
      riskManager.updateExchangeStatus('coinbase', ConnectionStatus.DISCONNECTED);
      riskManager.updateExchangeStatus('kraken', ConnectionStatus.DISCONNECTED);

      const adjustments = riskManager.getAdjustments();

      expect(adjustments.haltNewEntries).toBe(true);
    });

    test('should emit events for exchange status changes', () => {
      const offlineHandler = jest.fn();
      const onlineHandler = jest.fn();

      riskManager.on('exchange:offline', offlineHandler);
      riskManager.on('exchange:online', onlineHandler);

      riskManager.updateExchangeStatus('binance', ConnectionStatus.CONNECTED);
      riskManager.updateExchangeStatus('binance', ConnectionStatus.DISCONNECTED);
      riskManager.updateExchangeStatus('binance', ConnectionStatus.CONNECTED);

      expect(offlineHandler).toHaveBeenCalledWith('binance');
      expect(onlineHandler).toHaveBeenCalledWith('binance');
    });
  });


  describe('Oracle connection stability (Requirement 8.5)', () => {
    test('should track Oracle failures', () => {
      riskManager.recordOracleFailure();
      riskManager.recordOracleFailure();

      const stats = riskManager.getStatistics();
      expect(stats.oracleFailureCount).toBe(2);
    });

    test('should activate condition when Oracle is unstable', () => {
      // Record failures to exceed threshold (default: 3)
      riskManager.recordOracleFailure();
      riskManager.recordOracleFailure();
      riskManager.recordOracleFailure();

      const state = riskManager.getState();
      const oracleCondition = state.activeConditions.find(c => c.type === 'ORACLE_UNSTABLE');

      expect(oracleCondition).toBeDefined();
    });

    test('should reduce position size when Oracle is unstable', () => {
      riskManager.recordOracleFailure();
      riskManager.recordOracleFailure();
      riskManager.recordOracleFailure();

      const adjustments = riskManager.getAdjustments();
      expect(adjustments.positionSizeMultiplier).toBe(0.5);
    });

    test('should recover when Oracle stabilizes', () => {
      // First make unstable
      riskManager.recordOracleFailure();
      riskManager.recordOracleFailure();
      riskManager.recordOracleFailure();

      // Then recover
      riskManager.recordOracleSuccess();
      riskManager.recordOracleSuccess();
      riskManager.recordOracleSuccess();

      const state = riskManager.getState();
      const oracleCondition = state.activeConditions.find(c => c.type === 'ORACLE_UNSTABLE');

      expect(oracleCondition).toBeUndefined();
    });
  });

  describe('comprehensive evaluation', () => {
    test('should evaluate all conditions at once', () => {
      const oracleScore = createMockOracleScore();
      const globalCVD = createMockGlobalCVD();
      const botTrap = createMockBotTrapAnalysis();

      const state = riskManager.evaluateAllConditions(oracleScore, globalCVD, botTrap);

      expect(state).toBeDefined();
      expect(state.lastUpdate).toBeDefined();
    });

    test('should aggregate adjustments from multiple conditions', () => {
      // Trigger multiple conditions
      const highImpactEvent = createMockPredictionEvent({
        probability: 75,
        impact: ImpactLevel.HIGH
      });
      const oracleScore = createMockOracleScore({ events: [highImpactEvent] });

      const globalCVD = createMockGlobalCVD({
        manipulation: { detected: false, suspectExchange: null, divergenceScore: 60, pattern: 'none' }
      });

      riskManager.evaluateAllConditions(oracleScore, globalCVD, null);

      const state = riskManager.getState();
      expect(state.activeConditions.length).toBeGreaterThan(1);

      // Should use most restrictive multiplier
      const adjustments = riskManager.getAdjustments();
      expect(adjustments.positionSizeMultiplier).toBeLessThanOrEqual(0.5);
    });
  });


  describe('position size and leverage adjustments', () => {
    test('should calculate adjusted position size', () => {
      const highImpactEvent = createMockPredictionEvent({
        probability: 75,
        impact: ImpactLevel.HIGH
      });
      const oracleScore = createMockOracleScore({ events: [highImpactEvent] });

      riskManager.evaluateHighImpactEvents(oracleScore);

      const adjustedSize = riskManager.getAdjustedPositionSize(1000);
      expect(adjustedSize).toBe(500); // 50% reduction
    });

    test('should calculate adjusted stop loss', () => {
      const uncertainEvent1 = createMockPredictionEvent({
        id: 'event-1',
        probability: 48,
        impact: ImpactLevel.HIGH
      });
      const uncertainEvent2 = createMockPredictionEvent({
        id: 'event-2',
        probability: 52,
        impact: ImpactLevel.HIGH
      });
      const oracleScore = createMockOracleScore({
        events: [uncertainEvent1, uncertainEvent2]
      });

      riskManager.evaluatePredictionUncertainty(oracleScore);

      const adjustedStopLoss = riskManager.getAdjustedStopLoss(0.015); // 1.5%
      expect(adjustedStopLoss).toBeLessThan(0.015);
    });

    test('should calculate adjusted max leverage', () => {
      const highImpactEvent = createMockPredictionEvent({
        probability: 75,
        impact: ImpactLevel.HIGH
      });
      const oracleScore = createMockOracleScore({ events: [highImpactEvent] });

      riskManager.evaluateHighImpactEvents(oracleScore);

      const adjustedLeverage = riskManager.getAdjustedMaxLeverage(5);
      expect(adjustedLeverage).toBeLessThan(5);
    });
  });

  describe('canOpenNewPositions', () => {
    test('should allow positions when no halt conditions', () => {
      expect(riskManager.canOpenNewPositions()).toBe(true);
    });

    test('should block positions when halt condition active', () => {
      // Trigger multiple exchange failure
      riskManager.updateExchangeStatus('binance', ConnectionStatus.CONNECTED);
      riskManager.updateExchangeStatus('coinbase', ConnectionStatus.DISCONNECTED);
      riskManager.updateExchangeStatus('kraken', ConnectionStatus.DISCONNECTED);

      expect(riskManager.canOpenNewPositions()).toBe(false);
    });
  });

  describe('statistics', () => {
    test('should return comprehensive statistics', () => {
      const stats = riskManager.getStatistics();

      expect(stats).toHaveProperty('activeConditionCount');
      expect(stats).toHaveProperty('conditionsByType');
      expect(stats).toHaveProperty('exchangeOnlineCount');
      expect(stats).toHaveProperty('oracleFailureCount');
      expect(stats).toHaveProperty('botTrapRate');
      expect(stats).toHaveProperty('positionSizeMultiplier');
      expect(stats).toHaveProperty('isHalted');
    });
  });

  describe('configuration', () => {
    test('should update configuration', () => {
      riskManager.updateConfig({ highImpactEventThreshold: 80 });
      const config = riskManager.getConfig();
      expect(config.highImpactEventThreshold).toBe(80);
    });
  });

  describe('reset and cleanup', () => {
    test('should reset state', () => {
      // Add some conditions
      const highImpactEvent = createMockPredictionEvent({
        probability: 75,
        impact: ImpactLevel.HIGH
      });
      const oracleScore = createMockOracleScore({ events: [highImpactEvent] });
      riskManager.evaluateHighImpactEvents(oracleScore);

      // Reset
      riskManager.resetState();

      const state = riskManager.getState();
      expect(state.activeConditions.length).toBe(0);
      expect(state.oracleFailureCount).toBe(0);
    });
  });
});
