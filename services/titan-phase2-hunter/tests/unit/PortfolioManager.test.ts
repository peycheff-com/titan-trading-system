/**
 * Unit tests for PortfolioManager
 * Tests multi-symbol portfolio management functionality
 */

import { PortfolioManager, PortfolioManagerConfig } from '../../src/risk/PortfolioManager';
import { Position, SignalData, HologramState } from '../../src/types';

describe('PortfolioManager', () => {
  let portfolioManager: PortfolioManager;
  let mockPositions: Position[];
  let mockSignals: Array<{ signal: SignalData; hologramState: HologramState }>;

  beforeEach(() => {
    // Create portfolio manager with test config
    const config: Partial<PortfolioManagerConfig> = {
      maxTotalExposure: 2.0, // 200% of equity
      maxConcurrentPositions: 5,
      baseRiskPercent: 0.02, // 2%
      maxPortfolioHeat: 0.15, // 15%
      directionalBiasThreshold: 0.6, // 60%
      directionalBiasReduction: 0.2, // 20%
      alignmentScoreWeight: 0.7, // 70%
      rsScoreWeight: 0.3, // 30%
      maxSignalsToRank: 10
    };

    portfolioManager = new PortfolioManager(config);

    // Create mock positions with smaller exposure
    mockPositions = [
      {
        id: 'pos-1',
        symbol: 'BTCUSDT',
        side: 'LONG',
        entryPrice: 50000,
        currentPrice: 51000,
        quantity: 0.02, // Reduced from 0.1
        leverage: 3,
        stopLoss: 49250, // 1.5% stop
        takeProfit: 52250, // 4.5% target
        unrealizedPnL: 20, // Reduced proportionally
        realizedPnL: 0,
        entryTime: Date.now() - (24 * 60 * 60 * 1000), // 24 hours ago
        status: 'OPEN',
        rValue: 1.33, // (51000-50000)/(50000-49250) = 1.33R
        atr: 1000
      },
      {
        id: 'pos-2',
        symbol: 'ETHUSDT',
        side: 'LONG',
        entryPrice: 3000,
        currentPrice: 3100,
        quantity: 0.2, // Reduced from 1
        leverage: 4,
        stopLoss: 2955, // 1.5% stop
        takeProfit: 3135, // 4.5% target
        unrealizedPnL: 20, // Reduced proportionally
        realizedPnL: 0,
        entryTime: Date.now() - (12 * 60 * 60 * 1000), // 12 hours ago
        status: 'OPEN',
        rValue: 2.22, // (3100-3000)/(3000-2955) = 2.22R
        atr: 50
      }
    ];

    // Create mock signals with hologram states
    mockSignals = [
      {
        signal: {
          symbol: 'ADAUSDT',
          direction: 'LONG',
          hologramStatus: 'A+',
          alignmentScore: 95,
          rsScore: 0.05,
          sessionType: 'LONDON',
          poiType: 'ORDER_BLOCK',
          cvdConfirmation: true,
          confidence: 90,
          entryPrice: 0.5,
          stopLoss: 0.4925,
          takeProfit: 0.5225,
          positionSize: 1000,
          leverage: 3,
          timestamp: Date.now()
        },
        hologramState: {
          symbol: 'ADAUSDT',
          timestamp: Date.now(),
          daily: {} as any,
          h4: {} as any,
          m15: {} as any,
          alignmentScore: 95,
          status: 'A+',
          veto: { vetoed: false, reason: null, direction: null },
          rsScore: 0.05
        }
      },
      {
        signal: {
          symbol: 'SOLUSDT',
          direction: 'SHORT',
          hologramStatus: 'B',
          alignmentScore: 75,
          rsScore: -0.03,
          sessionType: 'NY',
          poiType: 'FVG',
          cvdConfirmation: true,
          confidence: 80,
          entryPrice: 100,
          stopLoss: 101.5,
          takeProfit: 95.5,
          positionSize: 10,
          leverage: 4,
          timestamp: Date.now()
        },
        hologramState: {
          symbol: 'SOLUSDT',
          timestamp: Date.now(),
          daily: {} as any,
          h4: {} as any,
          m15: {} as any,
          alignmentScore: 75,
          status: 'B',
          veto: { vetoed: false, reason: null, direction: null },
          rsScore: -0.03
        }
      }
    ];
  });

  afterEach(() => {
    portfolioManager.destroy();
  });

  describe('calcTotalExposure', () => {
    it('should calculate total exposure correctly', () => {
      const totalEquity = 10000;
      const exposure = portfolioManager.calcTotalExposure(mockPositions, totalEquity);
      
      // Position 1: 0.02 * 51000 * 3 = 3060
      // Position 2: 0.2 * 3100 * 4 = 2480
      // Total: 5540, Exposure: 5540/10000 = 0.554 (55.4%)
      // Should return actual exposure, not capped
      expect(exposure).toBeCloseTo(0.554, 3);
    });

    it('should return 0 for zero equity', () => {
      const exposure = portfolioManager.calcTotalExposure(mockPositions, 0);
      expect(exposure).toBe(0);
    });

    it('should handle empty positions', () => {
      const exposure = portfolioManager.calcTotalExposure([], 10000);
      expect(exposure).toBe(0);
    });
  });

  describe('enforceMaxPositions', () => {
    it('should allow new position when under limit', () => {
      const canOpen = portfolioManager.enforceMaxPositions(mockPositions);
      expect(canOpen).toBe(true); // 2 positions < 5 limit
    });

    it('should reject new position when at limit', () => {
      // Create 5 positions to hit the limit
      const maxPositions = Array(5).fill(null).map((_, i) => ({
        ...mockPositions[0],
        id: `pos-${i}`,
        status: 'OPEN' as const
      }));
      
      const canOpen = portfolioManager.enforceMaxPositions(maxPositions);
      expect(canOpen).toBe(false);
    });

    it('should only count open positions', () => {
      const positionsWithClosed = [
        ...mockPositions,
        { ...mockPositions[0], id: 'pos-3', status: 'CLOSED' as const },
        { ...mockPositions[0], id: 'pos-4', status: 'CLOSED' as const }
      ];
      
      const canOpen = portfolioManager.enforceMaxPositions(positionsWithClosed);
      expect(canOpen).toBe(true); // Only 2 open positions
    });
  });

  describe('allocateRiskPerTrade', () => {
    it('should allocate risk dynamically based on open positions', () => {
      const totalEquity = 10000;
      const allocation = portfolioManager.allocateRiskPerTrade(totalEquity, mockPositions);
      
      // Base risk: 2%, Open positions: 2, Adjusted: 2% / (2+1) = 0.67%
      expect(allocation.baseRiskPerTrade).toBe(0.02);
      expect(allocation.adjustedRiskPerTrade).toBeCloseTo(0.0067, 4);
      expect(allocation.maxPositionSize).toBeCloseTo(4444, 0); // (10000 * 0.0067) / 0.015
      expect(allocation.recommendedLeverage).toBeGreaterThan(1);
      expect(allocation.recommendedLeverage).toBeLessThanOrEqual(5);
    });

    it('should handle no open positions', () => {
      const totalEquity = 10000;
      const allocation = portfolioManager.allocateRiskPerTrade(totalEquity, []);
      
      // No positions: 2% / 1 = 2%
      expect(allocation.adjustedRiskPerTrade).toBe(0.02);
    });
  });

  describe('rankSignals', () => {
    it('should rank signals by composite score', () => {
      const ranked = portfolioManager.rankSignals(mockSignals);
      
      expect(ranked).toHaveLength(2);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
      
      // First signal should have higher composite score (A+ with 95 alignment)
      expect(ranked[0].compositeScore).toBeGreaterThan(ranked[1].compositeScore);
      expect(ranked[0].signal.symbol).toBe('ADAUSDT');
    });

    it('should limit to top 3 signals', () => {
      // Add more signals
      const moreSignals = [
        ...mockSignals,
        ...Array(5).fill(null).map((_, i) => ({
          signal: { ...mockSignals[0].signal, symbol: `TEST${i}USDT` },
          hologramState: { ...mockSignals[0].hologramState, alignmentScore: 60 - i }
        }))
      ];
      
      const ranked = portfolioManager.rankSignals(moreSignals);
      expect(ranked).toHaveLength(3); // Limited to top 3
    });

    it('should handle empty signals array', () => {
      const ranked = portfolioManager.rankSignals([]);
      expect(ranked).toHaveLength(0);
    });
  });

  describe('checkPortfolioHeat', () => {
    it('should calculate portfolio heat correctly', () => {
      const totalEquity = 10000;
      const canTrade = portfolioManager.checkPortfolioHeat(mockPositions, totalEquity);
      
      // Position 1 risk: (50000-49250) * 0.02 = 15
      // Position 2 risk: (3000-2955) * 0.2 = 9
      // Total risk: 24, Heat: 24/10000 = 0.24% < 15%
      expect(canTrade).toBe(true);
    });

    it('should reject when portfolio heat exceeds limit', () => {
      // Create high-risk positions
      const highRiskPositions = mockPositions.map(pos => ({
        ...pos,
        quantity: pos.quantity * 50 // Increase quantity to increase risk
      }));
      
      const totalEquity = 1000; // Small equity to increase heat percentage
      const canTrade = portfolioManager.checkPortfolioHeat(highRiskPositions, totalEquity);
      
      expect(canTrade).toBe(false);
    });

    it('should return false for zero equity', () => {
      const canTrade = portfolioManager.checkPortfolioHeat(mockPositions, 0);
      expect(canTrade).toBe(false);
    });
  });

  describe('adjustForDirectionalBias', () => {
    it('should not adjust when no directional bias', () => {
      // Mixed positions (1 LONG, 1 SHORT)
      const mixedPositions = [
        mockPositions[0], // LONG
        { ...mockPositions[1], side: 'SHORT' as const } // SHORT
      ];
      
      const adjustedSize = portfolioManager.adjustForDirectionalBias(
        mixedPositions, 
        'LONG', 
        1000
      );
      
      expect(adjustedSize).toBe(1000); // No adjustment
    });

    it('should reduce position size when adding to directional bias', () => {
      // All LONG positions (100% bias)
      const longPositions = mockPositions; // Both are LONG
      
      const adjustedSize = portfolioManager.adjustForDirectionalBias(
        longPositions, 
        'LONG', 
        1000
      );
      
      // Should reduce by 20%: 1000 * (1 - 0.2) = 800
      expect(adjustedSize).toBe(800);
    });

    it('should not adjust when going against directional bias', () => {
      // All LONG positions
      const longPositions = mockPositions; // Both are LONG
      
      const adjustedSize = portfolioManager.adjustForDirectionalBias(
        longPositions, 
        'SHORT', 
        1000
      );
      
      expect(adjustedSize).toBe(1000); // No adjustment when going against bias
    });

    it('should handle empty positions', () => {
      const adjustedSize = portfolioManager.adjustForDirectionalBias([], 'LONG', 1000);
      expect(adjustedSize).toBe(1000); // No adjustment with no positions
    });
  });

  describe('updatePortfolioState', () => {
    it('should update portfolio state correctly', () => {
      const totalEquity = 10000;
      portfolioManager.updatePortfolioState(mockPositions, totalEquity);
      
      const state = portfolioManager.getPortfolioState();
      
      expect(state.totalEquity).toBe(totalEquity);
      expect(state.openPositions).toHaveLength(2);
      expect(state.directionalBias).toBe('LONG'); // Both positions are LONG
      expect(state.biasPercentage).toBe(1.0); // 100% LONG
      expect(state.totalUnrealizedPnL).toBe(40); // 20 + 20
      expect(state.totalRealizedPnL).toBe(0);
    });

    it('should detect neutral bias with mixed positions', () => {
      const mixedPositions = [
        mockPositions[0], // LONG
        { ...mockPositions[1], side: 'SHORT' as const } // SHORT
      ];
      
      portfolioManager.updatePortfolioState(mixedPositions, 10000);
      const state = portfolioManager.getPortfolioState();
      
      expect(state.directionalBias).toBe('NEUTRAL');
      expect(state.biasPercentage).toBe(0);
    });
  });

  describe('canAcceptSignal', () => {
    beforeEach(() => {
      // Add positions to portfolio manager
      mockPositions.forEach(pos => portfolioManager.addPosition(pos));
      portfolioManager.updatePortfolioState(mockPositions, 10000);
    });

    it('should accept signal when all limits are within bounds', () => {
      const canAccept = portfolioManager.canAcceptSignal(
        mockSignals[0].signal,
        mockSignals[0].hologramState,
        10000
      );
      
      expect(canAccept).toBe(true);
    });

    it('should reject signal when position limit exceeded', () => {
      // Add more positions to hit the limit
      for (let i = 3; i <= 5; i++) {
        portfolioManager.addPosition({
          ...mockPositions[0],
          id: `pos-${i}`,
          status: 'OPEN'
        });
      }
      
      const canAccept = portfolioManager.canAcceptSignal(
        mockSignals[0].signal,
        mockSignals[0].hologramState,
        10000
      );
      
      expect(canAccept).toBe(false);
    });
  });

  describe('getPortfolioStatistics', () => {
    beforeEach(() => {
      mockPositions.forEach(pos => portfolioManager.addPosition(pos));
      portfolioManager.updatePortfolioState(mockPositions, 10000);
    });

    it('should return correct portfolio statistics', () => {
      const stats = portfolioManager.getPortfolioStatistics();
      
      expect(stats.totalPositions).toBe(2);
      expect(stats.openPositions).toBe(2);
      expect(stats.exposureUtilization).toBeGreaterThan(0);
      expect(stats.heatUtilization).toBeGreaterThan(0);
      expect(stats.positionUtilization).toBe(0.4); // 2/5 = 0.4
      expect(stats.avgPositionSize).toBeGreaterThan(0);
      expect(stats.largestPosition).toBeGreaterThan(0);
      expect(stats.directionalBias).toContain('LONG');
      expect(stats.totalPnL).toBe(40);
    });
  });

  describe('position management', () => {
    it('should add and remove positions correctly', () => {
      const position = mockPositions[0];
      
      portfolioManager.addPosition(position);
      expect(portfolioManager.getAllPositions()).toHaveLength(1);
      
      portfolioManager.removePosition(position.id);
      expect(portfolioManager.getAllPositions()).toHaveLength(0);
    });

    it('should update positions correctly', () => {
      const position = mockPositions[0];
      portfolioManager.addPosition(position);
      
      const updatedPosition = { ...position, currentPrice: 52000 };
      portfolioManager.updatePosition(updatedPosition);
      
      const retrieved = portfolioManager.getAllPositions()[0];
      expect(retrieved.currentPrice).toBe(52000);
    });

    it('should get open positions only', () => {
      const openPosition = mockPositions[0];
      const closedPosition = { ...mockPositions[1], status: 'CLOSED' as const };
      
      portfolioManager.addPosition(openPosition);
      portfolioManager.addPosition(closedPosition);
      
      const openPositions = portfolioManager.getOpenPositions();
      expect(openPositions).toHaveLength(1);
      expect(openPositions[0].status).toBe('OPEN');
    });

    it('should clear all positions', () => {
      mockPositions.forEach(pos => portfolioManager.addPosition(pos));
      expect(portfolioManager.getAllPositions()).toHaveLength(2);
      
      portfolioManager.clearPositions();
      expect(portfolioManager.getAllPositions()).toHaveLength(0);
    });
  });

  describe('configuration', () => {
    it('should update configuration correctly', () => {
      const newConfig = { maxConcurrentPositions: 10 };
      portfolioManager.updateConfig(newConfig);
      
      // Test that new config is applied
      const positions = Array(8).fill(null).map((_, i) => ({
        ...mockPositions[0],
        id: `pos-${i}`,
        status: 'OPEN' as const
      }));
      
      const canOpen = portfolioManager.enforceMaxPositions(positions);
      expect(canOpen).toBe(true); // Should allow since limit is now 10
    });
  });

  describe('event emission', () => {
    it('should emit portfolio updated event', (done) => {
      portfolioManager.on('portfolio:updated', (state) => {
        expect(state.totalEquity).toBe(10000);
        expect(state.openPositions).toHaveLength(2);
        done();
      });
      
      portfolioManager.updatePortfolioState(mockPositions, 10000);
    });

    it('should emit signal rejected event', (done) => {
      portfolioManager.on('portfolio:signal_rejected', (signal, reason) => {
        expect(signal.symbol).toBe('ADAUSDT');
        expect(reason).toBe('POSITION_LIMIT_EXCEEDED');
        done();
      });
      
      // Add positions to hit limit
      for (let i = 1; i <= 5; i++) {
        portfolioManager.addPosition({
          ...mockPositions[0],
          id: `pos-${i}`,
          status: 'OPEN'
        });
      }
      
      portfolioManager.canAcceptSignal(
        mockSignals[0].signal,
        mockSignals[0].hologramState,
        10000
      );
    });

    it('should emit directional bias event', (done) => {
      portfolioManager.on('portfolio:directional_bias', (bias, percentage) => {
        expect(bias).toBe('LONG');
        expect(percentage).toBe(1.0);
        done();
      });
      
      portfolioManager.adjustForDirectionalBias(mockPositions, 'LONG', 1000);
    });
  });
});