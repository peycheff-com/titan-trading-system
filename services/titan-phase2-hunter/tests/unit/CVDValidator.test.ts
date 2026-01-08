/**
 * Unit Tests for CVDValidator
 * 
 * Tests all CVD calculation, absorption detection, and distribution detection functions
 * using known trade patterns and edge cases.
 */

import { CVDValidator, CVDTrade } from '../../src/engine/CVDValidator';
import { Absorption, Distribution, POI, FVG, OrderBlock, LiquidityPool } from '../../src/types';

describe('CVDValidator', () => {
  let cvdValidator: CVDValidator;

  beforeEach(() => {
    cvdValidator = new CVDValidator();
  });

  // Helper function to create test CVD trade data
  const createTrade = (
    symbol: string,
    price: number,
    qty: number,
    time: number,
    isBuyerMaker: boolean
  ): CVDTrade => ({
    symbol,
    price,
    qty,
    time,
    isBuyerMaker
  });

  describe('calcCVD', () => {
    it('should calculate positive CVD for net buying pressure', () => {
      const trades: CVDTrade[] = [
        createTrade('BTCUSDT', 50000, 0.1, Date.now() - 60000, false), // Buy: +5000
        createTrade('BTCUSDT', 50100, 0.05, Date.now() - 30000, false), // Buy: +2505
        createTrade('BTCUSDT', 49900, 0.02, Date.now() - 10000, true)   // Sell: -998
      ];

      const cvd = cvdValidator.calcCVD(trades);
      expect(cvd).toBeCloseTo(6507, 0); // 5000 + 2505 - 998
    });

    it('should calculate negative CVD for net selling pressure', () => {
      const trades: CVDTrade[] = [
        createTrade('BTCUSDT', 50000, 0.1, Date.now() - 60000, true),  // Sell: -5000
        createTrade('BTCUSDT', 49900, 0.05, Date.now() - 30000, true), // Sell: -2495
        createTrade('BTCUSDT', 50100, 0.02, Date.now() - 10000, false) // Buy: +1002
      ];

      const cvd = cvdValidator.calcCVD(trades);
      expect(cvd).toBeCloseTo(-6493, 0); // -5000 - 2495 + 1002
    });

    it('should filter trades by time window', () => {
      const now = Date.now();
      const trades: CVDTrade[] = [
        createTrade('BTCUSDT', 50000, 0.1, now - 600000, false), // 10 min ago (excluded)
        createTrade('BTCUSDT', 50100, 0.05, now - 240000, false), // 4 min ago (included)
        createTrade('BTCUSDT', 49900, 0.02, now - 60000, true)    // 1 min ago (included)
      ];

      const cvd = cvdValidator.calcCVD(trades, 300000); // 5 minute window
      expect(cvd).toBeCloseTo(1507, 0); // 2505 - 998 (first trade excluded)
    });

    it('should return zero CVD for empty trades', () => {
      const cvd = cvdValidator.calcCVD([]);
      expect(cvd).toBe(0);
    });

    it('should handle equal buy and sell volumes', () => {
      const trades: CVDTrade[] = [
        createTrade('BTCUSDT', 50000, 0.1, Date.now() - 60000, false), // Buy: +5000
        createTrade('BTCUSDT', 50000, 0.1, Date.now() - 30000, true)   // Sell: -5000
      ];

      const cvd = cvdValidator.calcCVD(trades);
      expect(cvd).toBe(0);
    });
  });

  describe('detectAbsorption', () => {
    it('should detect absorption pattern (price LL, CVD HL)', () => {
      const prices = [100, 95, 90];      // Lower Low pattern
      const cvdValues = [-1000, -1500, -1200]; // Higher Low pattern

      const absorption = cvdValidator.detectAbsorption(prices, cvdValues);

      expect(absorption).not.toBeNull();
      expect(absorption!.price).toBe(90);
      expect(absorption!.cvdValue).toBe(-1200);
      expect(absorption!.confidence).toBeGreaterThan(0);
      expect(absorption!.timestamp).toBeCloseTo(Date.now(), -2);
    });

    it('should not detect absorption when price pattern is wrong', () => {
      const prices = [90, 95, 100];      // Higher High pattern (wrong)
      const cvdValues = [-1000, -1500, -1200]; // Higher Low pattern

      const absorption = cvdValidator.detectAbsorption(prices, cvdValues);
      expect(absorption).toBeNull();
    });

    it('should not detect absorption when CVD pattern is wrong', () => {
      const prices = [100, 95, 90];      // Lower Low pattern
      const cvdValues = [-1000, -1200, -1500]; // Lower Low pattern (wrong)

      const absorption = cvdValidator.detectAbsorption(prices, cvdValues);
      expect(absorption).toBeNull();
    });

    it('should return null for insufficient data points', () => {
      const prices = [100, 95];
      const cvdValues = [-1000, -1200];

      const absorption = cvdValidator.detectAbsorption(prices, cvdValues);
      expect(absorption).toBeNull();
    });

    it('should calculate absorption strength correctly', () => {
      const prices = [100, 95, 85];      // 15% price drop
      const cvdValues = [-1000, -1500, -1000]; // 33% CVD rise

      const absorption = cvdValidator.detectAbsorption(prices, cvdValues);

      expect(absorption).not.toBeNull();
      expect(absorption!.confidence).toBeGreaterThan(20); // Should reflect significant divergence
      expect(absorption!.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('detectDistribution', () => {
    it('should detect distribution pattern (price HH, CVD LH)', () => {
      const prices = [90, 95, 100];      // Higher High pattern
      const cvdValues = [1000, 1500, 1200]; // Lower High pattern

      const distribution = cvdValidator.detectDistribution(prices, cvdValues);

      expect(distribution).not.toBeNull();
      expect(distribution!.price).toBe(100);
      expect(distribution!.cvdValue).toBe(1200);
      expect(distribution!.confidence).toBeGreaterThan(0);
      expect(distribution!.timestamp).toBeCloseTo(Date.now(), -2);
    });

    it('should not detect distribution when price pattern is wrong', () => {
      const prices = [100, 95, 90];      // Lower Low pattern (wrong)
      const cvdValues = [1000, 1500, 1200]; // Lower High pattern

      const distribution = cvdValidator.detectDistribution(prices, cvdValues);
      expect(distribution).toBeNull();
    });

    it('should not detect distribution when CVD pattern is wrong', () => {
      const prices = [90, 95, 100];      // Higher High pattern
      const cvdValues = [1000, 1200, 1500]; // Higher High pattern (wrong)

      const distribution = cvdValidator.detectDistribution(prices, cvdValues);
      expect(distribution).toBeNull();
    });

    it('should return null for insufficient data points', () => {
      const prices = [90, 95];
      const cvdValues = [1000, 1200];

      const distribution = cvdValidator.detectDistribution(prices, cvdValues);
      expect(distribution).toBeNull();
    });

    it('should calculate distribution strength correctly', () => {
      const prices = [85, 95, 100];      // 17.6% price rise
      const cvdValues = [1500, 2000, 1500]; // 25% CVD drop

      const distribution = cvdValidator.detectDistribution(prices, cvdValues);

      expect(distribution).not.toBeNull();
      expect(distribution!.confidence).toBeGreaterThan(20); // Should reflect significant divergence
      expect(distribution!.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('validateWithCVD', () => {
    it('should increase confidence for bullish POI with absorption', () => {
      const bullishFVG: FVG = {
        type: 'BULLISH',
        top: 105,
        bottom: 95,
        midpoint: 100,
        barIndex: 5,
        timestamp: Date.now(),
        mitigated: false,
        fillPercent: 0
      };

      const absorption: Absorption = {
        price: 98,
        cvdValue: -1200,
        timestamp: Date.now(),
        confidence: 80
      };

      const confidenceAdjustment = cvdValidator.validateWithCVD(bullishFVG, absorption);
      expect(confidenceAdjustment).toBe(30);
    });

    it('should decrease confidence for bullish POI with distribution', () => {
      const bullishOB: OrderBlock = {
        type: 'BULLISH',
        high: 105,
        low: 95,
        barIndex: 5,
        timestamp: Date.now(),
        mitigated: false,
        confidence: 90
      };

      const distribution: Distribution = {
        price: 102,
        cvdValue: 1200,
        timestamp: Date.now(),
        confidence: 75
      };

      const confidenceAdjustment = cvdValidator.validateWithCVD(bullishOB, null, distribution);
      expect(confidenceAdjustment).toBe(-20);
    });

    it('should increase confidence for bearish POI with distribution', () => {
      const bearishFVG: FVG = {
        type: 'BEARISH',
        top: 105,
        bottom: 95,
        midpoint: 100,
        barIndex: 5,
        timestamp: Date.now(),
        mitigated: false,
        fillPercent: 0
      };

      const distribution: Distribution = {
        price: 102,
        cvdValue: 1200,
        timestamp: Date.now(),
        confidence: 85
      };

      const confidenceAdjustment = cvdValidator.validateWithCVD(bearishFVG, null, distribution);
      expect(confidenceAdjustment).toBe(30);
    });

    it('should decrease confidence for bearish POI with absorption', () => {
      const bearishOB: OrderBlock = {
        type: 'BEARISH',
        high: 105,
        low: 95,
        barIndex: 5,
        timestamp: Date.now(),
        mitigated: false,
        confidence: 85
      };

      const absorption: Absorption = {
        price: 98,
        cvdValue: -1200,
        timestamp: Date.now(),
        confidence: 80
      };

      const confidenceAdjustment = cvdValidator.validateWithCVD(bearishOB, absorption);
      expect(confidenceAdjustment).toBe(-20);
    });

    it('should add confidence for liquidity pool with any CVD divergence', () => {
      const liquidityPool: LiquidityPool = {
        type: 'HIGH',
        price: 105,
        strength: 75,
        barIndex: 5,
        timestamp: Date.now(),
        swept: false
      };

      const absorption: Absorption = {
        price: 98,
        cvdValue: -1200,
        timestamp: Date.now(),
        confidence: 80
      };

      const confidenceAdjustment = cvdValidator.validateWithCVD(liquidityPool, absorption);
      expect(confidenceAdjustment).toBe(15);
    });

    it('should return zero adjustment when no CVD signals provided', () => {
      const bullishFVG: FVG = {
        type: 'BULLISH',
        top: 105,
        bottom: 95,
        midpoint: 100,
        barIndex: 5,
        timestamp: Date.now(),
        mitigated: false,
        fillPercent: 0
      };

      const confidenceAdjustment = cvdValidator.validateWithCVD(bullishFVG);
      expect(confidenceAdjustment).toBe(0);
    });
  });

  describe('recordTrade', () => {
    it('should record trade and maintain history', () => {
      const trade = createTrade('BTCUSDT', 50000, 0.1, Date.now(), false);
      
      cvdValidator.recordTrade(trade);
      
      const history = cvdValidator.getTradeHistory('BTCUSDT');
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(trade);
    });

    it('should maintain separate history for different symbols', () => {
      const btcTrade = createTrade('BTCUSDT', 50000, 0.1, Date.now(), false);
      const ethTrade = createTrade('ETHUSDT', 3000, 1.0, Date.now(), true);
      
      cvdValidator.recordTrade(btcTrade);
      cvdValidator.recordTrade(ethTrade);
      
      const btcHistory = cvdValidator.getTradeHistory('BTCUSDT');
      const ethHistory = cvdValidator.getTradeHistory('ETHUSDT');
      
      expect(btcHistory).toHaveLength(1);
      expect(ethHistory).toHaveLength(1);
      expect(btcHistory[0].symbol).toBe('BTCUSDT');
      expect(ethHistory[0].symbol).toBe('ETHUSDT');
    });

    it('should filter old trades from history', () => {
      const now = Date.now();
      const oldTrade = createTrade('BTCUSDT', 50000, 0.1, now - 700000, false); // 11+ min ago
      const recentTrade = createTrade('BTCUSDT', 50100, 0.05, now - 60000, true); // 1 min ago
      
      cvdValidator.recordTrade(oldTrade);
      cvdValidator.recordTrade(recentTrade);
      
      const history = cvdValidator.getTradeHistory('BTCUSDT');
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(recentTrade);
    });

    it('should accumulate multiple trades for same symbol', () => {
      const trade1 = createTrade('BTCUSDT', 50000, 0.1, Date.now() - 60000, false);
      const trade2 = createTrade('BTCUSDT', 50100, 0.05, Date.now() - 30000, true);
      const trade3 = createTrade('BTCUSDT', 49900, 0.02, Date.now() - 10000, false);
      
      cvdValidator.recordTrade(trade1);
      cvdValidator.recordTrade(trade2);
      cvdValidator.recordTrade(trade3);
      
      const history = cvdValidator.getTradeHistory('BTCUSDT');
      expect(history).toHaveLength(3);
    });
  });

  describe('getCurrentCVD', () => {
    it('should return current CVD for symbol', () => {
      const trades = [
        createTrade('BTCUSDT', 50000, 0.1, Date.now() - 60000, false), // Buy: +5000
        createTrade('BTCUSDT', 50100, 0.05, Date.now() - 30000, true)  // Sell: -2505
      ];
      
      trades.forEach(trade => cvdValidator.recordTrade(trade));
      
      const cvd = cvdValidator.getCurrentCVD('BTCUSDT');
      expect(cvd).toBeCloseTo(2495, 0); // 5000 - 2505
    });

    it('should return zero for symbol with no trades', () => {
      const cvd = cvdValidator.getCurrentCVD('NONEXISTENT');
      expect(cvd).toBe(0);
    });

    it('should respect custom time window', () => {
      const now = Date.now();
      const trades = [
        createTrade('BTCUSDT', 50000, 0.1, now - 240000, false), // 4 min ago: +5000
        createTrade('BTCUSDT', 50100, 0.05, now - 60000, true)   // 1 min ago: -2505
      ];
      
      trades.forEach(trade => cvdValidator.recordTrade(trade));
      
      const cvd2min = cvdValidator.getCurrentCVD('BTCUSDT', 120000); // 2 min window
      const cvd5min = cvdValidator.getCurrentCVD('BTCUSDT', 300000); // 5 min window
      
      expect(cvd2min).toBeCloseTo(-2505, 0); // Only recent trade
      expect(cvd5min).toBeCloseTo(2495, 0); // Both trades: 5000 - 2505 = 2495
    });
  });

  describe('utility methods', () => {
    it('should clear history for specific symbol', () => {
      const btcTrade = createTrade('BTCUSDT', 50000, 0.1, Date.now(), false);
      const ethTrade = createTrade('ETHUSDT', 3000, 1.0, Date.now(), true);
      
      cvdValidator.recordTrade(btcTrade);
      cvdValidator.recordTrade(ethTrade);
      
      cvdValidator.clearHistory('BTCUSDT');
      
      expect(cvdValidator.getTradeHistory('BTCUSDT')).toHaveLength(0);
      expect(cvdValidator.getTradeHistory('ETHUSDT')).toHaveLength(1);
    });

    it('should provide history statistics', () => {
      const trades = [
        createTrade('BTCUSDT', 50000, 0.1, Date.now(), false),
        createTrade('BTCUSDT', 50100, 0.05, Date.now(), true),
        createTrade('ETHUSDT', 3000, 1.0, Date.now(), false)
      ];
      
      trades.forEach(trade => cvdValidator.recordTrade(trade));
      
      const stats = cvdValidator.getHistoryStats();
      expect(stats.totalSymbols).toBe(2);
      expect(stats.totalTrades).toBe(3);
      expect(stats.memoryUsage).toContain('KB');
    });

    it('should handle empty history gracefully', () => {
      const stats = cvdValidator.getHistoryStats();
      expect(stats.totalSymbols).toBe(0);
      expect(stats.totalTrades).toBe(0);
      expect(stats.memoryUsage).toBe('0.0 KB');
    });
  });

  describe('edge cases', () => {
    it('should handle zero quantity trades', () => {
      const trade = createTrade('BTCUSDT', 50000, 0, Date.now(), false);
      cvdValidator.recordTrade(trade);
      
      const cvd = cvdValidator.getCurrentCVD('BTCUSDT');
      expect(cvd).toBe(0);
    });

    it('should handle very small CVD values in divergence detection', () => {
      const prices = [100, 95, 90];
      const cvdValues = [0.001, 0.0005, 0.0008]; // Very small values
      
      const absorption = cvdValidator.detectAbsorption(prices, cvdValues);
      expect(absorption).not.toBeNull(); // Should still detect pattern
      expect(absorption!.confidence).toBeGreaterThan(0);
    });

    it('should handle identical price values', () => {
      const prices = [100, 100, 100];
      const cvdValues = [-1000, -1500, -1200];
      
      const absorption = cvdValidator.detectAbsorption(prices, cvdValues);
      expect(absorption).toBeNull(); // No price movement = no pattern
    });

    it('should handle identical CVD values', () => {
      const prices = [100, 95, 90];
      const cvdValues = [-1000, -1000, -1000];
      
      const absorption = cvdValidator.detectAbsorption(prices, cvdValues);
      expect(absorption).toBeNull(); // No CVD movement = no pattern
    });
  });
});