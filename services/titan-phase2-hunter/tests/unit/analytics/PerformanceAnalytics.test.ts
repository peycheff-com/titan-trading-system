/**
 * Unit Tests for PerformanceAnalytics
 * 
 * Tests the enhancement effectiveness tracking functionality.
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
 */

import {
  PerformanceAnalytics,
  EnhancedTradeRecord,
  VetoedSignalRecord
} from '../../../src/analytics/PerformanceAnalytics';

describe('PerformanceAnalytics', () => {
  let analytics: PerformanceAnalytics;

  beforeEach(() => {
    analytics = new PerformanceAnalytics({
      minTradesForStats: 5,
      rollingWindowDays: 30,
      highConvictionThreshold: 1.3,
      enableDetailedLogging: false
    });
  });

  afterEach(() => {
    analytics.clearData();
  });

  // ============================================================================
  // TRADE RECORDING TESTS
  // ============================================================================

  describe('Trade Recording', () => {
    it('should record a trade correctly', () => {
      const trade = createMockTrade({ pnl: 100, pnlPercent: 2.5 });
      analytics.recordTrade(trade);
      
      expect(analytics.getTradeCount()).toBe(1);
      expect(analytics.getTradeRecords()[0]).toEqual(trade);
    });

    it('should record multiple trades', () => {
      const trades = [
        createMockTrade({ id: '1', pnl: 100 }),
        createMockTrade({ id: '2', pnl: -50 }),
        createMockTrade({ id: '3', pnl: 75 })
      ];
      
      trades.forEach(t => analytics.recordTrade(t));
      
      expect(analytics.getTradeCount()).toBe(3);
    });

    it('should record vetoed signals', () => {
      const vetoedSignal = createMockVetoedSignal({ vetoSource: 'oracle' });
      analytics.recordVetoedSignal(vetoedSignal);
      
      expect(analytics.getVetoedSignals().length).toBe(1);
    });
  });

  // ============================================================================
  // ORACLE EFFECTIVENESS TESTS (Requirement 15.1)
  // ============================================================================

  describe('Oracle Effectiveness', () => {
    it('should calculate aligned win rate correctly', () => {
      // Add aligned winning trades
      for (let i = 0; i < 4; i++) {
        analytics.recordTrade(createMockTrade({
          id: `aligned-win-${i}`,
          pnl: 100,
          oracleAligned: true,
          oracleScore: { sentiment: 50, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.5, timestamp: new Date() }
        }));
      }
      
      // Add aligned losing trade
      analytics.recordTrade(createMockTrade({
        id: 'aligned-loss',
        pnl: -50,
        oracleAligned: true,
        oracleScore: { sentiment: 50, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.5, timestamp: new Date() }
      }));

      const metrics = analytics.calculateOracleEffectiveness();
      
      expect(metrics.alignedSignals).toBe(5);
      expect(metrics.alignedWinRate).toBe(80); // 4/5 = 80%
    });

    it('should calculate win rate improvement', () => {
      // Aligned trades: 3 wins, 1 loss = 75% win rate
      for (let i = 0; i < 3; i++) {
        analytics.recordTrade(createMockTrade({
          id: `aligned-win-${i}`,
          pnl: 100,
          oracleAligned: true,
          oracleScore: { sentiment: 50, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.5, timestamp: new Date() }
        }));
      }
      analytics.recordTrade(createMockTrade({
        id: 'aligned-loss',
        pnl: -50,
        oracleAligned: true,
        oracleScore: { sentiment: 50, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.5, timestamp: new Date() }
      }));

      // Conflicting trades: 1 win, 3 losses = 25% win rate
      analytics.recordTrade(createMockTrade({
        id: 'conflict-win',
        pnl: 100,
        oracleAligned: false,
        oracleScore: { sentiment: -50, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 0.8, timestamp: new Date() }
      }));
      for (let i = 0; i < 3; i++) {
        analytics.recordTrade(createMockTrade({
          id: `conflict-loss-${i}`,
          pnl: -50,
          oracleAligned: false,
          oracleScore: { sentiment: -50, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 0.8, timestamp: new Date() }
        }));
      }

      const metrics = analytics.calculateOracleEffectiveness();
      
      expect(metrics.alignedWinRate).toBe(75);
      expect(metrics.conflictingWinRate).toBe(25);
      expect(metrics.winRateImprovement).toBe(50); // 75 - 25 = 50%
    });

    it('should calculate veto effectiveness', () => {
      // Add vetoed signals that would have lost
      for (let i = 0; i < 3; i++) {
        analytics.recordVetoedSignal(createMockVetoedSignal({
          id: `veto-loss-${i}`,
          vetoSource: 'oracle',
          wouldHaveWon: false,
          potentialPnlPercent: -2.5
        }));
      }
      
      // Add vetoed signal that would have won
      analytics.recordVetoedSignal(createMockVetoedSignal({
        id: 'veto-win',
        vetoSource: 'oracle',
        wouldHaveWon: true,
        potentialPnlPercent: 3.0
      }));

      // Add some trades to meet minimum
      for (let i = 0; i < 5; i++) {
        analytics.recordTrade(createMockTrade({ id: `trade-${i}` }));
      }

      const metrics = analytics.calculateOracleEffectiveness();
      
      expect(metrics.vetoedSignals).toBe(4);
      expect(metrics.vetoedWouldHaveLost).toBe(3);
      expect(metrics.vetoEffectiveness).toBe(75); // 3/4 = 75%
    });
  });

  // ============================================================================
  // GLOBAL CVD EFFECTIVENESS TESTS (Requirement 15.2)
  // ============================================================================

  describe('Global CVD Effectiveness', () => {
    it('should calculate confirmed win rate', () => {
      // Confirmed winning trades
      for (let i = 0; i < 4; i++) {
        analytics.recordTrade(createMockTrade({
          id: `confirmed-win-${i}`,
          pnl: 100,
          globalCVDConfirmed: true
        }));
      }
      
      // Confirmed losing trade
      analytics.recordTrade(createMockTrade({
        id: 'confirmed-loss',
        pnl: -50,
        globalCVDConfirmed: true
      }));

      const metrics = analytics.calculateGlobalCVDEffectiveness();
      
      expect(metrics.confirmedSignals).toBe(5);
      expect(metrics.confirmedWinRate).toBe(80); // 4/5 = 80%
    });

    it('should calculate false signal reduction rate', () => {
      // Rejected signals that would have lost
      for (let i = 0; i < 3; i++) {
        analytics.recordVetoedSignal(createMockVetoedSignal({
          id: `rejected-loss-${i}`,
          vetoSource: 'globalCVD',
          wouldHaveWon: false
        }));
      }
      
      // Rejected signal that would have won
      analytics.recordVetoedSignal(createMockVetoedSignal({
        id: 'rejected-win',
        vetoSource: 'globalCVD',
        wouldHaveWon: true
      }));

      // Add trades to meet minimum
      for (let i = 0; i < 5; i++) {
        analytics.recordTrade(createMockTrade({ id: `trade-${i}` }));
      }

      const metrics = analytics.calculateGlobalCVDEffectiveness();
      
      expect(metrics.rejectedSignals).toBe(4);
      expect(metrics.falseSignalsAvoided).toBe(3);
      expect(metrics.falseSignalReductionRate).toBe(75); // 3/4 = 75%
    });
  });

  // ============================================================================
  // BOT TRAP EFFECTIVENESS TESTS (Requirement 15.3)
  // ============================================================================

  describe('Bot Trap Effectiveness', () => {
    it('should calculate detection accuracy', () => {
      // True positives: flagged and would have lost (vetoed)
      for (let i = 0; i < 2; i++) {
        analytics.recordVetoedSignal(createMockVetoedSignal({
          id: `tp-${i}`,
          vetoSource: 'botTrap',
          wouldHaveWon: false
        }));
      }
      
      // False positives: flagged but would have won (vetoed)
      analytics.recordVetoedSignal(createMockVetoedSignal({
        id: 'fp',
        vetoSource: 'botTrap',
        wouldHaveWon: true
      }));

      // True negatives: not flagged and won
      for (let i = 0; i < 3; i++) {
        analytics.recordTrade(createMockTrade({
          id: `tn-${i}`,
          pnl: 100,
          botTrapFlagged: false
        }));
      }
      
      // False negatives: not flagged but lost
      for (let i = 0; i < 2; i++) {
        analytics.recordTrade(createMockTrade({
          id: `fn-${i}`,
          pnl: -50,
          botTrapFlagged: false
        }));
      }

      const metrics = analytics.calculateBotTrapEffectiveness();
      
      expect(metrics.truePositives).toBe(2);
      expect(metrics.falsePositives).toBe(1);
      expect(metrics.trueNegatives).toBe(3);
      expect(metrics.falseNegatives).toBe(2);
      
      // Accuracy = (TP + TN) / Total = (2 + 3) / 8 = 62.5%
      expect(metrics.detectionAccuracy).toBeCloseTo(62.5, 1);
    });

    it('should calculate avoided losses', () => {
      // Avoided losses (true positives)
      analytics.recordVetoedSignal(createMockVetoedSignal({
        id: 'avoided-1',
        vetoSource: 'botTrap',
        wouldHaveWon: false,
        potentialPnlPercent: -3.0
      }));
      analytics.recordVetoedSignal(createMockVetoedSignal({
        id: 'avoided-2',
        vetoSource: 'botTrap',
        wouldHaveWon: false,
        potentialPnlPercent: -2.0
      }));

      // Add trades to meet minimum
      for (let i = 0; i < 5; i++) {
        analytics.recordTrade(createMockTrade({ id: `trade-${i}`, botTrapFlagged: false }));
      }

      const metrics = analytics.calculateBotTrapEffectiveness();
      
      expect(metrics.avoidedLosses).toBe(2);
      expect(metrics.avoidedLossAmount).toBe(5.0); // 3.0 + 2.0
      expect(metrics.avgAvoidedLossPercent).toBe(2.5); // 5.0 / 2
    });
  });

  // ============================================================================
  // PREDICTION ACCURACY TESTS (Requirements 15.4, 15.5)
  // ============================================================================

  describe('Prediction Accuracy', () => {
    it('should calculate sentiment accuracy', () => {
      // Bullish predictions that were correct (LONG and won)
      for (let i = 0; i < 3; i++) {
        analytics.recordTrade(createMockTrade({
          id: `bullish-correct-${i}`,
          direction: 'LONG',
          pnl: 100,
          oracleScore: { sentiment: 60, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.5, timestamp: new Date() }
        }));
      }
      
      // Bullish prediction that was wrong (LONG and lost)
      analytics.recordTrade(createMockTrade({
        id: 'bullish-wrong',
        direction: 'LONG',
        pnl: -50,
        oracleScore: { sentiment: 60, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.5, timestamp: new Date() }
      }));

      // Bearish prediction that was correct (SHORT and won)
      analytics.recordTrade(createMockTrade({
        id: 'bearish-correct',
        direction: 'SHORT',
        pnl: 100,
        oracleScore: { sentiment: -60, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.5, timestamp: new Date() }
      }));

      const metrics = analytics.calculatePredictionAccuracy();
      
      expect(metrics.bullishPredictions).toBe(4);
      expect(metrics.bullishCorrect).toBe(3);
      expect(metrics.bearishPredictions).toBe(1);
      expect(metrics.bearishCorrect).toBe(1);
      expect(metrics.sentimentAccuracy).toBe(80); // 4/5 = 80%
    });

    it('should calculate conviction multiplier performance', () => {
      // High conviction trades (multiplier >= 1.3)
      analytics.recordTrade(createMockTrade({
        id: 'high-conv-win-1',
        pnl: 100,
        convictionMultiplier: 1.5,
        oracleScore: { sentiment: 60, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.5, timestamp: new Date() }
      }));
      analytics.recordTrade(createMockTrade({
        id: 'high-conv-win-2',
        pnl: 100,
        convictionMultiplier: 1.4,
        oracleScore: { sentiment: 60, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.4, timestamp: new Date() }
      }));
      analytics.recordTrade(createMockTrade({
        id: 'high-conv-loss',
        pnl: -50,
        convictionMultiplier: 1.5,
        oracleScore: { sentiment: 60, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.5, timestamp: new Date() }
      }));

      // Low conviction trades (multiplier < 1.3)
      analytics.recordTrade(createMockTrade({
        id: 'low-conv-win',
        pnl: 100,
        convictionMultiplier: 1.0,
        oracleScore: { sentiment: 30, confidence: 50, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.0, timestamp: new Date() }
      }));
      analytics.recordTrade(createMockTrade({
        id: 'low-conv-loss',
        pnl: -50,
        convictionMultiplier: 1.0,
        oracleScore: { sentiment: 30, confidence: 50, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.0, timestamp: new Date() }
      }));

      const metrics = analytics.calculatePredictionAccuracy();
      
      expect(metrics.highConvictionTrades).toBe(3);
      expect(metrics.highConvictionWinRate).toBeCloseTo(66.67, 1); // 2/3
      expect(metrics.lowConvictionTrades).toBe(2);
      expect(metrics.lowConvictionWinRate).toBe(50); // 1/2
    });
  });

  // ============================================================================
  // DATA EXPORT/IMPORT TESTS
  // ============================================================================

  describe('Data Export/Import', () => {
    it('should export and import data correctly', () => {
      // Add some data
      analytics.recordTrade(createMockTrade({ id: 'trade-1', pnl: 100 }));
      analytics.recordTrade(createMockTrade({ id: 'trade-2', pnl: -50 }));
      analytics.recordVetoedSignal(createMockVetoedSignal({ id: 'veto-1' }));

      // Export
      const exported = analytics.exportData();
      
      expect(exported.trades.length).toBe(2);
      expect(exported.vetoed.length).toBe(1);

      // Clear and import
      analytics.clearData();
      expect(analytics.getTradeCount()).toBe(0);
      
      analytics.importData(exported);
      expect(analytics.getTradeCount()).toBe(2);
      expect(analytics.getVetoedSignals().length).toBe(1);
    });
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createMockTrade(overrides: Partial<EnhancedTradeRecord> = {}): EnhancedTradeRecord {
  return {
    id: overrides.id || `trade-${Date.now()}`,
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entryPrice: 50000,
    exitPrice: 51000,
    pnl: 100,
    pnlPercent: 2.0,
    duration: 3600000,
    exitReason: 'take_profit',
    timestamp: new Date(),
    oracleScore: null,
    oracleAligned: false,
    globalCVDConfirmed: false,
    globalCVDConsensus: null,
    botTrapFlagged: false,
    botTrapSuspicionScore: 0,
    convictionMultiplier: 1.0,
    usedEnhancements: true,
    classicSignalConfidence: 70,
    enhancedSignalConfidence: 85,
    ...overrides
  };
}

function createMockVetoedSignal(overrides: Partial<VetoedSignalRecord> = {}): VetoedSignalRecord {
  return {
    id: overrides.id || `veto-${Date.now()}`,
    symbol: 'BTCUSDT',
    direction: 'LONG',
    vetoReason: 'Oracle conflict',
    vetoSource: 'oracle',
    timestamp: new Date(),
    wouldHaveEnteredAt: 50000,
    actualPriceAfter: 49000,
    wouldHaveWon: false,
    potentialPnlPercent: -2.0,
    ...overrides
  };
}
