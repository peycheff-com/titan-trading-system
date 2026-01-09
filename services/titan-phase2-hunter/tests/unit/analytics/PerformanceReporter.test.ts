/**
 * Unit Tests for PerformanceReporter
 * 
 * Tests the comprehensive performance reporting functionality.
 * Requirements: 15.4, 15.5, 15.6, 15.7
 */

import {
  PerformanceAnalytics,
  EnhancedTradeRecord,
  VetoedSignalRecord
} from '../../../src/analytics/PerformanceAnalytics';
import {
  PerformanceReporter,
  LayerContribution,
  ComparativeAnalysis
} from '../../../src/analytics/PerformanceReporter';

describe('PerformanceReporter', () => {
  let analytics: PerformanceAnalytics;
  let reporter: PerformanceReporter;

  beforeEach(() => {
    analytics = new PerformanceAnalytics({
      minTradesForStats: 5,
      rollingWindowDays: 30,
      highConvictionThreshold: 1.3,
      enableDetailedLogging: false
    });
    
    reporter = new PerformanceReporter(analytics, {
      minTradesForReport: 5,
      targetWinRate: 55,
      targetSharpeRatio: 1.5,
      enableAutoSuggestions: true
    });
  });

  afterEach(() => {
    analytics.clearData();
  });

  // ============================================================================
  // REPORT GENERATION TESTS (Requirement 15.6)
  // ============================================================================

  describe('Report Generation', () => {
    it('should generate a report with correct trade counts', () => {
      // Add enhanced trades
      for (let i = 0; i < 3; i++) {
        analytics.recordTrade(createMockTrade({
          id: `enhanced-${i}`,
          usedEnhancements: true,
          pnl: 100
        }));
      }
      
      // Add classic trades
      for (let i = 0; i < 2; i++) {
        analytics.recordTrade(createMockTrade({
          id: `classic-${i}`,
          usedEnhancements: false,
          pnl: 50
        }));
      }

      const report = reporter.generateReport();
      
      expect(report.totalTrades).toBe(5);
      expect(report.enhancedTrades).toBe(3);
      expect(report.classicTrades).toBe(2);
    });

    it('should calculate win rates correctly', () => {
      // Enhanced: 3 wins, 1 loss = 75%
      for (let i = 0; i < 3; i++) {
        analytics.recordTrade(createMockTrade({
          id: `enhanced-win-${i}`,
          usedEnhancements: true,
          pnl: 100
        }));
      }
      analytics.recordTrade(createMockTrade({
        id: 'enhanced-loss',
        usedEnhancements: true,
        pnl: -50
      }));
      
      // Classic: 1 win, 1 loss = 50%
      analytics.recordTrade(createMockTrade({
        id: 'classic-win',
        usedEnhancements: false,
        pnl: 100
      }));
      analytics.recordTrade(createMockTrade({
        id: 'classic-loss',
        usedEnhancements: false,
        pnl: -50
      }));

      const report = reporter.generateReport();
      
      expect(report.enhancedWinRate).toBe(75);
      expect(report.classicWinRate).toBe(50);
      expect(report.overallWinRate).toBeCloseTo(66.67, 1);
    });

    it('should calculate total returns correctly', () => {
      analytics.recordTrade(createMockTrade({
        id: 'trade-1',
        pnlPercent: 2.5,
        usedEnhancements: true
      }));
      analytics.recordTrade(createMockTrade({
        id: 'trade-2',
        pnlPercent: -1.0,
        usedEnhancements: true
      }));
      analytics.recordTrade(createMockTrade({
        id: 'trade-3',
        pnlPercent: 1.5,
        usedEnhancements: false
      }));
      analytics.recordTrade(createMockTrade({
        id: 'trade-4',
        pnlPercent: 0.5,
        usedEnhancements: false
      }));
      analytics.recordTrade(createMockTrade({
        id: 'trade-5',
        pnlPercent: 1.0,
        usedEnhancements: true
      }));

      const report = reporter.generateReport();
      
      expect(report.totalReturn).toBe(4.5); // 2.5 - 1.0 + 1.5 + 0.5 + 1.0
      expect(report.enhancedReturn).toBe(2.5); // 2.5 - 1.0 + 1.0
      expect(report.classicReturn).toBe(2.0); // 1.5 + 0.5
    });

    it('should include enhancement metrics in report', () => {
      // Add trades with Oracle data
      for (let i = 0; i < 5; i++) {
        analytics.recordTrade(createMockTrade({
          id: `trade-${i}`,
          oracleAligned: true,
          oracleScore: { sentiment: 50, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.5, timestamp: new Date() },
          globalCVDConfirmed: true,
          usedEnhancements: true
        }));
      }

      const report = reporter.generateReport();
      
      expect(report.oracleMetrics).toBeDefined();
      expect(report.globalCVDMetrics).toBeDefined();
      expect(report.botTrapMetrics).toBeDefined();
      expect(report.predictionMetrics).toBeDefined();
    });
  });

  // ============================================================================
  // OPTIMIZATION SUGGESTIONS TESTS (Requirement 15.7)
  // ============================================================================

  describe('Optimization Suggestions', () => {
    it('should suggest Oracle veto threshold adjustment when effectiveness is low', () => {
      // Add vetoed signals with low effectiveness
      for (let i = 0; i < 3; i++) {
        analytics.recordVetoedSignal(createMockVetoedSignal({
          id: `veto-${i}`,
          vetoSource: 'oracle',
          wouldHaveWon: true // Would have won = bad veto
        }));
      }
      analytics.recordVetoedSignal(createMockVetoedSignal({
        id: 'veto-good',
        vetoSource: 'oracle',
        wouldHaveWon: false
      }));

      // Add trades to meet minimum
      for (let i = 0; i < 10; i++) {
        analytics.recordTrade(createMockTrade({
          id: `trade-${i}`,
          oracleScore: { sentiment: 50, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.0, timestamp: new Date() }
        }));
      }

      const report = reporter.generateReport();
      
      const oracleSuggestion = report.suggestions.find(s => 
        s.layer === 'oracle' && s.suggestion.includes('veto threshold')
      );
      expect(oracleSuggestion).toBeDefined();
      expect(oracleSuggestion?.priority).toBe('high');
    });

    it('should suggest Bot Trap precision adjustment when false positive rate is high', () => {
      // Add vetoed signals with high false positive rate
      for (let i = 0; i < 4; i++) {
        analytics.recordVetoedSignal(createMockVetoedSignal({
          id: `fp-${i}`,
          vetoSource: 'botTrap',
          wouldHaveWon: true // False positive
        }));
      }
      analytics.recordVetoedSignal(createMockVetoedSignal({
        id: 'tp',
        vetoSource: 'botTrap',
        wouldHaveWon: false // True positive
      }));

      // Add trades to meet minimum
      for (let i = 0; i < 10; i++) {
        analytics.recordTrade(createMockTrade({
          id: `trade-${i}`,
          botTrapFlagged: false
        }));
      }

      const report = reporter.generateReport();
      
      const botTrapSuggestion = report.suggestions.find(s => 
        s.layer === 'botTrap' && s.suggestion.includes('false positive')
      );
      expect(botTrapSuggestion).toBeDefined();
      expect(botTrapSuggestion?.priority).toBe('high');
    });

    it('should suggest win rate improvement when below target', () => {
      // Add trades with low win rate (40%)
      for (let i = 0; i < 4; i++) {
        analytics.recordTrade(createMockTrade({
          id: `loss-${i}`,
          pnl: -50
        }));
      }
      for (let i = 0; i < 3; i++) {
        analytics.recordTrade(createMockTrade({
          id: `win-${i}`,
          pnl: 100
        }));
      }

      const report = reporter.generateReport();
      
      const generalSuggestion = report.suggestions.find(s => 
        s.layer === 'general' && s.suggestion.includes('Win rate below target')
      );
      expect(generalSuggestion).toBeDefined();
    });

    it('should sort suggestions by priority and expected improvement', () => {
      // Create conditions for multiple suggestions
      for (let i = 0; i < 10; i++) {
        analytics.recordTrade(createMockTrade({
          id: `trade-${i}`,
          pnl: i < 4 ? -50 : 100, // 40% win rate
          oracleScore: { sentiment: 50, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.0, timestamp: new Date() }
        }));
      }

      const report = reporter.generateReport();
      
      // Verify suggestions are sorted (high priority first)
      if (report.suggestions.length >= 2) {
        const priorities = report.suggestions.map(s => s.priority);
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        
        for (let i = 1; i < priorities.length; i++) {
          expect(priorityOrder[priorities[i]]).toBeGreaterThanOrEqual(
            priorityOrder[priorities[i - 1]]
          );
        }
      }
    });
  });

  // ============================================================================
  // COMPARATIVE ANALYSIS TESTS
  // ============================================================================

  describe('Comparative Analysis', () => {
    it('should calculate win rate difference correctly', () => {
      // Enhanced: 4 wins, 1 loss = 80%
      for (let i = 0; i < 4; i++) {
        analytics.recordTrade(createMockTrade({
          id: `enhanced-win-${i}`,
          usedEnhancements: true,
          pnl: 100
        }));
      }
      analytics.recordTrade(createMockTrade({
        id: 'enhanced-loss',
        usedEnhancements: true,
        pnl: -50
      }));
      
      // Classic: 2 wins, 3 losses = 40%
      for (let i = 0; i < 2; i++) {
        analytics.recordTrade(createMockTrade({
          id: `classic-win-${i}`,
          usedEnhancements: false,
          pnl: 100
        }));
      }
      for (let i = 0; i < 3; i++) {
        analytics.recordTrade(createMockTrade({
          id: `classic-loss-${i}`,
          usedEnhancements: false,
          pnl: -50
        }));
      }

      const analysis = reporter.generateComparativeAnalysis();
      
      expect(analysis.enhancedWinRate).toBe(80);
      expect(analysis.classicWinRate).toBe(40);
      expect(analysis.winRateDifference).toBe(40);
    });

    it('should calculate return difference correctly', () => {
      // Enhanced trades with positive returns
      analytics.recordTrade(createMockTrade({
        id: 'enhanced-1',
        usedEnhancements: true,
        pnlPercent: 3.0
      }));
      analytics.recordTrade(createMockTrade({
        id: 'enhanced-2',
        usedEnhancements: true,
        pnlPercent: 2.0
      }));
      
      // Classic trades with lower returns
      analytics.recordTrade(createMockTrade({
        id: 'classic-1',
        usedEnhancements: false,
        pnlPercent: 1.0
      }));
      analytics.recordTrade(createMockTrade({
        id: 'classic-2',
        usedEnhancements: false,
        pnlPercent: 0.5
      }));
      analytics.recordTrade(createMockTrade({
        id: 'classic-3',
        usedEnhancements: false,
        pnlPercent: -0.5
      }));

      const analysis = reporter.generateComparativeAnalysis();
      
      expect(analysis.enhancedReturn).toBe(5.0); // 3.0 + 2.0
      expect(analysis.classicReturn).toBe(1.0); // 1.0 + 0.5 - 0.5
      expect(analysis.returnDifference).toBe(4.0);
    });
  });

  // ============================================================================
  // LAYER CONTRIBUTION ANALYSIS TESTS
  // ============================================================================

  describe('Layer Contribution Analysis', () => {
    it('should analyze all three enhancement layers', () => {
      // Add trades with enhancement data
      for (let i = 0; i < 5; i++) {
        analytics.recordTrade(createMockTrade({
          id: `trade-${i}`,
          usedEnhancements: true,
          oracleAligned: true,
          oracleScore: { sentiment: 50, confidence: 80, events: [], veto: false, vetoReason: null, convictionMultiplier: 1.5, timestamp: new Date() },
          globalCVDConfirmed: true,
          botTrapFlagged: false
        }));
      }

      const contributions = reporter.analyzeLayerContributions();
      
      expect(contributions.length).toBe(3);
      expect(contributions.map(c => c.layer)).toContain('Oracle');
      expect(contributions.map(c => c.layer)).toContain('Global CVD');
      expect(contributions.map(c => c.layer)).toContain('Bot Trap');
    });

    it('should calculate layer scores', () => {
      for (let i = 0; i < 5; i++) {
        analytics.recordTrade(createMockTrade({
          id: `trade-${i}`,
          usedEnhancements: true
        }));
      }

      const contributions = reporter.analyzeLayerContributions();
      
      contributions.forEach(contribution => {
        expect(contribution.overallScore).toBeDefined();
        expect(typeof contribution.overallScore).toBe('number');
      });
    });
  });

  // ============================================================================
  // REPORT FORMATTING TESTS
  // ============================================================================

  describe('Report Formatting', () => {
    it('should format report as string', () => {
      for (let i = 0; i < 5; i++) {
        analytics.recordTrade(createMockTrade({ id: `trade-${i}` }));
      }

      const report = reporter.generateReport();
      const formatted = reporter.formatReportAsString(report);
      
      expect(formatted).toContain('TITAN PHASE 2');
      expect(formatted).toContain('OVERALL PERFORMANCE');
      expect(formatted).toContain('ORACLE EFFECTIVENESS');
      expect(formatted).toContain('GLOBAL CVD EFFECTIVENESS');
      expect(formatted).toContain('BOT TRAP EFFECTIVENESS');
    });

    it('should format report as JSON', () => {
      for (let i = 0; i < 5; i++) {
        analytics.recordTrade(createMockTrade({ id: `trade-${i}` }));
      }

      const report = reporter.generateReport();
      const json = reporter.formatReportAsJSON(report);
      
      const parsed = JSON.parse(json);
      expect(parsed.totalTrades).toBe(5);
      expect(parsed.oracleMetrics).toBeDefined();
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
