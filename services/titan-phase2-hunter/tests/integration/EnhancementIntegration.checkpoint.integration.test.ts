/**
 * Checkpoint 9: Core Enhancement Integration Complete
 * 
 * This test suite validates that all 2026 enhancement layers integrate properly
 * with the existing Phase 2 architecture:
 * 
 * 1. All enhancement layers integrate properly with existing Phase 2
 * 2. Fallback mechanisms work correctly
 * 3. Emergency protocols and graceful degradation work
 * 
 * Task 9: Checkpoint - Core Enhancement Integration Complete
 */

import { EnhancedHolographicEngine } from '../../src/enhanced-hologram/EnhancedHolographicEngine';
import { EnhancedScoringEngine } from '../../src/enhanced-hologram/EnhancedScoringEngine';
import { ConvictionSizingEngine } from '../../src/enhanced-hologram/ConvictionSizingEngine';
import { EnhancedSignalValidator } from '../../src/enhanced-hologram/EnhancedSignalValidator';
import { EmergencyProtocolManager, EmergencyType } from '../../src/emergency/EmergencyProtocolManager';
import { EnhancedRiskManager } from '../../src/risk/EnhancedRiskManager';
import { BotTrapDetector } from '../../src/bottrap/BotTrapDetector';
import { AdvancedFlowValidator } from '../../src/flow/AdvancedFlowValidator';
import {
  OracleScore,
  FlowValidation,
  BotTrapAnalysis,
  GlobalCVDData,
  TechnicalSignal,
  ConnectionStatus,
  ImpactLevel,
  EventCategory,
  PredictionMarketEvent
} from '../../src/types/enhanced-2026';
import { HologramState, TimeframeState } from '../../src/types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockTimeframeState(
  timeframe: '1D' | '4H' | '15m',
  trend: 'BULL' | 'BEAR' | 'RANGE',
  location: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM'
): TimeframeState {
  return {
    timeframe,
    trend,
    dealingRange: { high: 50000, low: 45000, equilibrium: 47500 },
    currentPrice: 48000,
    location,
    fractals: [],
    bos: [],
    mss: timeframe === '15m' ? { type: 'bullish', price: 48000, timestamp: Date.now() } : null
  };
}


function createMockHologramState(
  dailyTrend: 'BULL' | 'BEAR' | 'RANGE' = 'BULL',
  h4Location: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM' = 'DISCOUNT',
  m15Trend: 'BULL' | 'BEAR' | 'RANGE' = 'BULL'
): HologramState {
  return {
    symbol: 'BTCUSDT',
    timestamp: Date.now(),
    daily: createMockTimeframeState('1D', dailyTrend, 'EQUILIBRIUM'),
    h4: createMockTimeframeState('4H', dailyTrend, h4Location),
    m15: createMockTimeframeState('15m', m15Trend, 'EQUILIBRIUM'),
    alignmentScore: 80,
    status: 'A+',
    veto: { vetoed: false, reason: null, direction: null },
    rsScore: 0.02
  };
}

function createMockOracleScore(
  sentiment: number = 60,
  confidence: number = 80,
  veto: boolean = false,
  events: PredictionMarketEvent[] = []
): OracleScore {
  return {
    sentiment,
    confidence,
    events,
    veto,
    vetoReason: veto ? 'Test veto' : null,
    convictionMultiplier: sentiment >= 60 ? 1.5 : 1.0,
    timestamp: new Date()
  };
}

function createMockFlowValidation(
  isValid: boolean = true,
  flowType: 'passive_absorption' | 'aggressive_pushing' | 'neutral' = 'passive_absorption',
  institutionalProbability: number = 75
): FlowValidation {
  return {
    isValid,
    confidence: 80,
    flowType,
    sweepCount: 2,
    icebergDensity: 60,
    institutionalProbability,
    timestamp: new Date()
  };
}

function createMockBotTrapAnalysis(
  isSuspect: boolean = false,
  suspicionScore: number = 20
): BotTrapAnalysis {
  return {
    isSuspect,
    suspicionScore,
    patterns: [],
    recommendations: isSuspect ? [{
      action: 'reduce_size',
      reasoning: 'Suspect pattern detected',
      adjustments: {
        positionSizeMultiplier: 0.5,
        stopLossAdjustment: 0.01,
        confirmationThreshold: 1.5
      }
    }] : [],
    timestamp: new Date()
  };
}

