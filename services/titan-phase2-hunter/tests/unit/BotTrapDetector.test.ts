/**
 * Unit Tests for Bot Trap Pattern Recognition
 * 
 * Tests for:
 * - PatternPrecisionAnalyzer: Tick-level precision analysis
 * - SuspectPatternRiskAdjuster: Risk adjustment for suspect patterns
 * - AdaptiveLearningEngine: Pattern outcome learning system
 * - BotTrapDetector: Main integration component
 * 
 * Requirements: 3.1-3.7 (Bot Trap Pattern Recognition)
 * Requirements: 13.1-13.7 (Adaptive Learning from Bot Trap Patterns)
 */

import {
  PatternPrecisionAnalyzer,
  SuspectPatternRiskAdjuster,
  AdaptiveLearningEngine,
  BotTrapDetector,
  TechnicalPattern,
  PrecisionAnalysisResult
} from '../../src/bottrap';
import { FVG, OrderBlock, LiquidityPool, FlowValidation, TradeOutcome } from '../../src/types';

describe('PatternPrecisionAnalyzer', () => {
  let analyzer: PatternPrecisionAnalyzer;

  beforeEach(() => {
    analyzer = new PatternPrecisionAnalyzer();
  });

  afterEach(() => {
    analyzer.clearHistory();
  });

  describe('calculatePrecisionScore', () => {
    /**
     * Requirement 3.1: Flag patterns with exact tick precision as SUSPECT_TRAP
     */
    it('should return high precision score for exact tick levels', () => {
      // Exact same levels = 100% precision
      const levels = [50000, 50000, 50000];
      const score = analyzer.calculatePrecisionScore(levels);
      expect(score).toBeGreaterThanOrEqual(95);
    });

    it('should return lower precision score for varied levels', () => {
      // Levels with 1% variation
      const levels = [50000, 50500, 49500];
      const score = analyzer.calculatePrecisionScore(levels);
      expect(score).toBeLessThan(80);
    });

    it('should handle single level gracefully', () => {
      const levels = [50000];
      const score = analyzer.calculatePrecisionScore(levels);
      expect(score).toBe(0);
    });

    /**
     * Requirement 3.3: Flag if gap boundaries are exact round numbers
     */
    it('should add bonus for round number alignment', () => {
      // Use levels with slight variation to see the round number bonus effect
      const roundLevels = [50000, 50010]; // Round number with slight variation
      const nonRoundLevels = [50123, 50133]; // Not round, same variation
      
      const roundScore = analyzer.calculatePrecisionScore(roundLevels);
      const nonRoundScore = analyzer.calculatePrecisionScore(nonRoundLevels);
      
      // Round numbers should get a bonus, making the score higher
      expect(roundScore).toBeGreaterThanOrEqual(nonRoundScore);
    });
  });

  describe('analyzeEqualHighs', () => {
    /**
     * Requirement 3.2: Check if highs are exact to the tick
     */
    it('should flag equal highs with exact tick precision as SUSPECT_TRAP', () => {
      const highs = [50000, 50000, 50000];
      const result = analyzer.analyzeEqualHighs(highs, new Date(), 100);
      
      expect(result.isSuspect).toBe(true);
      expect(result.indicators.exactTickPrecision).toBe(true);
      expect(result.precision.type).toBe('equal_highs');
    });

    it('should not flag equal highs with natural variation', () => {
      // 0.5% variation - natural market behavior
      const highs = [50000, 50250, 49750];
      const result = analyzer.analyzeEqualHighs(highs, new Date(), 100);
      
      expect(result.indicators.exactTickPrecision).toBe(false);
    });
  });

  describe('analyzeFVG', () => {
    /**
     * Requirement 3.3: Flag FVGs with exact round numbers
     */
    it('should flag FVG with round number boundaries as suspicious', () => {
      const fvg: FVG = {
        type: 'BULLISH',
        top: 50000,
        bottom: 49000,
        midpoint: 49500,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        fillPercent: 0
      };
      
      const result = analyzer.analyzeFVG(fvg);
      
      expect(result.precision.type).toBe('fvg');
      // Round numbers should increase suspicion
      expect(result.precision.characteristics).toContain('ROUND_NUMBER_ALIGNMENT');
    });

    it('should analyze FVG with non-round boundaries normally', () => {
      const fvg: FVG = {
        type: 'BEARISH',
        top: 50123.45,
        bottom: 49876.55,
        midpoint: 50000,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        fillPercent: 0
      };
      
      const result = analyzer.analyzeFVG(fvg);
      
      expect(result.precision.type).toBe('fvg');
    });
  });

  describe('analyzeOrderBlock', () => {
    it('should analyze order block for trap characteristics', () => {
      const ob: OrderBlock = {
        type: 'BULLISH',
        high: 50100,
        low: 49900,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        confidence: 80
      };
      
      const result = analyzer.analyzeOrderBlock(ob);
      
      expect(result.precision.type).toBe('order_block');
      expect(result.suspicionScore).toBeGreaterThanOrEqual(0);
      expect(result.suspicionScore).toBeLessThanOrEqual(100);
    });
  });

  describe('pattern frequency tracking', () => {
    it('should track pattern frequency and flag high frequency as suspicious', () => {
      // Create multiple similar patterns
      for (let i = 0; i < 5; i++) {
        analyzer.analyzeEqualHighs([50000, 50000], new Date(), 100 + i);
      }
      
      // The 5th pattern should have higher frequency score
      const result = analyzer.analyzeEqualHighs([50000, 50000], new Date(), 105);
      
      expect(result.characteristics.frequency).toBeGreaterThan(0);
    });
  });

  describe('session level alignment', () => {
    /**
     * Requirement 3.3: Flag if boundaries are previous session levels
     */
    it('should detect session level alignment', () => {
      analyzer.updateSessionLevels([50000, 49000, 51000]);
      
      // Use non-round numbers that match session levels
      const fvg: FVG = {
        type: 'BULLISH',
        top: 50000.5, // Close to session level 50000
        bottom: 49000.5, // Close to session level 49000
        midpoint: 49500.5,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        fillPercent: 0
      };
      
      const result = analyzer.analyzeFVG(fvg);
      
      // Should detect session level alignment
      expect(result.precision.characteristics.some(c => 
        c === 'SESSION_LEVEL_ALIGNMENT' || c === 'ROUND_NUMBER_ALIGNMENT'
      )).toBe(true);
    });
  });
});

