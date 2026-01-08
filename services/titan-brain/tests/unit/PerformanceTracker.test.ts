/**
 * Unit Tests for PerformanceTracker
 * 
 * Tests specific examples, edge cases, and error conditions
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.8**
 */

import { PerformanceTracker } from '../../src/engine/PerformanceTracker';
import { PerformanceTrackerConfig, PhaseId } from '../../src/types/index';
import { DatabaseManager } from '../../src/db/DatabaseManager';

// Mock DatabaseManager
const mockDb = {
  query: jest.fn(),
} as unknown as DatabaseManager;

// Test configuration
const testConfig: PerformanceTrackerConfig = {
  windowDays: 7,
  minTradeCount: 10,
  malusThreshold: 0,
  bonusThreshold: 2.0,
  malusMultiplier: 0.5,
  bonusMultiplier: 1.2
};

describe('PerformanceTracker Unit Tests', () => {
  let tracker: PerformanceTracker;

  beforeEach(() => {
    tracker = new PerformanceTracker(testConfig, mockDb);
    jest.clearAllMocks();
  });

  describe('Sharpe Ratio Calculation', () => {
    /**
     * **Validates: Requirements 2.2**
     * Test Sharpe ratio calculation with known data
     */
    it('should calculate Sharpe ratio correctly with known data', () => {
      // Test case 1: Simple positive returns
      const positiveReturns = [100, 150, 120, 180, 110];
      const sharpe1 = tracker.calculateSharpeRatio(positiveReturns);
      
      // Should be positive since all returns are positive
      expect(sharpe1).toBeGreaterThan(0);
      expect(isFinite(sharpe1)).toBe(true);

      // Test case 2: Mixed returns with known calculation
      const mixedReturns = [100, -50, 200, -25, 75];
      const sharpe2 = tracker.calculateSharpeRatio(mixedReturns);
      
      // Manual calculation for verification
      const mean = (100 - 50 + 200 - 25 + 75) / 5; // 60
      const variance = (
        Math.pow(100 - 60, 2) + 
        Math.pow(-50 - 60, 2) + 
        Math.pow(200 - 60, 2) + 
        Math.pow(-25 - 60, 2) + 
        Math.pow(75 - 60, 2)
      ) / 4; // Sample variance (n-1)
      const stdDev = Math.sqrt(variance);
      const expectedSharpe = (mean / stdDev) * Math.sqrt(365);
      
      expect(sharpe2).toBeCloseTo(expectedSharpe, 2);

      // Test case 3: All negative returns
      const negativeReturns = [-100, -150, -120, -180, -110];
      const sharpe3 = tracker.calculateSharpeRatio(negativeReturns);
      
      // Should be negative since all returns are negative
      expect(sharpe3).toBeLessThan(0);
    });

    it('should return 0 for insufficient data', () => {
      expect(tracker.calculateSharpeRatio([])).toBe(0);
      expect(tracker.calculateSharpeRatio([100])).toBe(0);
    });

    it('should handle zero standard deviation correctly', () => {
      // All same positive values
      expect(tracker.calculateSharpeRatio([100, 100, 100])).toBe(3.0);
      
      // All same negative values
      expect(tracker.calculateSharpeRatio([-100, -100, -100])).toBe(-3.0);
      
      // All zeros
      expect(tracker.calculateSharpeRatio([0, 0, 0])).toBe(0);
    });
  });

  describe('Performance Modifier Logic', () => {
    /**
     * **Validates: Requirements 2.3**
     * Test malus penalty application (Sharpe < 0)
     */
    it('should apply malus penalty for negative Sharpe ratios', () => {
      const testCases = [-3.0, -1.5, -0.5, -0.001];
      
      testCases.forEach(sharpe => {
        const modifier = tracker.calculateModifier(sharpe);
        expect(modifier).toBe(testConfig.malusMultiplier);
      });
    });

    /**
     * **Validates: Requirements 2.4**
     * Test bonus multiplier application (Sharpe > 2.0)
     */
    it('should apply bonus multiplier for high Sharpe ratios', () => {
      const testCases = [2.001, 2.5, 3.0, 5.0];
      
      testCases.forEach(sharpe => {
        const modifier = tracker.calculateModifier(sharpe);
        expect(modifier).toBe(testConfig.bonusMultiplier);
      });
    });

    it('should return 1.0 for normal Sharpe ratios', () => {
      const testCases = [0, 0.5, 1.0, 1.5, 2.0];
      
      testCases.forEach(sharpe => {
        const modifier = tracker.calculateModifier(sharpe);
        expect(modifier).toBe(1.0);
      });
    });

    /**
     * **Validates: Requirements 2.8**
     * Test insufficient trade history handling
     */
    it('should use base weight for insufficient trade history', async () => {
      const phaseId: PhaseId = 'phase1';
      
      // Mock insufficient trade count
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ count: '5' }] // Less than minTradeCount (10)
      });
      
      const modifier = await tracker.getPerformanceModifier(phaseId);
      
      expect(modifier).toBe(1.0);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*)'),
        expect.arrayContaining([phaseId])
      );
    });

    it('should calculate modifier when sufficient trade history exists', async () => {
      const phaseId: PhaseId = 'phase2';
      
      // Mock sufficient trade count
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{ count: '15' }] // More than minTradeCount (10)
        })
        .mockResolvedValueOnce({
          rows: [
            { pnl: '100' },
            { pnl: '150' },
            { pnl: '-50' },
            { pnl: '200' },
            { pnl: '75' }
          ]
        });
      
      const modifier = await tracker.getPerformanceModifier(phaseId);
      
      expect(modifier).toBeGreaterThan(0);
      expect(modifier).toBeLessThanOrEqual(testConfig.bonusMultiplier);
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('Database Integration', () => {
    it('should record trade with all parameters', async () => {
      const phaseId: PhaseId = 'phase1';
      const pnl = 150.75;
      const timestamp = Date.now();
      const symbol = 'BTCUSDT';
      const side = 'BUY';
      
      await tracker.recordTrade(phaseId, pnl, timestamp, symbol, side);
      
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO phase_trades'),
        [phaseId, timestamp, pnl, symbol, side]
      );
    });

    it('should record trade with minimal parameters', async () => {
      const phaseId: PhaseId = 'phase2';
      const pnl = -75.25;
      const timestamp = Date.now();
      
      await tracker.recordTrade(phaseId, pnl, timestamp);
      
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO phase_trades'),
        [phaseId, timestamp, pnl, null, null]
      );
    });

    it('should throw error when database not configured', async () => {
      const trackerWithoutDb = new PerformanceTracker(testConfig);
      
      await expect(
        trackerWithoutDb.recordTrade('phase1', 100, Date.now())
      ).rejects.toThrow('Database not configured');
    });

    it('should get trades in window correctly', async () => {
      const phaseId: PhaseId = 'phase3';
      const windowDays = 7;
      
      const mockTrades = [
        {
          id: 1,
          phase_id: 'phase3',
          pnl: '100.50',
          timestamp: '1640995200000',
          symbol: 'BTCUSDT',
          side: 'BUY'
        },
        {
          id: 2,
          phase_id: 'phase3',
          pnl: '-75.25',
          timestamp: '1641081600000',
          symbol: 'ETHUSDT',
          side: 'SELL'
        }
      ];
      
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: mockTrades
      });
      
      const trades = await tracker.getTradesInWindow(phaseId, windowDays);
      
      expect(trades).toHaveLength(2);
      expect(trades[0]).toEqual({
        id: 1,
        phaseId: 'phase3',
        pnl: 100.50,
        timestamp: 1640995200000,
        symbol: 'BTCUSDT',
        side: 'BUY'
      });
      expect(trades[1]).toEqual({
        id: 2,
        phaseId: 'phase3',
        pnl: -75.25,
        timestamp: 1641081600000,
        symbol: 'ETHUSDT',
        side: 'SELL'
      });
      
      // Verify query parameters
      const queryCall = (mockDb.query as jest.Mock).mock.calls[0];
      expect(queryCall[1][0]).toBe(phaseId);
      expect(queryCall[1][1]).toBeGreaterThan(0); // Window start timestamp
    });

    it('should return empty array when database not configured', async () => {
      const trackerWithoutDb = new PerformanceTracker(testConfig);
      
      const trades = await trackerWithoutDb.getTradesInWindow('phase1', 7);
      expect(trades).toEqual([]);
    });
  });

  describe('Phase Performance Metrics', () => {
    it('should calculate comprehensive phase performance', async () => {
      const phaseId: PhaseId = 'phase1';
      
      // Mock trades data
      const mockTrades = [
        { pnl: '100' },
        { pnl: '150' },
        { pnl: '-50' },
        { pnl: '200' },
        { pnl: '-25' },
        { pnl: '75' }
      ];
      
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: mockTrades
      });
      
      const performance = await tracker.getPhasePerformance(phaseId);
      
      expect(performance.phaseId).toBe(phaseId);
      expect(performance.totalPnL).toBe(450); // Sum of all PnL
      expect(performance.tradeCount).toBe(6);
      expect(performance.winRate).toBeCloseTo(0.667, 2); // 4 wins out of 6
      expect(performance.avgWin).toBeCloseTo(131.25, 2); // (100+150+200+75)/4
      expect(performance.avgLoss).toBeCloseTo(37.5, 2); // (50+25)/2
      expect(performance.sharpeRatio).toBeGreaterThan(0);
      expect(performance.modifier).toBeGreaterThan(0);
    });

    it('should handle empty trade history', async () => {
      const phaseId: PhaseId = 'phase2';
      
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: []
      });
      
      const performance = await tracker.getPhasePerformance(phaseId);
      
      expect(performance.phaseId).toBe(phaseId);
      expect(performance.totalPnL).toBe(0);
      expect(performance.tradeCount).toBe(0);
      expect(performance.winRate).toBe(0);
      expect(performance.avgWin).toBe(0);
      expect(performance.avgLoss).toBe(0);
      expect(performance.sharpeRatio).toBe(0);
      expect(performance.modifier).toBe(1.0);
    });

    it('should get all phase performance', async () => {
      // Mock responses for all three phases
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ pnl: '100' }] }) // phase1
        .mockResolvedValueOnce({ rows: [{ pnl: '200' }] }) // phase2
        .mockResolvedValueOnce({ rows: [{ pnl: '-50' }] }); // phase3
      
      const allPerformance = await tracker.getAllPhasePerformance();
      
      expect(allPerformance).toHaveLength(3);
      expect(allPerformance[0].phaseId).toBe('phase1');
      expect(allPerformance[1].phaseId).toBe('phase2');
      expect(allPerformance[2].phaseId).toBe('phase3');
    });
  });

  describe('Performance Snapshot Persistence', () => {
    it('should persist performance snapshot to database', async () => {
      const phaseId: PhaseId = 'phase1';
      
      // Mock trade data for performance calculation
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            { pnl: '100' },
            { pnl: '150' },
            { pnl: '-50' }
          ]
        })
        .mockResolvedValueOnce({}); // Insert response
      
      await tracker.persistPerformanceSnapshot(phaseId);
      
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      
      // Verify the insert call
      const insertCall = (mockDb.query as jest.Mock).mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO phase_performance');
      expect(insertCall[1][0]).toBe(phaseId);
      expect(insertCall[1][1]).toBeGreaterThan(0); // timestamp
      expect(insertCall[1][2]).toBe(200); // totalPnL
      expect(insertCall[1][3]).toBe(3); // tradeCount
      expect(typeof insertCall[1][4]).toBe('number'); // sharpeRatio
      expect(typeof insertCall[1][5]).toBe('number'); // modifier
    });

    it('should throw error when database not configured for persistence', async () => {
      const trackerWithoutDb = new PerformanceTracker(testConfig);
      
      await expect(
        trackerWithoutDb.persistPerformanceSnapshot('phase1')
      ).rejects.toThrow('Database not configured');
    });
  });

  describe('Configuration Management', () => {
    it('should return configuration copy', () => {
      const config = tracker.getConfig();
      
      expect(config).toEqual(testConfig);
      expect(config).not.toBe(testConfig); // Should be a copy
    });

    it('should use custom configuration correctly', () => {
      const customConfig: PerformanceTrackerConfig = {
        windowDays: 14,
        minTradeCount: 20,
        malusThreshold: -0.5,
        bonusThreshold: 1.5,
        malusMultiplier: 0.3,
        bonusMultiplier: 1.5
      };
      
      const customTracker = new PerformanceTracker(customConfig);
      
      // Test that custom thresholds are used
      expect(customTracker.calculateModifier(-0.6)).toBe(0.3);
      expect(customTracker.calculateModifier(-0.4)).toBe(1.0);
      expect(customTracker.calculateModifier(1.4)).toBe(1.0);
      expect(customTracker.calculateModifier(1.6)).toBe(1.5);
      
      expect(customTracker.getConfig()).toEqual(customConfig);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle extreme PnL values', () => {
      const extremeValues = [
        1000000,  // Very large profit
        -1000000, // Very large loss
        0.01,     // Very small profit
        -0.01,    // Very small loss
        0         // Zero PnL
      ];
      
      const sharpe = tracker.calculateSharpeRatio(extremeValues);
      expect(isFinite(sharpe)).toBe(true);
    });

    it('should handle very small standard deviations', () => {
      // Values very close to each other
      const closeValues = [100.001, 100.002, 100.003, 100.004];
      const sharpe = tracker.calculateSharpeRatio(closeValues);
      
      expect(isFinite(sharpe)).toBe(true);
      expect(sharpe).toBeGreaterThan(0); // Should be positive
    });

    it('should handle database query errors gracefully', async () => {
      const phaseId: PhaseId = 'phase1';
      
      // Mock database error
      (mockDb.query as jest.Mock).mockRejectedValueOnce(
        new Error('Database connection failed')
      );
      
      await expect(
        tracker.getTradeCount(phaseId, 7)
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle malformed database responses', async () => {
      const phaseId: PhaseId = 'phase1';
      
      // Mock malformed response
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ count: null }] // Null count
      });
      
      const count = await tracker.getTradeCount(phaseId, 7);
      expect(count).toBe(0); // Should default to 0
    });
  });

  describe('Time Window Calculations', () => {
    it('should calculate correct time window for queries', async () => {
      const phaseId: PhaseId = 'phase1';
      const windowDays = 7;
      const currentTime = Date.now();
      
      // Mock Date.now to control time
      const originalNow = Date.now;
      Date.now = jest.fn(() => currentTime);
      
      try {
        (mockDb.query as jest.Mock).mockResolvedValueOnce({
          rows: [{ count: '5' }]
        });
        
        await tracker.getTradeCount(phaseId, windowDays);
        
        const queryCall = (mockDb.query as jest.Mock).mock.calls[0];
        const expectedWindowStart = currentTime - windowDays * 24 * 60 * 60 * 1000;
        
        expect(queryCall[1][1]).toBe(expectedWindowStart);
      } finally {
        Date.now = originalNow;
      }
    });

    it('should use default window days from config', async () => {
      const phaseId: PhaseId = 'phase1';
      
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: []
      });
      
      await tracker.getSharpeRatio(phaseId); // No windowDays parameter
      
      // Should use config.windowDays (7)
      const queryCall = (mockDb.query as jest.Mock).mock.calls[0];
      expect(queryCall[0]).toContain('timestamp >= $2');
    });
  });
});