function createMockGlobalCVD(
  consensus: 'bullish' | 'bearish' | 'neutral' | 'conflicted' = 'bullish',
  confidence: number = 80,
  manipulationDetected: boolean = false,
  divergenceScore: number = 10
): GlobalCVDData {
  return {
    aggregatedCVD: consensus === 'bullish' ? 1000 : consensus === 'bearish' ? -1000 : 0,
    exchangeFlows: [
      { exchange: 'binance', cvd: 500, volume: 1000000, trades: 5000, weight: 0.4, timestamp: new Date(), status: ConnectionStatus.CONNECTED },
      { exchange: 'coinbase', cvd: 300, volume: 800000, trades: 4000, weight: 0.35, timestamp: new Date(), status: ConnectionStatus.CONNECTED },
      { exchange: 'kraken', cvd: 200, volume: 500000, trades: 2000, weight: 0.25, timestamp: new Date(), status: ConnectionStatus.CONNECTED }
    ],
    consensus,
    confidence,
    manipulation: {
      detected: manipulationDetected,
      suspectExchange: manipulationDetected ? 'binance' : null,
      divergenceScore,
      pattern: manipulationDetected ? 'single_exchange_outlier' : 'none'
    },
    timestamp: new Date()
  };
}

function createMockTechnicalSignal(
  direction: 'LONG' | 'SHORT' = 'LONG',
  confidence: number = 75
): TechnicalSignal {
  return {
    symbol: 'BTCUSDT',
    direction,
    confidence,
    entryPrice: 48000,
    stopLoss: 47000,
    takeProfit: 50000,
    timestamp: new Date(),
    source: 'hologram'
  };
}

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
    resolution: new Date(Date.now() + 48 * 60 * 60 * 1000),
    lastUpdate: new Date(),
    source: 'polymarket',
    ...overrides
  };
}


// ============================================================================
// CHECKPOINT 9: CORE ENHANCEMENT INTEGRATION TESTS
// ============================================================================