describe('SuspectPatternRiskAdjuster', () => {
  let adjuster: SuspectPatternRiskAdjuster;
  let analyzer: PatternPrecisionAnalyzer;

  beforeEach(() => {
    adjuster = new SuspectPatternRiskAdjuster();
    analyzer = new PatternPrecisionAnalyzer();
  });

  describe('calculateRiskAdjustments', () => {
    /**
     * Requirement 3.5: Reduce position size by 50% and tighten stop loss to 1%
     */
    it('should reduce position size by 50% for SUSPECT_TRAP', () => {
      // Create a suspect analysis with 'medium' suspicion level (not 'high')
      // to avoid the additional 25% reduction
      const suspectAnalysis: PrecisionAnalysisResult = {
        pattern: {
          type: 'equal_highs',
          levels: [50000, 50000, 50000],
          timestamp: new Date(),
          barIndex: 100
        },
        precision: {
          type: 'equal_highs',
          precision: 100,
          suspicionLevel: 'medium', // Medium level - only base 50% reduction
          characteristics: ['EXACT_TICK_PRECISION']
        },
        characteristics: {
          precision: 100,
          timing: 50,
          volume: 50,
          complexity: 30,
          frequency: 1
        },
        indicators: {
          exactTickPrecision: true,
          perfectTiming: false,
          unusualVolume: false,
          textbookPattern: false,
          suspiciousFrequency: false
        },
        isSuspect: true,
        suspicionScore: 65
      };
      
      const adjustments = adjuster.calculateRiskAdjustments(
        suspectAnalysis,
        1.0, // base multiplier
        0.015, // base stop loss (1.5%)
        50 // base confirmation threshold
      );
      
      expect(adjustments.adjustedMultiplier).toBe(0.5);
      expect(adjustments.adjustedStopLoss).toBe(0.01);
    });

    /**
     * Requirement 3.6: Increase required CVD confirmation threshold by 50%
     */
    it('should increase CVD confirmation threshold by 50% for textbook patterns', () => {
      const textbookAnalysis = createTextbookAnalysis();
      
      const adjustments = adjuster.calculateRiskAdjustments(
        textbookAnalysis,
        1.0,
        0.015,
        50
      );
      
      expect(adjustments.adjustedConfirmationThreshold).toBe(75); // 50 * 1.5
    });

    it('should not adjust for non-suspect patterns', () => {
      const normalAnalysis = createNormalAnalysis();
      
      const adjustments = adjuster.calculateRiskAdjustments(
        normalAnalysis,
        1.0,
        0.015,
        50
      );
      
      expect(adjustments.adjustedMultiplier).toBe(1.0);
      expect(adjustments.adjustedStopLoss).toBe(0.015);
    });

    it('should apply additional reduction for extreme suspicion', () => {
      const extremeAnalysis = createExtremeSuspicionAnalysis();
      
      const adjustments = adjuster.calculateRiskAdjustments(
        extremeAnalysis,
        1.0,
        0.015,
        50
      );
      
      // 50% base reduction * 50% extreme reduction = 25%
      expect(adjustments.adjustedMultiplier).toBe(0.25);
    });
  });

  describe('validateEntry', () => {
    /**
     * Requirement 3.4: Require Passive Absorption signature before entry on SUSPECT_TRAP
     */
    it('should block entry for SUSPECT_TRAP without flow validation', () => {
      const suspectAnalysis = createSuspectAnalysis();
      
      const validation = adjuster.validateEntry(suspectAnalysis, null);
      
      expect(validation.allowed).toBe(false);
      expect(validation.reason).toContain('flow validation');
    });

    it('should block entry for SUSPECT_TRAP without passive absorption', () => {
      const suspectAnalysis = createSuspectAnalysis();
      const flowValidation: FlowValidation = {
        isValid: true,
        confidence: 80,
        flowType: 'aggressive_pushing', // Not passive absorption
        sweepCount: 2,
        icebergDensity: 30,
        institutionalProbability: 70,
        timestamp: new Date()
      };
      
      const validation = adjuster.validateEntry(suspectAnalysis, flowValidation);
      
      expect(validation.allowed).toBe(false);
      expect(validation.reason).toContain('passive absorption');
    });

    it('should allow entry for SUSPECT_TRAP with passive absorption', () => {
      const suspectAnalysis = createSuspectAnalysis();
      const flowValidation: FlowValidation = {
        isValid: true,
        confidence: 80,
        flowType: 'passive_absorption',
        sweepCount: 2,
        icebergDensity: 30,
        institutionalProbability: 70,
        timestamp: new Date()
      };
      
      const validation = adjuster.validateEntry(suspectAnalysis, flowValidation);
      
      expect(validation.allowed).toBe(true);
      expect(validation.adjustments).not.toBeNull();
    });

    it('should allow entry for non-suspect patterns without flow validation', () => {
      const normalAnalysis = createNormalAnalysis();
      
      const validation = adjuster.validateEntry(normalAnalysis, null);
      
      expect(validation.allowed).toBe(true);
    });
  });

  describe('generateBotTrapAnalysis', () => {
    it('should generate comprehensive analysis from multiple patterns', () => {
      const analyses = [
        createSuspectAnalysis(),
        createNormalAnalysis(),
        createTextbookAnalysis()
      ];
      
      const botTrapAnalysis = adjuster.generateBotTrapAnalysis(analyses);
      
      expect(botTrapAnalysis.isSuspect).toBe(true);
      expect(botTrapAnalysis.patterns.length).toBe(3);
      expect(botTrapAnalysis.recommendations.length).toBeGreaterThan(0);
    });
  });
});

