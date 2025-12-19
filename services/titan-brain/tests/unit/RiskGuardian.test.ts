/**
 * Unit Tests for RiskGuardian
 * 
 * Tests leverage calculation, correlation calculation, Phase 3 hedge auto-approval,
 * and high correlation size reduction.
 * Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7
 */

import { RiskGuardian } from '../../src/engine/RiskGuardian.js';
import { AllocationEngine } from '../../src/engine/AllocationEngine.js';
import { IntentSignal, Position, RiskGuardianConfig } from '../../src/types/index.js';
import { defaultConfig } from '../../src/config/defaults.js';

describe('RiskGuardian', () => {
  let riskGuardian: RiskGuardian;
  let allocationEngine: AllocationEngine;

  const defaultRiskConfig: RiskGuardianConfig = {
    maxCorrelation: 0.8,
    correlationPenalty: 0.5,
    betaUpdateInterval: 300000,
    correlationUpdateInterval: 300000,
  };

  beforeEach(() => {
    allocationEngine = new AllocationEngine(defaultConfig.allocationEngine);
    riskGuardian = new RiskGuardian(defaultRiskConfig, allocationEngine);
    riskGuardian.setEquity(10000); // Default equity for tests
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      const config = riskGuardian.getConfig();
      expect(config.maxCorrelation).toBe(0.8);
      expect(config.correlationPenalty).toBe(0.5);
      expect(config.betaUpdateInterval).toBe(300000);
    });
  });

  describe('setEquity / getEquity', () => {
    it('should set and get equity correctly', () => {
      riskGuardian.setEquity(5000);
      expect(riskGuardian.getEquity()).toBe(5000);
    });

    it('should handle negative equity as 0', () => {
      riskGuardian.setEquity(-1000);
      expect(riskGuardian.getEquity()).toBe(0);
    });
  });

  describe('calculatePortfolioDelta', () => {
    it('should return 0 for empty positions', () => {
      const delta = riskGuardian.calculatePortfolioDelta([]);
      expect(delta).toBe(0);
    });

    it('should return positive delta for long positions', () => {
      const positions: Position[] = [
        { symbol: 'BTCUSDT', side: 'LONG', size: 1000, entryPrice: 50000, unrealizedPnL: 0, leverage: 10, phaseId: 'phase1' },
        { symbol: 'ETHUSDT', side: 'LONG', size: 500, entryPrice: 3000, unrealizedPnL: 0, leverage: 10, phaseId: 'phase1' },
      ];
      const delta = riskGuardian.calculatePortfolioDelta(positions);
      expect(delta).toBe(1500);
    });

    it('should return negative delta for short positions', () => {
      const positions: Position[] = [
        { symbol: 'BTCUSDT', side: 'SHORT', size: 1000, entryPrice: 50000, unrealizedPnL: 0, leverage: 10, phaseId: 'phase1' },
      ];
      const delta = riskGuardian.calculatePortfolioDelta(positions);
      expect(delta).toBe(-1000);
    });

    it('should calculate net delta for mixed positions', () => {
      const positions: Position[] = [
        { symbol: 'BTCUSDT', side: 'LONG', size: 1000, entryPrice: 50000, unrealizedPnL: 0, leverage: 10, phaseId: 'phase1' },
        { symbol: 'ETHUSDT', side: 'SHORT', size: 600, entryPrice: 3000, unrealizedPnL: 0, leverage: 10, phaseId: 'phase2' },
      ];
      const delta = riskGuardian.calculatePortfolioDelta(positions);
      expect(delta).toBe(400); // 1000 - 600
    });
  });

  describe('calculateCombinedLeverage', () => {
    it('should return 0 for empty positions', () => {
      const leverage = riskGuardian.calculateCombinedLeverage([]);
      expect(leverage).toBe(0);
    });

    it('should return 0 when equity is 0', () => {
      riskGuardian.setEquity(0);
      const positions: Position[] = [
        { symbol: 'BTCUSDT', side: 'LONG', size: 1000, entryPrice: 50000, unrealizedPnL: 0, leverage: 10, phaseId: 'phase1' },
      ];
      const leverage = riskGuardian.calculateCombinedLeverage(positions);
      expect(leverage).toBe(0);
    });

    it('should calculate leverage correctly', () => {
      riskGuardian.setEquity(10000);
      const positions: Position[] = [
        { symbol: 'BTCUSDT', side: 'LONG', size: 20000, entryPrice: 50000, unrealizedPnL: 0, leverage: 10, phaseId: 'phase1' },
        { symbol: 'ETHUSDT', side: 'SHORT', size: 10000, entryPrice: 3000, unrealizedPnL: 0, leverage: 5, phaseId: 'phase2' },
      ];
      const leverage = riskGuardian.calculateCombinedLeverage(positions);
      expect(leverage).toBe(3); // (20000 + 10000) / 10000
    });
  });

  describe('calculateCorrelation', () => {
    beforeEach(() => {
      // Add price history for correlation calculation
      const btcPrices = [50000, 50100, 50200, 50150, 50300, 50250, 50400, 50350, 50500, 50450];
      const ethPrices = [3000, 3010, 3020, 3015, 3030, 3025, 3040, 3035, 3050, 3045];
      
      btcPrices.forEach((price, i) => {
        riskGuardian.updatePriceHistory('BTCUSDT', price, Date.now() - (10 - i) * 60000);
      });
      
      ethPrices.forEach((price, i) => {
        riskGuardian.updatePriceHistory('ETHUSDT', price, Date.now() - (10 - i) * 60000);
      });
    });

    it('should return 0.5 for assets with no price history', () => {
      const correlation = riskGuardian.calculateCorrelation('UNKNOWN1', 'UNKNOWN2');
      expect(correlation).toBe(0.5);
    });

    it('should calculate positive correlation for correlated assets', () => {
      const correlation = riskGuardian.calculateCorrelation('BTCUSDT', 'ETHUSDT');
      expect(correlation).toBeGreaterThan(0);
    });

    it('should cache correlation results', () => {
      const correlation1 = riskGuardian.calculateCorrelation('BTCUSDT', 'ETHUSDT');
      const correlation2 = riskGuardian.calculateCorrelation('BTCUSDT', 'ETHUSDT');
      expect(correlation1).toBe(correlation2);
    });

    it('should return same correlation regardless of asset order', () => {
      const correlation1 = riskGuardian.calculateCorrelation('BTCUSDT', 'ETHUSDT');
      riskGuardian.clearCorrelationCache();
      const correlation2 = riskGuardian.calculateCorrelation('ETHUSDT', 'BTCUSDT');
      expect(correlation1).toBeCloseTo(correlation2, 10);
    });
  });

  describe('getPortfolioBeta', () => {
    it('should return 0 for empty positions', () => {
      const beta = riskGuardian.getPortfolioBeta([]);
      expect(beta).toBe(0);
    });

    it('should calculate weighted beta for positions', () => {
      // Add BTC price history
      for (let i = 0; i < 10; i++) {
        riskGuardian.updatePriceHistory('BTCUSDT', 50000 + i * 100, Date.now() - (10 - i) * 60000);
        riskGuardian.updatePriceHistory('ETHUSDT', 3000 + i * 10, Date.now() - (10 - i) * 60000);
      }

      const positions: Position[] = [
        { symbol: 'ETHUSDT', side: 'LONG', size: 1000, entryPrice: 3000, unrealizedPnL: 0, leverage: 10, phaseId: 'phase1' },
      ];
      
      const beta = riskGuardian.getPortfolioBeta(positions);
      expect(typeof beta).toBe('number');
    });

    it('should cache portfolio beta', () => {
      const positions: Position[] = [
        { symbol: 'BTCUSDT', side: 'LONG', size: 1000, entryPrice: 50000, unrealizedPnL: 0, leverage: 10, phaseId: 'phase1' },
      ];
      
      const beta1 = riskGuardian.getPortfolioBeta(positions);
      const beta2 = riskGuardian.getPortfolioBeta(positions);
      expect(beta1).toBe(beta2);
    });
  });

  describe('checkSignal', () => {
    describe('leverage cap enforcement', () => {
      it('should approve signal within leverage limits', () => {
        riskGuardian.setEquity(10000); // MEDIUM tier, 5x max leverage
        
        const signal: IntentSignal = {
          signalId: 'test-1',
          phaseId: 'phase1',
          symbol: 'BTCUSDT',
          side: 'BUY',
          requestedSize: 20000, // 2x leverage
          timestamp: Date.now(),
        };

        const decision = riskGuardian.checkSignal(signal, []);
        expect(decision.approved).toBe(true);
        expect(decision.adjustedSize).toBe(20000);
      });

      it('should veto signal exceeding leverage cap', () => {
        riskGuardian.setEquity(10000); // MEDIUM tier, 5x max leverage
        
        const signal: IntentSignal = {
          signalId: 'test-2',
          phaseId: 'phase1',
          symbol: 'BTCUSDT',
          side: 'BUY',
          requestedSize: 60000, // 6x leverage
          timestamp: Date.now(),
        };

        const decision = riskGuardian.checkSignal(signal, []);
        expect(decision.approved).toBe(false);
        expect(decision.reason).toContain('Leverage cap exceeded');
      });

      it('should consider existing positions in leverage calculation', () => {
        riskGuardian.setEquity(10000); // MEDIUM tier, 5x max leverage
        
        const existingPositions: Position[] = [
          { symbol: 'ETHUSDT', side: 'LONG', size: 30000, entryPrice: 3000, unrealizedPnL: 0, leverage: 10, phaseId: 'phase1' },
        ];

        const signal: IntentSignal = {
          signalId: 'test-3',
          phaseId: 'phase1',
          symbol: 'BTCUSDT',
          side: 'BUY',
          requestedSize: 25000, // Would bring total to 5.5x
          timestamp: Date.now(),
        };

        const decision = riskGuardian.checkSignal(signal, existingPositions);
        expect(decision.approved).toBe(false);
        expect(decision.reason).toContain('Leverage cap exceeded');
      });
    });

    describe('Phase 3 hedge auto-approval', () => {
      it('should auto-approve Phase 3 hedge that reduces delta', () => {
        riskGuardian.setEquity(50000); // INSTITUTIONAL tier, 2x max leverage
        
        const existingPositions: Position[] = [
          { symbol: 'BTCUSDT', side: 'LONG', size: 100000, entryPrice: 50000, unrealizedPnL: 0, leverage: 2, phaseId: 'phase1' },
        ];

        // Phase 3 short to reduce delta
        const signal: IntentSignal = {
          signalId: 'test-4',
          phaseId: 'phase3',
          symbol: 'BTCUSDT',
          side: 'SELL',
          requestedSize: 50000, // Reduces delta from 100k to 50k
          timestamp: Date.now(),
        };

        const decision = riskGuardian.checkSignal(signal, existingPositions);
        expect(decision.approved).toBe(true);
        expect(decision.reason).toContain('Phase 3 hedge approved');
      });

      it('should not auto-approve Phase 3 signal that increases delta', () => {
        riskGuardian.setEquity(50000);
        
        const existingPositions: Position[] = [
          { symbol: 'BTCUSDT', side: 'LONG', size: 50000, entryPrice: 50000, unrealizedPnL: 0, leverage: 1, phaseId: 'phase1' },
        ];

        // Phase 3 long would increase delta
        const signal: IntentSignal = {
          signalId: 'test-5',
          phaseId: 'phase3',
          symbol: 'BTCUSDT',
          side: 'BUY',
          requestedSize: 50000,
          timestamp: Date.now(),
        };

        const decision = riskGuardian.checkSignal(signal, existingPositions);
        // Should go through normal validation, not auto-approve
        expect(decision.reason).not.toContain('Phase 3 hedge approved');
      });

      it('should not auto-approve non-Phase 3 signals', () => {
        riskGuardian.setEquity(50000);
        
        const existingPositions: Position[] = [
          { symbol: 'BTCUSDT', side: 'LONG', size: 50000, entryPrice: 50000, unrealizedPnL: 0, leverage: 1, phaseId: 'phase1' },
        ];

        const signal: IntentSignal = {
          signalId: 'test-6',
          phaseId: 'phase1', // Not Phase 3
          symbol: 'BTCUSDT',
          side: 'SELL',
          requestedSize: 25000,
          timestamp: Date.now(),
        };

        const decision = riskGuardian.checkSignal(signal, existingPositions);
        expect(decision.reason).not.toContain('Phase 3 hedge approved');
      });
    });

    describe('high correlation size reduction', () => {
      beforeEach(() => {
        // Set up highly correlated price history
        for (let i = 0; i < 20; i++) {
          const btcPrice = 50000 + i * 100;
          const ethPrice = 3000 + i * 6; // Highly correlated movement
          riskGuardian.updatePriceHistory('BTCUSDT', btcPrice, Date.now() - (20 - i) * 60000);
          riskGuardian.updatePriceHistory('ETHUSDT', ethPrice, Date.now() - (20 - i) * 60000);
        }
      });

      it('should reduce size for high correlation same direction', () => {
        riskGuardian.setEquity(10000);
        
        const existingPositions: Position[] = [
          { symbol: 'BTCUSDT', side: 'LONG', size: 10000, entryPrice: 50000, unrealizedPnL: 0, leverage: 1, phaseId: 'phase1' },
        ];

        // Same symbol, same direction = correlation 1.0
        const signal: IntentSignal = {
          signalId: 'test-7',
          phaseId: 'phase1',
          symbol: 'BTCUSDT',
          side: 'BUY',
          requestedSize: 10000,
          timestamp: Date.now(),
        };

        const decision = riskGuardian.checkSignal(signal, existingPositions);
        expect(decision.approved).toBe(true);
        expect(decision.adjustedSize).toBe(5000); // 50% reduction
        expect(decision.reason).toContain('High correlation');
      });

      it('should not reduce size for opposite direction', () => {
        riskGuardian.setEquity(10000);
        
        const existingPositions: Position[] = [
          { symbol: 'BTCUSDT', side: 'LONG', size: 10000, entryPrice: 50000, unrealizedPnL: 0, leverage: 1, phaseId: 'phase1' },
        ];

        // Same symbol, opposite direction
        const signal: IntentSignal = {
          signalId: 'test-8',
          phaseId: 'phase1',
          symbol: 'BTCUSDT',
          side: 'SELL',
          requestedSize: 5000,
          timestamp: Date.now(),
        };

        const decision = riskGuardian.checkSignal(signal, existingPositions);
        expect(decision.approved).toBe(true);
        // Should not have size reduction for opposite direction
        expect(decision.adjustedSize).toBe(5000);
      });
    });

    describe('risk metrics in decision', () => {
      it('should include all risk metrics in decision', () => {
        riskGuardian.setEquity(10000);
        
        const positions: Position[] = [
          { symbol: 'BTCUSDT', side: 'LONG', size: 10000, entryPrice: 50000, unrealizedPnL: 100, leverage: 1, phaseId: 'phase1' },
        ];

        const signal: IntentSignal = {
          signalId: 'test-9',
          phaseId: 'phase1',
          symbol: 'ETHUSDT',
          side: 'BUY',
          requestedSize: 5000,
          timestamp: Date.now(),
        };

        const decision = riskGuardian.checkSignal(signal, positions);
        
        expect(decision.riskMetrics).toBeDefined();
        expect(typeof decision.riskMetrics.currentLeverage).toBe('number');
        expect(typeof decision.riskMetrics.projectedLeverage).toBe('number');
        expect(typeof decision.riskMetrics.correlation).toBe('number');
        expect(typeof decision.riskMetrics.portfolioDelta).toBe('number');
        expect(typeof decision.riskMetrics.portfolioBeta).toBe('number');
      });
    });
  });

  describe('getRiskMetrics', () => {
    it('should return current risk metrics snapshot', () => {
      riskGuardian.setEquity(10000);
      
      const positions: Position[] = [
        { symbol: 'BTCUSDT', side: 'LONG', size: 20000, entryPrice: 50000, unrealizedPnL: 0, leverage: 2, phaseId: 'phase1' },
        { symbol: 'ETHUSDT', side: 'SHORT', size: 10000, entryPrice: 3000, unrealizedPnL: 0, leverage: 1, phaseId: 'phase2' },
      ];

      const metrics = riskGuardian.getRiskMetrics(positions);
      
      expect(metrics.currentLeverage).toBe(3); // (20000 + 10000) / 10000
      expect(metrics.portfolioDelta).toBe(10000); // 20000 - 10000
      expect(typeof metrics.portfolioBeta).toBe('number');
      expect(typeof metrics.correlation).toBe('number');
    });
  });

  describe('updatePriceHistory', () => {
    it('should add price entries', () => {
      riskGuardian.updatePriceHistory('BTCUSDT', 50000);
      riskGuardian.updatePriceHistory('BTCUSDT', 50100);
      
      // Verify by checking correlation calculation works
      riskGuardian.updatePriceHistory('ETHUSDT', 3000);
      riskGuardian.updatePriceHistory('ETHUSDT', 3010);
      
      const correlation = riskGuardian.calculateCorrelation('BTCUSDT', 'ETHUSDT');
      expect(typeof correlation).toBe('number');
    });

    it('should use provided timestamp', () => {
      const timestamp = Date.now() - 60000;
      riskGuardian.updatePriceHistory('BTCUSDT', 50000, timestamp);
      // No error means success
    });
  });

  describe('clearCorrelationCache', () => {
    it('should clear cached correlations', () => {
      // Add price history
      for (let i = 0; i < 10; i++) {
        riskGuardian.updatePriceHistory('BTCUSDT', 50000 + i * 100, Date.now() - (10 - i) * 60000);
        riskGuardian.updatePriceHistory('ETHUSDT', 3000 + i * 10, Date.now() - (10 - i) * 60000);
      }

      // Calculate and cache
      const correlation1 = riskGuardian.calculateCorrelation('BTCUSDT', 'ETHUSDT');
      
      // Clear cache
      riskGuardian.clearCorrelationCache();
      
      // Should recalculate
      const correlation2 = riskGuardian.calculateCorrelation('BTCUSDT', 'ETHUSDT');
      
      // Values should be the same (same data)
      expect(correlation1).toBeCloseTo(correlation2, 10);
    });
  });

  describe('edge cases', () => {
    it('should handle signal for same symbol reducing position', () => {
      riskGuardian.setEquity(10000);
      
      const existingPositions: Position[] = [
        { symbol: 'BTCUSDT', side: 'LONG', size: 20000, entryPrice: 50000, unrealizedPnL: 0, leverage: 2, phaseId: 'phase1' },
      ];

      // Sell signal to reduce long position
      const signal: IntentSignal = {
        signalId: 'test-10',
        phaseId: 'phase1',
        symbol: 'BTCUSDT',
        side: 'SELL',
        requestedSize: 10000,
        timestamp: Date.now(),
      };

      const decision = riskGuardian.checkSignal(signal, existingPositions);
      expect(decision.approved).toBe(true);
      // Projected leverage should be lower
      expect(decision.riskMetrics.projectedLeverage).toBeLessThan(decision.riskMetrics.currentLeverage);
    });

    it('should handle zero equity gracefully', () => {
      riskGuardian.setEquity(0);
      
      const signal: IntentSignal = {
        signalId: 'test-11',
        phaseId: 'phase1',
        symbol: 'BTCUSDT',
        side: 'BUY',
        requestedSize: 1000,
        timestamp: Date.now(),
      };

      const decision = riskGuardian.checkSignal(signal, []);
      expect(decision.riskMetrics.currentLeverage).toBe(0);
      expect(decision.riskMetrics.projectedLeverage).toBe(0);
    });
  });
});