describe('Checkpoint 9: Core Enhancement Integration Complete', () => {
  
  // ============================================================================
  // SECTION 1: Enhancement Layer Integration with Phase 2
  // ============================================================================
  
  describe('1. Enhancement Layer Integration with Existing Phase 2', () => {
    let scoringEngine: EnhancedScoringEngine;
    let sizingEngine: ConvictionSizingEngine;
    let signalValidator: EnhancedSignalValidator;
    let enhancedEngine: EnhancedHolographicEngine;

    beforeEach(() => {
      scoringEngine = new EnhancedScoringEngine();
      sizingEngine = new ConvictionSizingEngine();
      signalValidator = new EnhancedSignalValidator();
      enhancedEngine = new EnhancedHolographicEngine({
        enabled: true,
        enableOracle: false,
        enableFlowValidator: false,
        enableBotTrapDetector: false,
        enableGlobalCVD: false,
        fallbackToClassic: true
      });
    });

    afterEach(() => {
      enhancedEngine.shutdown();
    });

    test('should integrate Oracle layer with classic hologram scoring', () => {
      const hologram = createMockHologramState('BULL', 'DISCOUNT', 'BULL');
      const oracle = createMockOracleScore(70, 85);
      
      const result = scoringEngine.calculateEnhancedScore(
        hologram, oracle, null, null, null
      );

      expect(result.adjustedScore).toBeGreaterThan(0);
      expect(result.oracleContribution).toBeGreaterThan(50); // Bullish Oracle
      expect(result.reasoning).toContain(expect.stringMatching(/Oracle/i));
    });

    test('should integrate Flow Validator with signal validation', () => {
      const signal = createMockTechnicalSignal('LONG', 75);
      const flow = createMockFlowValidation(true, 'passive_absorption', 80);
      
      const result = signalValidator.validateSignal(
        signal, null, flow, null, null
      );

      expect(result.layerValidations.length).toBeGreaterThan(0);
      const flowLayer = result.layerValidations.find(l => l.layer === 'flow');
      expect(flowLayer).toBeDefined();
      expect(flowLayer?.recommendation).toBe('proceed');
    });

    test('should integrate Bot Trap Detector with position sizing', () => {
      const botTrapClean = createMockBotTrapAnalysis(false, 10);
      const botTrapSuspect = createMockBotTrapAnalysis(true, 75);
      
      const cleanSize = sizingEngine.calculatePositionSize(
        1000, null, null, botTrapClean, null
      );
      
      const suspectSize = sizingEngine.calculatePositionSize(
        1000, null, null, botTrapSuspect, null
      );

      expect(suspectSize.finalSize).toBeLessThan(cleanSize.finalSize);
      expect(suspectSize.trapReduction).toBeLessThan(1.0);
    });

    test('should integrate Global CVD with consensus validation', () => {
      const signal = createMockTechnicalSignal('LONG', 75);
      const globalCVD = createMockGlobalCVD('bullish', 85);
      
      const result = signalValidator.validateSignal(
        signal, null, null, null, globalCVD
      );

      const cvdLayer = result.layerValidations.find(l => l.layer === 'globalCVD');
      expect(cvdLayer).toBeDefined();
      expect(cvdLayer?.recommendation).toBe('proceed');
    });

    test('should combine all enhancement layers in scoring formula (Req 5.1)', () => {
      const hologram = createMockHologramState('BULL', 'DISCOUNT', 'BULL');
      const oracle = createMockOracleScore(65, 80);
      const flow = createMockFlowValidation(true, 'passive_absorption', 75);
      const botTrap = createMockBotTrapAnalysis(false, 15);
      const globalCVD = createMockGlobalCVD('bullish', 80);

      const result = scoringEngine.calculateEnhancedScore(
        hologram, oracle, flow, botTrap, globalCVD
      );

      // Verify all components contribute
      expect(result.dailyBiasContribution).toBeGreaterThan(0);
      expect(result.fourHourContribution).toBeGreaterThan(0);
      expect(result.fifteenMinContribution).toBeGreaterThan(0);
      expect(result.oracleContribution).toBeGreaterThan(0);
      expect(result.adjustedScore).toBeGreaterThan(0);
      expect(result.adjustedScore).toBeLessThanOrEqual(100);
    });

    test('should properly weight enhancement factors (Req 5.1)', () => {
      const config = scoringEngine.getConfig();
      
      // Verify weights sum to 1.0
      const totalWeight = 
        config.weights.dailyBias +
        config.weights.fourHourLocation +
        config.weights.fifteenMinFlow +
        config.weights.oracleScore;
      
      expect(totalWeight).toBeCloseTo(1.0, 2);
      
      // Verify individual weights
      expect(config.weights.dailyBias).toBe(0.40);
      expect(config.weights.fourHourLocation).toBe(0.25);
      expect(config.weights.fifteenMinFlow).toBe(0.15);
      expect(config.weights.oracleScore).toBe(0.20);
    });
  });


  // ============================================================================
  // SECTION 2: Fallback Mechanisms
  // ============================================================================
  
  describe('2. Fallback Mechanisms Work Correctly', () => {
    let scoringEngine: EnhancedScoringEngine;
    let sizingEngine: ConvictionSizingEngine;
    let signalValidator: EnhancedSignalValidator;
    let enhancedEngine: EnhancedHolographicEngine;

    beforeEach(() => {
      scoringEngine = new EnhancedScoringEngine();
      sizingEngine = new ConvictionSizingEngine();
      signalValidator = new EnhancedSignalValidator();
      enhancedEngine = new EnhancedHolographicEngine({
        enabled: true,
        enableOracle: false,
        enableFlowValidator: false,
        enableBotTrapDetector: false,
        enableGlobalCVD: false,
        fallbackToClassic: true
      });
    });

    afterEach(() => {
      enhancedEngine.shutdown();
    });

    test('should fall back gracefully when Oracle data is null', () => {
      const hologram = createMockHologramState('BULL', 'DISCOUNT', 'BULL');
      
      const result = scoringEngine.calculateEnhancedScore(
        hologram, null, null, null, null
      );

      // Should use neutral Oracle contribution
      expect(result.oracleContribution).toBe(50);
      expect(result.adjustedScore).toBeGreaterThan(0);
    });

    test('should fall back gracefully when Flow Validator data is null', () => {
      const hologram = createMockHologramState('BULL', 'DISCOUNT', 'BULL');
      
      const result = scoringEngine.calculateEnhancedScore(
        hologram, null, null, null, null
      );

      expect(result.flowContribution).toBe(50);
      expect(result.adjustedScore).toBeGreaterThan(0);
    });

    test('should fall back gracefully when Global CVD data is null', () => {
      const signal = createMockTechnicalSignal('LONG', 75);
      
      const result = signalValidator.validateSignal(
        signal, null, null, null, null
      );

      // Should still validate with available layers
      expect(result.isValid).toBe(true);
      expect(result.recommendation).toBe('proceed');
    });

    test('should use neutral multipliers when enhancement data is missing', () => {
      const result = sizingEngine.calculatePositionSize(
        1000, null, null, null, null
      );

      expect(result.oracleMultiplier).toBe(1.0);
      expect(result.flowMultiplier).toBe(1.0);
      expect(result.trapReduction).toBe(1.0);
      expect(result.globalCVDMultiplier).toBe(1.0);
      expect(result.finalSize).toBe(1000);
    });

    test('should continue operation with partial enhancement data', () => {
      const hologram = createMockHologramState('BULL', 'DISCOUNT', 'BULL');
      const oracle = createMockOracleScore(60, 80);
      // Only Oracle available, others null
      
      const result = scoringEngine.calculateEnhancedScore(
        hologram, oracle, null, null, null
      );

      expect(result.adjustedScore).toBeGreaterThan(0);
      expect(result.oracleContribution).toBeGreaterThan(50);
      expect(result.flowContribution).toBe(50); // Neutral fallback
    });

    test('should handle enhanced engine initialization with fallback enabled', async () => {
      const engine = new EnhancedHolographicEngine({
        enabled: true,
        enableOracle: false,
        enableFlowValidator: false,
        enableBotTrapDetector: false,
        enableGlobalCVD: false,
        fallbackToClassic: true
      });

      const result = await engine.initialize();
      expect(result).toBe(true);
      expect(engine.isReady()).toBe(true);
      
      await engine.shutdown();
    });
  });


  // ============================================================================
  // SECTION 3: Emergency Protocols and Graceful Degradation
  // ============================================================================
  
  describe('3. Emergency Protocols and Graceful Degradation', () => {
    let emergencyManager: EmergencyProtocolManager;
    let riskManager: EnhancedRiskManager;

    beforeEach(() => {
      emergencyManager = new EmergencyProtocolManager({
        enableGracefulDegradation: false, // Disable periodic checks for tests
        enableNotifications: false
      });
      riskManager = new EnhancedRiskManager({
        monitoringEnabled: false
      });
    });

    afterEach(() => {
      emergencyManager.destroy();
      riskManager.destroy();
    });

    describe('Prediction Emergency (Req 14.1)', () => {
      test('should trigger PREDICTION_EMERGENCY for extreme event probability > 90%', () => {
        const extremeEvent = createMockPredictionEvent({
          probability: 92,
          impact: ImpactLevel.EXTREME
        });
        
        const oracleScore = createMockOracleScore(50, 80, false, [extremeEvent]);
        
        const result = emergencyManager.checkPredictionEmergency(oracleScore);

        expect(result.triggered).toBe(true);
        expect(result.type).toBe(EmergencyType.PREDICTION_EMERGENCY);
        expect(result.severity).toBe('emergency');
        expect(result.actions.some(a => a.action === 'flatten_positions')).toBe(true);
      });

      test('should not trigger for events below 90% threshold', () => {
        const normalEvent = createMockPredictionEvent({
          probability: 85,
          impact: ImpactLevel.HIGH
        });
        
        const oracleScore = createMockOracleScore(50, 80, false, [normalEvent]);
        
        const result = emergencyManager.checkPredictionEmergency(oracleScore);

        expect(result.triggered).toBe(false);
      });
    });

    describe('Liquidity Emergency (Req 14.2)', () => {
      test('should trigger LIQUIDITY_EMERGENCY when 2+ exchanges offline', () => {
        emergencyManager.updateExchangeStatus('binance', ConnectionStatus.CONNECTED);
        emergencyManager.updateExchangeStatus('coinbase', ConnectionStatus.DISCONNECTED);
        emergencyManager.updateExchangeStatus('kraken', ConnectionStatus.DISCONNECTED);

        const result = emergencyManager.checkLiquidityEmergency();

        expect(result.triggered).toBe(true);
        expect(result.type).toBe(EmergencyType.LIQUIDITY_EMERGENCY);
        expect(result.actions.some(a => a.action === 'halt_trading')).toBe(true);
      });

      test('should not trigger when sufficient exchanges online', () => {
        emergencyManager.updateExchangeStatus('binance', ConnectionStatus.CONNECTED);
        emergencyManager.updateExchangeStatus('coinbase', ConnectionStatus.CONNECTED);
        emergencyManager.updateExchangeStatus('kraken', ConnectionStatus.DISCONNECTED);

        const result = emergencyManager.checkLiquidityEmergency();

        expect(result.triggered).toBe(false);
      });
    });

    describe('Flow Emergency (Req 14.4)', () => {
      test('should trigger FLOW_EMERGENCY for extreme CVD divergence', () => {
        const globalCVD = createMockGlobalCVD('conflicted', 50, false, 85);

        const result = emergencyManager.checkFlowEmergency(globalCVD);

        expect(result.triggered).toBe(true);
        expect(result.type).toBe(EmergencyType.FLOW_EMERGENCY);
      });

      test('should not trigger for normal CVD divergence', () => {
        const globalCVD = createMockGlobalCVD('bullish', 80, false, 20);

        const result = emergencyManager.checkFlowEmergency(globalCVD);

        expect(result.triggered).toBe(false);
      });
    });

    describe('Trap Saturation Emergency (Req 14.5)', () => {
      test('should trigger TRAP_SATURATION when detection rate > 80%', () => {
        const botTrap = createMockBotTrapAnalysis(true, 85);

        const result = emergencyManager.checkTrapSaturationEmergency(botTrap, 0.85);

        expect(result.triggered).toBe(true);
        expect(result.type).toBe(EmergencyType.TRAP_SATURATION);
      });

      test('should not trigger for normal trap detection rate', () => {
        const botTrap = createMockBotTrapAnalysis(false, 30);

        const result = emergencyManager.checkTrapSaturationEmergency(botTrap, 0.30);

        expect(result.triggered).toBe(false);
      });
    });

    describe('Graceful Degradation (Req 14.6)', () => {
      test('should assess system health correctly', () => {
        const assessment = emergencyManager.assessSystemHealth();

        expect(assessment.overallHealth).toBeDefined();
        expect(assessment.components.length).toBeGreaterThan(0);
        expect(assessment.degradationLevel).toBeDefined();
      });

      test('should recommend fallback to classic when multiple systems fail', () => {
        // Simulate component failures
        emergencyManager.updateComponentHealth('oracle', 'failed', 'Connection lost');
        emergencyManager.updateComponentHealth('global_cvd', 'failed', 'Data stale');

        const assessment = emergencyManager.assessSystemHealth();

        expect(assessment.degradationLevel.level).toBe('significant');
        expect(emergencyManager.shouldFallbackToClassic()).toBe(true);
      });

      test('should track degradation level changes', () => {
        const degradationHandler = jest.fn();
        emergencyManager.on('degradation:changed', degradationHandler);

        emergencyManager.updateComponentHealth('oracle', 'failed', 'Test failure');
        emergencyManager.updateComponentHealth('global_cvd', 'failed', 'Test failure');

        expect(degradationHandler).toHaveBeenCalled();
      });
    });

    describe('Emergency Notification (Req 14.7)', () => {
      test('should log emergency events', () => {
        const extremeEvent = createMockPredictionEvent({
          probability: 95,
          impact: ImpactLevel.EXTREME
        });
        
        const oracleScore = createMockOracleScore(50, 80, false, [extremeEvent]);
        emergencyManager.checkPredictionEmergency(oracleScore);

        const log = emergencyManager.getEmergencyLog();
        expect(log.length).toBeGreaterThan(0);
      });

      test('should track active emergencies', () => {
        const extremeEvent = createMockPredictionEvent({
          probability: 95,
          impact: ImpactLevel.EXTREME
        });
        
        const oracleScore = createMockOracleScore(50, 80, false, [extremeEvent]);
        emergencyManager.checkPredictionEmergency(oracleScore);

        expect(emergencyManager.hasActiveEmergency()).toBe(true);
        expect(emergencyManager.isEmergencyActive(EmergencyType.PREDICTION_EMERGENCY)).toBe(true);
      });

      test('should clear emergencies when conditions normalize', () => {
        // First trigger emergency
        const extremeEvent = createMockPredictionEvent({
          probability: 95,
          impact: ImpactLevel.EXTREME
        });
        const oracleScore = createMockOracleScore(50, 80, false, [extremeEvent]);
        emergencyManager.checkPredictionEmergency(oracleScore);
        expect(emergencyManager.hasActiveEmergency()).toBe(true);

        // Then normalize
        const normalOracleScore = createMockOracleScore(50, 80, false, []);
        emergencyManager.checkPredictionEmergency(normalOracleScore);
        
        expect(emergencyManager.isEmergencyActive(EmergencyType.PREDICTION_EMERGENCY)).toBe(false);
      });
    });

    describe('Comprehensive Emergency Evaluation', () => {
      test('should evaluate all emergency conditions at once', () => {
        const oracleScore = createMockOracleScore(50, 80);
        const globalCVD = createMockGlobalCVD('bullish', 80);
        const botTrap = createMockBotTrapAnalysis(false, 20);

        const result = emergencyManager.evaluateAllConditions(
          oracleScore, globalCVD, botTrap, 0.2
        );

        expect(result.hasEmergency).toBe(false);
        expect(result.systemHealth).toBeDefined();
        expect(result.shouldHaltTrading).toBe(false);
        expect(result.shouldFlattenPositions).toBe(false);
      });

      test('should detect multiple simultaneous emergencies', () => {
        // Set up multiple emergency conditions
        emergencyManager.updateExchangeStatus('binance', ConnectionStatus.CONNECTED);
        emergencyManager.updateExchangeStatus('coinbase', ConnectionStatus.DISCONNECTED);
        emergencyManager.updateExchangeStatus('kraken', ConnectionStatus.DISCONNECTED);

        const extremeEvent = createMockPredictionEvent({
          probability: 95,
          impact: ImpactLevel.EXTREME
        });
        const oracleScore = createMockOracleScore(50, 80, false, [extremeEvent]);
        const globalCVD = createMockGlobalCVD('conflicted', 50, false, 85);
        const botTrap = createMockBotTrapAnalysis(true, 85);

        const result = emergencyManager.evaluateAllConditions(
          oracleScore, globalCVD, botTrap, 0.85
        );

        expect(result.hasEmergency).toBe(true);
        expect(result.emergencies.length).toBeGreaterThan(1);
        expect(result.shouldHaltTrading).toBe(true);
      });
    });
  });


  // ============================================================================
  // SECTION 4: End-to-End Integration Flow
  // ============================================================================
  
  describe('4. End-to-End Enhancement Integration Flow', () => {
    let scoringEngine: EnhancedScoringEngine;
    let sizingEngine: ConvictionSizingEngine;
    let signalValidator: EnhancedSignalValidator;
    let emergencyManager: EmergencyProtocolManager;
    let riskManager: EnhancedRiskManager;

    beforeEach(() => {
      scoringEngine = new EnhancedScoringEngine();
      sizingEngine = new ConvictionSizingEngine();
      signalValidator = new EnhancedSignalValidator();
      emergencyManager = new EmergencyProtocolManager({
        enableGracefulDegradation: false,
        enableNotifications: false
      });
      riskManager = new EnhancedRiskManager({
        monitoringEnabled: false
      });
    });

    afterEach(() => {
      emergencyManager.destroy();
      riskManager.destroy();
    });

    test('should complete full enhancement flow: Score → Validate → Size → Risk Check', () => {
      // Step 1: Create enhancement data
      const hologram = createMockHologramState('BULL', 'DISCOUNT', 'BULL');
      const oracle = createMockOracleScore(65, 80);
      const flow = createMockFlowValidation(true, 'passive_absorption', 75);
      const botTrap = createMockBotTrapAnalysis(false, 15);
      const globalCVD = createMockGlobalCVD('bullish', 80);

      // Step 2: Calculate enhanced score
      const scoring = scoringEngine.calculateEnhancedScore(
        hologram, oracle, flow, botTrap, globalCVD
      );
      expect(scoring.adjustedScore).toBeGreaterThan(0);

      // Step 3: Determine alignment
      const alignment = scoringEngine.determineAlignment(
        scoring.adjustedScore, oracle, botTrap, globalCVD, flow
      );
      expect(['A+', 'A', 'B', 'C', 'VETO']).toContain(alignment);

      // Step 4: Validate signal
      const signal = createMockTechnicalSignal('LONG', 75);
      const validation = signalValidator.validateSignal(
        signal, oracle, flow, botTrap, globalCVD
      );
      expect(validation.isValid).toBe(true);

      // Step 5: Calculate position size
      const sizing = sizingEngine.calculatePositionSize(
        1000, oracle, flow, botTrap, globalCVD
      );
      expect(sizing.finalSize).toBeGreaterThan(0);

      // Step 6: Check emergency conditions
      const emergencyResult = emergencyManager.evaluateAllConditions(
        oracle, globalCVD, botTrap, 0.15
      );
      expect(emergencyResult.hasEmergency).toBe(false);

      // Step 7: Check risk conditions
      riskManager.evaluateAllConditions(oracle, globalCVD, botTrap);
      expect(riskManager.canOpenNewPositions()).toBe(true);
    });

    test('should properly veto signals when enhancement layers conflict', () => {
      const hologram = createMockHologramState('BULL', 'DISCOUNT', 'BULL');
      const oracle = createMockOracleScore(-70, 80); // Strong bearish Oracle
      const flow = createMockFlowValidation(true, 'passive_absorption', 75); // Bullish flow
      const botTrap = createMockBotTrapAnalysis(false, 15);
      const globalCVD = createMockGlobalCVD('bullish', 80); // Bullish CVD

      // Signal is LONG but Oracle is strongly bearish
      const signal = createMockTechnicalSignal('LONG', 75);
      const validation = signalValidator.validateSignal(
        signal, oracle, flow, botTrap, globalCVD
      );

      // Should detect conflict
      expect(validation.conflictAnalysis.hasConflict).toBe(true);
    });

    test('should reduce position size when bot trap detected', () => {
      const oracle = createMockOracleScore(60, 80);
      const flow = createMockFlowValidation(true);
      const botTrapClean = createMockBotTrapAnalysis(false, 10);
      const botTrapSuspect = createMockBotTrapAnalysis(true, 75);
      const globalCVD = createMockGlobalCVD('bullish', 80);

      const cleanSize = sizingEngine.calculatePositionSize(
        1000, oracle, flow, botTrapClean, globalCVD
      );

      const suspectSize = sizingEngine.calculatePositionSize(
        1000, oracle, flow, botTrapSuspect, globalCVD
      );

      // Suspect trap should reduce position size by ~50%
      expect(suspectSize.finalSize).toBeLessThan(cleanSize.finalSize);
      expect(suspectSize.trapReduction).toBeLessThan(1.0);
    });

    test('should halt trading when emergency conditions met', () => {
      // Trigger liquidity emergency
      emergencyManager.updateExchangeStatus('binance', ConnectionStatus.CONNECTED);
      emergencyManager.updateExchangeStatus('coinbase', ConnectionStatus.DISCONNECTED);
      emergencyManager.updateExchangeStatus('kraken', ConnectionStatus.DISCONNECTED);

      const result = emergencyManager.evaluateAllConditions(
        createMockOracleScore(),
        createMockGlobalCVD(),
        createMockBotTrapAnalysis(),
        0.2
      );

      expect(result.hasEmergency).toBe(true);
      expect(result.shouldHaltTrading).toBe(true);
    });

    test('should cap position multiplier at 2.0x (Req 7.5)', () => {
      // Create very bullish conditions
      const oracle = createMockOracleScore(100, 100);
      const flow = createMockFlowValidation(true, 'passive_absorption', 100);
      const botTrap = createMockBotTrapAnalysis(false, 0);
      const globalCVD = createMockGlobalCVD('bullish', 100);

      const sizing = sizingEngine.calculatePositionSize(
        1000, oracle, flow, botTrap, globalCVD
      );

      expect(sizing.finalSize).toBeLessThanOrEqual(2000); // Max 2.0x
      expect(sizing.cappedAt).toBe(2.0);
    });

    test('should use conservative multiplier on conflicts (Req 7.6)', () => {
      const engine = new ConvictionSizingEngine({
        useConservativeSelection: true
      });

      // Conflicting signals
      const oracle = createMockOracleScore(-50, 80); // Bearish
      const flow = createMockFlowValidation(true, 'passive_absorption', 80); // Bullish
      const botTrap = createMockBotTrapAnalysis(false, 10);
      const globalCVD = createMockGlobalCVD('bullish', 80); // Bullish

      const sizing = engine.calculatePositionSize(
        1000, oracle, flow, botTrap, globalCVD
      );

      // Should use conservative (lower) multiplier
      expect(sizing.reasoning).toContain('Using conservative multiplier selection');
    });
  });


  // ============================================================================
  // SECTION 5: Component Health and Statistics
  // ============================================================================
  
  describe('5. Component Health and Statistics', () => {
    let emergencyManager: EmergencyProtocolManager;
    let riskManager: EnhancedRiskManager;

    beforeEach(() => {
      emergencyManager = new EmergencyProtocolManager({
        enableGracefulDegradation: false,
        enableNotifications: false
      });
      riskManager = new EnhancedRiskManager({
        monitoringEnabled: false
      });
    });

    afterEach(() => {
      emergencyManager.destroy();
      riskManager.destroy();
    });

    test('should track component health status', () => {
      emergencyManager.updateComponentHealth('oracle', 'healthy', 'Connected');
      emergencyManager.updateComponentHealth('global_cvd', 'degraded', 'High latency');
      emergencyManager.updateComponentHealth('bot_trap', 'failed', 'Error');

      const oracleHealth = emergencyManager.getComponentHealth('oracle');
      const cvdHealth = emergencyManager.getComponentHealth('global_cvd');
      const botTrapHealth = emergencyManager.getComponentHealth('bot_trap');

      expect(oracleHealth?.status).toBe('healthy');
      expect(cvdHealth?.status).toBe('degraded');
      expect(botTrapHealth?.status).toBe('failed');
    });

    test('should provide comprehensive statistics', () => {
      const stats = emergencyManager.getStatistics();

      expect(stats).toHaveProperty('activeEmergencyCount');
      expect(stats).toHaveProperty('totalEmergenciesTriggered');
      expect(stats).toHaveProperty('totalNotificationsSent');
      expect(stats).toHaveProperty('currentDegradationLevel');
      expect(stats).toHaveProperty('componentHealthSummary');
    });

    test('should track risk manager statistics', () => {
      // Record some signals
      for (let i = 0; i < 10; i++) {
        riskManager.recordSignal(i < 3); // 30% bot traps
      }

      const stats = riskManager.getStatistics();

      expect(stats.botTrapRate).toBe(0.3);
      expect(stats).toHaveProperty('activeConditionCount');
      expect(stats).toHaveProperty('exchangeOnlineCount');
      expect(stats).toHaveProperty('positionSizeMultiplier');
    });

    test('should reset state correctly', () => {
      // Add some state
      emergencyManager.updateComponentHealth('oracle', 'failed', 'Test');
      
      const extremeEvent = createMockPredictionEvent({
        probability: 95,
        impact: ImpactLevel.EXTREME
      });
      emergencyManager.checkPredictionEmergency(
        createMockOracleScore(50, 80, false, [extremeEvent])
      );

      // Reset
      emergencyManager.resetState();

      expect(emergencyManager.hasActiveEmergency()).toBe(false);
      expect(emergencyManager.getEmergencyLog().length).toBe(0);
    });
  });
});