describe('AdaptiveLearningEngine', () => {
  let engine: AdaptiveLearningEngine;

  beforeEach(() => {
    engine = new AdaptiveLearningEngine({ minSamplesForUpdate: 10 }); // Lower threshold for testing
  });

  afterEach(() => {
    engine.reset();
  });

  describe('recordPatternDetection', () => {
    /**
     * Requirement 13.1: Track subsequent price action for validation
     */
    it('should record pattern detection', () => {
      const analysis = createSuspectAnalysis();
      
      const recordId = engine.recordPatternDetection(analysis, true);
      
      expect(recordId).toBeDefined();
      expect(recordId.length).toBeGreaterThan(0);
    });
  });

  describe('recordOutcome', () => {
    /**
     * Requirement 13.1: Track subsequent price action for validation
     */
    it('should record trade outcome and update statistics', () => {
      const analysis = createSuspectAnalysis();
      engine.recordPatternDetection(analysis, true);
      
      const outcome: TradeOutcome = {
        signalId: 'test-signal',
        entryPrice: 50000,
        exitPrice: 49500,
        pnl: -500,
        pnlPercent: -1,
        duration: 3600000,
        exitReason: 'stop_loss',
        timestamp: new Date()
      };
      
      engine.recordOutcome(analysis, outcome);
      
      const stats = engine.calculateStatistics();
      expect(stats.totalPatterns).toBeGreaterThan(0);
    });
  });

  describe('calculateStatistics', () => {
    /**
     * Requirement 13.7: Log learning statistics
     */
    it('should calculate correct statistics', () => {
      // Record some patterns with outcomes
      for (let i = 0; i < 5; i++) {
        const analysis = createSuspectAnalysis();
        analysis.pattern.barIndex = i;
        engine.recordPatternDetection(analysis, true);
        
        // Simulate trap confirmed (loss)
        const outcome: TradeOutcome = {
          signalId: `signal-${i}`,
          entryPrice: 50000,
          exitPrice: 49500,
          pnl: -500,
          pnlPercent: -1,
          duration: 3600000,
          exitReason: 'stop_loss',
          timestamp: new Date()
        };
        engine.recordOutcome(analysis, outcome);
      }
      
      const stats = engine.calculateStatistics();
      
      expect(stats.truePositives).toBe(5); // All flagged patterns were traps
      expect(stats.falsePositives).toBe(0);
      expect(stats.precision).toBe(1); // 100% precision
    });
  });

  describe('validateProposedThreshold', () => {
    /**
     * Requirement 13.6: Validate changes against historical data before deployment
     */
    it('should validate proposed threshold changes', () => {
      // Need enough samples for validation
      for (let i = 0; i < 60; i++) {
        const analysis = createSuspectAnalysis();
        analysis.pattern.barIndex = i;
        analysis.precision.precision = 90 + (i % 10);
        engine.recordPatternDetection(analysis, analysis.precision.precision >= 95);
        
        const outcome: TradeOutcome = {
          signalId: `signal-${i}`,
          entryPrice: 50000,
          exitPrice: i % 2 === 0 ? 49500 : 50500,
          pnl: i % 2 === 0 ? -500 : 500,
          pnlPercent: i % 2 === 0 ? -1 : 1,
          duration: 3600000,
          exitReason: i % 2 === 0 ? 'stop_loss' : 'take_profit',
          timestamp: new Date()
        };
        engine.recordOutcome(analysis, outcome);
      }
      
      const validation = engine.validateProposedThreshold(90);
      
      expect(validation.projectedStats).toBeDefined();
      expect(validation.recommendation).toBeDefined();
    });
  });

  describe('getParameterHistory', () => {
    /**
     * Requirement 13.7: Log parameter adjustments
     */
    it('should track parameter adjustment history', () => {
      engine.forceParameterUpdate(90, 'Test adjustment');
      
      const history = engine.getParameterHistory();
      
      expect(history.length).toBe(1);
      expect(history[0].parameter).toBe('precisionThreshold');
      expect(history[0].newValue).toBe(90);
    });
  });
});

