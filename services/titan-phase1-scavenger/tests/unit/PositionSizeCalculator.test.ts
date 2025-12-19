/**
 * Unit Tests for PositionSizeCalculator
 * 
 * Tests Kelly Criterion position sizing with safety factor and caps
 */

import { PositionSizeCalculator, PositionSizeParams } from '../../src/calculators/PositionSizeCalculator';

describe('PositionSizeCalculator', () => {
  describe('calcPositionSize', () => {
    it('should calculate position size using Kelly Criterion', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 90,
        leverage: 10,
        stopLossPercent: 0.01,  // 1%
        targetPercent: 0.03,    // 3%
        maxPositionSizePercent: 0.5,  // 50%
      };
      
      // Kelly% = 0.90 - ((1-0.90) / 3) = 0.90 - 0.0333 = 0.8667
      // Quarter-Kelly = 0.8667 * 0.25 = 0.2167
      // Position = $1000 * 0.2167 = $216.70
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBeCloseTo(216.67, 1);
    });
    
    it('should apply 25% safety factor (Quarter-Kelly)', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 95,
        leverage: 20,
        stopLossPercent: 0.01,  // 1%
        targetPercent: 0.05,    // 5%
        maxPositionSizePercent: 0.5,
      };
      
      // Kelly% = 0.95 - ((1-0.95) / 5) = 0.95 - 0.01 = 0.94
      // Quarter-Kelly = 0.94 * 0.25 = 0.235
      // Position = $1000 * 0.235 = $235
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBeCloseTo(235, 0);
    });
    
    it('should cap position size at maxPositionSizePercent', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 95,
        leverage: 20,
        stopLossPercent: 0.01,
        targetPercent: 0.05,
        maxPositionSizePercent: 0.1,  // 10% cap
      };
      
      // Kelly would give ~$235, but cap is $100
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBe(100);
    });
    
    it('should return 0 for zero equity', () => {
      const params: PositionSizeParams = {
        equity: 0,
        confidence: 90,
        leverage: 10,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBe(0);
    });
    
    it('should return 0 for negative equity', () => {
      const params: PositionSizeParams = {
        equity: -1000,
        confidence: 90,
        leverage: 10,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBe(0);
    });
    
    it('should return 0 for invalid confidence (0)', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 0,
        leverage: 10,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBe(0);
    });
    
    it('should return 0 for invalid confidence (>100)', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 101,
        leverage: 10,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBe(0);
    });
    
    it('should return 0 for zero stop loss', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 90,
        leverage: 10,
        stopLossPercent: 0,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBe(0);
    });
    
    it('should return 0 for zero target', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 90,
        leverage: 10,
        stopLossPercent: 0.01,
        targetPercent: 0,
        maxPositionSizePercent: 0.5,
      };
      
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBe(0);
    });
    
    it('should return 0 for zero leverage', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 90,
        leverage: 0,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBe(0);
    });
    
    it('should handle low confidence (80%)', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 80,
        leverage: 12,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      // Kelly% = 0.80 - ((1-0.80) / 3) = 0.80 - 0.0667 = 0.7333
      // Quarter-Kelly = 0.7333 * 0.25 = 0.1833
      // Position = $1000 * 0.1833 = $183.30
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBeCloseTo(183.33, 1);
    });
    
    it('should handle high confidence (95%)', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 95,
        leverage: 20,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      // Kelly% = 0.95 - ((1-0.95) / 3) = 0.95 - 0.0167 = 0.9333
      // Quarter-Kelly = 0.9333 * 0.25 = 0.2333
      // Position = $1000 * 0.2333 = $233.30
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBeCloseTo(233.33, 1);
    });
    
    it('should handle different R:R ratios', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 85,
        leverage: 12,
        stopLossPercent: 0.015,  // 1.5%
        targetPercent: 0.03,     // 3% (2:1 R:R)
        maxPositionSizePercent: 0.5,
      };
      
      // Kelly% = 0.85 - ((1-0.85) / 2) = 0.85 - 0.075 = 0.775
      // Quarter-Kelly = 0.775 * 0.25 = 0.19375
      // Position = $1000 * 0.19375 = $193.75
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBeCloseTo(193.75, 1);
    });
  });
  
  describe('calcPositionSizeWithLeverage', () => {
    it('should calculate margin required and notional size', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 90,
        leverage: 10,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const result = PositionSizeCalculator.calcPositionSizeWithLeverage(params);
      
      // Margin required: ~$216.67
      expect(result.marginRequired).toBeCloseTo(216.67, 1);
      
      // Notional size: $216.67 * 10 = $2166.70
      expect(result.notionalSize).toBeCloseTo(2166.7, 1);
    });
    
    it('should handle different leverage values', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 90,
        leverage: 20,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const result = PositionSizeCalculator.calcPositionSizeWithLeverage(params);
      
      // Margin required: ~$216.67
      expect(result.marginRequired).toBeCloseTo(216.67, 1);
      
      // Notional size: $216.67 * 20 = $4333.40
      expect(result.notionalSize).toBeCloseTo(4333.4, 1);
    });
  });
  
  describe('calcPositionSizeInUnits', () => {
    it('should calculate position size in units', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 90,
        leverage: 10,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const currentPrice = 50000;  // BTC at $50,000
      
      const units = PositionSizeCalculator.calcPositionSizeInUnits(params, currentPrice);
      
      // Notional size: ~$2166.70
      // Units: $2166.70 / $50,000 = 0.043334 BTC
      expect(units).toBeCloseTo(0.043334, 5);
    });
    
    it('should return 0 for zero price', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 90,
        leverage: 10,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const units = PositionSizeCalculator.calcPositionSizeInUnits(params, 0);
      
      expect(units).toBe(0);
    });
    
    it('should return 0 for negative price', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 90,
        leverage: 10,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const units = PositionSizeCalculator.calcPositionSizeInUnits(params, -50000);
      
      expect(units).toBe(0);
    });
    
    it('should round to 8 decimal places', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 90,
        leverage: 10,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const currentPrice = 33333.33333333;
      
      const units = PositionSizeCalculator.calcPositionSizeInUnits(params, currentPrice);
      
      // Should be rounded to 8 decimal places
      const decimalPlaces = units.toString().split('.')[1]?.length || 0;
      expect(decimalPlaces).toBeLessThanOrEqual(8);
    });
  });
  
  describe('getKellyPercent', () => {
    it('should calculate raw Kelly percentage', () => {
      const kellyPercent = PositionSizeCalculator.getKellyPercent(90, 0.01, 0.03);
      
      // Kelly% = 0.90 - ((1-0.90) / 3) = 0.8667
      expect(kellyPercent).toBeCloseTo(0.8667, 4);
    });
    
    it('should return 0 for invalid confidence', () => {
      const kellyPercent = PositionSizeCalculator.getKellyPercent(0, 0.01, 0.03);
      
      expect(kellyPercent).toBe(0);
    });
    
    it('should return 0 for zero stop loss', () => {
      const kellyPercent = PositionSizeCalculator.getKellyPercent(90, 0, 0.03);
      
      expect(kellyPercent).toBe(0);
    });
  });
  
  describe('getSafeKellyPercent', () => {
    it('should calculate safe Kelly percentage (Quarter-Kelly)', () => {
      const safeKellyPercent = PositionSizeCalculator.getSafeKellyPercent(90, 0.01, 0.03);
      
      // Kelly% = 0.8667
      // Quarter-Kelly = 0.8667 * 0.25 = 0.2167
      expect(safeKellyPercent).toBeCloseTo(0.2167, 4);
    });
    
    it('should return 0 for invalid inputs', () => {
      const safeKellyPercent = PositionSizeCalculator.getSafeKellyPercent(0, 0.01, 0.03);
      
      expect(safeKellyPercent).toBe(0);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle very small equity', () => {
      const params: PositionSizeParams = {
        equity: 10,
        confidence: 90,
        leverage: 10,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      // Should still calculate proportionally
      expect(positionSize).toBeCloseTo(2.17, 2);
    });
    
    it('should handle very large equity', () => {
      const params: PositionSizeParams = {
        equity: 1000000,
        confidence: 90,
        leverage: 10,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
        maxPositionSizePercent: 0.5,
      };
      
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      // Should still calculate proportionally
      expect(positionSize).toBeCloseTo(216667, 0);
    });
    
    it('should handle negative Kelly (poor R:R)', () => {
      const params: PositionSizeParams = {
        equity: 1000,
        confidence: 50,  // 50% win rate
        leverage: 10,
        stopLossPercent: 0.03,  // 3% stop
        targetPercent: 0.03,    // 3% target (1:1 R:R)
        maxPositionSizePercent: 0.5,
      };
      
      // Kelly% = 0.50 - ((1-0.50) / 1) = 0.50 - 0.50 = 0
      // Should return 0 (no edge)
      const positionSize = PositionSizeCalculator.calcPositionSize(params);
      
      expect(positionSize).toBe(0);
    });
  });
});
