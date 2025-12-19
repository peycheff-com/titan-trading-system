/**
 * Type Tests
 * Verifies type definitions are correct and usable
 */

import {
  EquityTier,
  AllocationVector,
  PhaseId,
  IntentSignal,
  Position,
  BreakerType,
  BreakerStatus,
  TreasuryStatus,
  BrainDecision,
} from '../../src/types/index.js';

describe('Types', () => {
  describe('EquityTier', () => {
    it('should have all expected tiers', () => {
      expect(EquityTier.MICRO).toBe('MICRO');
      expect(EquityTier.SMALL).toBe('SMALL');
      expect(EquityTier.MEDIUM).toBe('MEDIUM');
      expect(EquityTier.LARGE).toBe('LARGE');
      expect(EquityTier.INSTITUTIONAL).toBe('INSTITUTIONAL');
    });
  });

  describe('AllocationVector', () => {
    it('should create valid allocation vector', () => {
      const vector: AllocationVector = {
        w1: 0.5,
        w2: 0.3,
        w3: 0.2,
        timestamp: Date.now(),
      };

      expect(vector.w1 + vector.w2 + vector.w3).toBeCloseTo(1.0);
    });
  });

  describe('PhaseId', () => {
    it('should accept valid phase IDs', () => {
      const phases: PhaseId[] = ['phase1', 'phase2', 'phase3'];
      expect(phases).toHaveLength(3);
    });
  });

  describe('IntentSignal', () => {
    it('should create valid intent signal', () => {
      const signal: IntentSignal = {
        signalId: 'sig_123',
        phaseId: 'phase1',
        symbol: 'BTCUSDT',
        side: 'BUY',
        requestedSize: 1000,
        timestamp: Date.now(),
      };

      expect(signal.signalId).toBe('sig_123');
      expect(signal.phaseId).toBe('phase1');
      expect(signal.side).toBe('BUY');
    });
  });

  describe('Position', () => {
    it('should create valid position', () => {
      const position: Position = {
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 5000,
        entryPrice: 50000,
        unrealizedPnL: 100,
        leverage: 10,
        phaseId: 'phase1',
      };

      expect(position.symbol).toBe('BTCUSDT');
      expect(position.side).toBe('LONG');
      expect(position.leverage).toBe(10);
    });
  });

  describe('BreakerType', () => {
    it('should have HARD and SOFT types', () => {
      expect(BreakerType.HARD).toBe('HARD');
      expect(BreakerType.SOFT).toBe('SOFT');
    });
  });

  describe('BreakerStatus', () => {
    it('should create valid breaker status', () => {
      const status: BreakerStatus = {
        active: false,
        dailyDrawdown: 0.05,
        consecutiveLosses: 1,
        equityLevel: 1000,
      };

      expect(status.active).toBe(false);
      expect(status.dailyDrawdown).toBe(0.05);
    });

    it('should create active breaker status', () => {
      const status: BreakerStatus = {
        active: true,
        type: BreakerType.HARD,
        reason: 'Daily drawdown exceeded',
        triggeredAt: Date.now(),
        dailyDrawdown: 0.16,
        consecutiveLosses: 0,
        equityLevel: 170,
      };

      expect(status.active).toBe(true);
      expect(status.type).toBe(BreakerType.HARD);
    });
  });

  describe('TreasuryStatus', () => {
    it('should create valid treasury status', () => {
      const status: TreasuryStatus = {
        futuresWallet: 1000,
        spotWallet: 500,
        totalSwept: 500,
        highWatermark: 1200,
        lockedProfit: 500,
        riskCapital: 1000,
      };

      expect(status.futuresWallet).toBe(1000);
      expect(status.spotWallet).toBe(500);
      expect(status.totalSwept).toBe(500);
    });
  });

  describe('BrainDecision', () => {
    it('should create valid brain decision', () => {
      const decision: BrainDecision = {
        signalId: 'sig_123',
        approved: true,
        authorizedSize: 800,
        reason: 'Signal approved with size reduction',
        allocation: {
          w1: 0.8,
          w2: 0.2,
          w3: 0,
          timestamp: Date.now(),
        },
        performance: {
          phaseId: 'phase1',
          sharpeRatio: 1.5,
          totalPnL: 500,
          tradeCount: 20,
          winRate: 0.6,
          avgWin: 50,
          avgLoss: 30,
          modifier: 1.0,
        },
        risk: {
          approved: true,
          reason: 'Within risk limits',
          adjustedSize: 800,
          riskMetrics: {
            currentLeverage: 5,
            projectedLeverage: 8,
            correlation: 0.3,
            portfolioDelta: 1000,
            portfolioBeta: 0.8,
          },
        },
        timestamp: Date.now(),
      };

      expect(decision.approved).toBe(true);
      expect(decision.authorizedSize).toBe(800);
    });
  });
});