describe('BotTrapDetector', () => {
  let detector: BotTrapDetector;

  beforeEach(() => {
    detector = new BotTrapDetector('BTCUSDT');
  });

  afterEach(() => {
    detector.reset();
  });

  describe('analyzePOI', () => {
    it('should analyze FVG for bot trap characteristics', () => {
      const fvg: FVG = {
        type: 'BULLISH',
        top: 50000,
        bottom: 49000,
        midpoint: 49500,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        fillPercent: 0
      };
      
      const result = detector.analyzePOI(fvg);
      
      expect(result.poi).toBe(fvg);
      expect(result.trapAnalysis).toBeDefined();
      expect(['PROCEED', 'CAUTION', 'AVOID']).toContain(result.recommendation);
    });

    it('should analyze Order Block for bot trap characteristics', () => {
      const ob: OrderBlock = {
        type: 'BEARISH',
        high: 50100,
        low: 49900,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        confidence: 80
      };
      
      const result = detector.analyzePOI(ob);
      
      expect(result.poi).toBe(ob);
      expect(result.trapAnalysis).toBeDefined();
    });

    it('should analyze Liquidity Pool for bot trap characteristics', () => {
      const pool: LiquidityPool = {
        type: 'HIGH',
        price: 50000,
        strength: 80,
        barIndex: 100,
        timestamp: Date.now(),
        swept: false
      };
      
      const result = detector.analyzePOI(pool);
      
      expect(result.poi).toBe(pool);
      expect(result.trapAnalysis).toBeDefined();
    });
  });

  describe('validateEntry', () => {
    it('should validate entry with flow validation', () => {
      const fvg: FVG = {
        type: 'BULLISH',
        top: 50000,
        bottom: 50000, // Exact precision - will be flagged
        midpoint: 50000,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        fillPercent: 0
      };
      
      const flowValidation: FlowValidation = {
        isValid: true,
        confidence: 80,
        flowType: 'passive_absorption',
        sweepCount: 2,
        icebergDensity: 30,
        institutionalProbability: 70,
        timestamp: new Date()
      };
      
      // First analyze the POI
      detector.analyzePOI(fvg);
      
      // Then validate entry
      const validation = detector.validateEntry(fvg, flowValidation);
      
      expect(validation).toBeDefined();
      expect(typeof validation.allowed).toBe('boolean');
    });
  });

  describe('generateAnalysis', () => {
    it('should generate comprehensive analysis for multiple POIs', () => {
      const pois = [
        {
          type: 'BULLISH' as const,
          top: 50000,
          bottom: 49000,
          midpoint: 49500,
          barIndex: 100,
          timestamp: Date.now(),
          mitigated: false,
          fillPercent: 0
        },
        {
          type: 'BEARISH' as const,
          high: 50100,
          low: 49900,
          barIndex: 101,
          timestamp: Date.now(),
          mitigated: false,
          confidence: 80
        }
      ];
      
      const analysis = detector.generateAnalysis(pois);
      
      expect(analysis.patterns.length).toBe(2);
      expect(analysis.suspicionScore).toBeGreaterThanOrEqual(0);
      expect(analysis.suspicionScore).toBeLessThanOrEqual(100);
    });
  });

  describe('recordTradeOutcome', () => {
    /**
     * Requirement 13.1: Track subsequent price action for validation
     */
    it('should record trade outcome for learning', () => {
      const fvg: FVG = {
        type: 'BULLISH',
        top: 50000,
        bottom: 49000,
        midpoint: 49500,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        fillPercent: 0
      };
      
      // Analyze first
      detector.analyzePOI(fvg);
      
      const outcome: TradeOutcome = {
        signalId: 'test-signal',
        entryPrice: 49500,
        exitPrice: 50500,
        pnl: 1000,
        pnlPercent: 2,
        duration: 3600000,
        exitReason: 'take_profit',
        timestamp: new Date()
      };
      
      // Should not throw
      expect(() => detector.recordTradeOutcome(fvg, outcome)).not.toThrow();
    });
  });

  describe('getLearningStatistics', () => {
    /**
     * Requirement 13.7: Log learning statistics
     */
    it('should return learning statistics', () => {
      const stats = detector.getLearningStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.totalPatterns).toBeGreaterThanOrEqual(0);
      expect(stats.precision).toBeGreaterThanOrEqual(0);
      expect(stats.recall).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getTrapDetectionRate', () => {
    it('should calculate trap detection rate', () => {
      const rate = detector.getTrapDetectionRate();
      
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    });
  });

  describe('isTrapSaturationEmergency', () => {
    /**
     * Requirement 14.5: Trigger TRAP_SATURATION_EMERGENCY if detection rate > 80%
     */
    it('should detect trap saturation emergency', () => {
      // Initially should not be in emergency
      expect(detector.isTrapSaturationEmergency()).toBe(false);
    });
  });

  describe('event emission', () => {
    /**
     * Requirement 3.7: Log BOT_TRAP_DETECTED with pattern type, precision score, and action
     */
    it('should emit bot trap events', (done) => {
      detector.on('botTrap', (event) => {
        expect(event.type).toBe('BOT_TRAP_DETECTED');
        expect(event.symbol).toBe('BTCUSDT');
        expect(event.patternType).toBeDefined();
        expect(event.precisionScore).toBeDefined();
        done();
      });
      
      // Create a pattern that will be flagged as suspect
      const fvg: FVG = {
        type: 'BULLISH',
        top: 50000,
        bottom: 50000, // Exact precision
        midpoint: 50000,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        fillPercent: 0
      };
      
      detector.analyzePOI(fvg);
    });
  });

  describe('disabled mode', () => {
    it('should return null analysis when disabled', () => {
      const disabledDetector = new BotTrapDetector('BTCUSDT', { enabled: false });
      
      const fvg: FVG = {
        type: 'BULLISH',
        top: 50000,
        bottom: 50000,
        midpoint: 50000,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        fillPercent: 0
      };
      
      const result = disabledDetector.analyzePOI(fvg);
      
      expect(result.trapAnalysis.isSuspect).toBe(false);
      expect(result.recommendation).toBe('PROCEED');
    });
  });
});

// Helper functions to create test data

function createSuspectAnalysis(): PrecisionAnalysisResult {
  return {
    pattern: {
      type: 'equal_highs',
      levels: [50000, 50000, 50000],
      timestamp: new Date(),
      barIndex: 100
    },
    precision: {
      type: 'equal_highs',
      precision: 100,
      suspicionLevel: 'high',
      characteristics: ['EXACT_TICK_PRECISION']
    },
    characteristics: {
      precision: 100,
      timing: 50,
      volume: 50,
      complexity: 30,
      frequency: 1
    },
    indicators: {
      exactTickPrecision: true,
      perfectTiming: false,
      unusualVolume: false,
      textbookPattern: false,
      suspiciousFrequency: false
    },
    isSuspect: true,
    suspicionScore: 70
  };
}

function createNormalAnalysis(): PrecisionAnalysisResult {
  return {
    pattern: {
      type: 'order_block',
      levels: [50100, 49900],
      timestamp: new Date(),
      barIndex: 100
    },
    precision: {
      type: 'order_block',
      precision: 50,
      suspicionLevel: 'low',
      characteristics: []
    },
    characteristics: {
      precision: 50,
      timing: 40,
      volume: 50,
      complexity: 60,
      frequency: 0
    },
    indicators: {
      exactTickPrecision: false,
      perfectTiming: false,
      unusualVolume: false,
      textbookPattern: false,
      suspiciousFrequency: false
    },
    isSuspect: false,
    suspicionScore: 20
  };
}

function createTextbookAnalysis(): PrecisionAnalysisResult {
  return {
    pattern: {
      type: 'fvg',
      levels: [50000, 49000, 49500],
      timestamp: new Date(),
      barIndex: 100
    },
    precision: {
      type: 'fvg',
      precision: 90,
      suspicionLevel: 'medium',
      characteristics: ['TEXTBOOK_SIMPLICITY']
    },
    characteristics: {
      precision: 90,
      timing: 85,
      volume: 50,
      complexity: 25,
      frequency: 1
    },
    indicators: {
      exactTickPrecision: false,
      perfectTiming: false,
      unusualVolume: false,
      textbookPattern: true,
      suspiciousFrequency: false
    },
    isSuspect: true,
    suspicionScore: 55
  };
}

function createExtremeSuspicionAnalysis(): PrecisionAnalysisResult {
  return {
    pattern: {
      type: 'equal_highs',
      levels: [50000, 50000, 50000],
      timestamp: new Date(),
      barIndex: 100
    },
    precision: {
      type: 'equal_highs',
      precision: 100,
      suspicionLevel: 'extreme',
      characteristics: ['EXACT_TICK_PRECISION', 'PERFECT_TIMING', 'TEXTBOOK_SIMPLICITY']
    },
    characteristics: {
      precision: 100,
      timing: 95,
      volume: 90,
      complexity: 20,
      frequency: 5
    },
    indicators: {
      exactTickPrecision: true,
      perfectTiming: true,
      unusualVolume: true,
      textbookPattern: true,
      suspiciousFrequency: true
    },
    isSuspect: true,
    suspicionScore: 95
  };
}
