/**
 * Unit Tests for FractalMath Engine
 * 
 * Tests all core fractal detection and market structure analysis functions
 * using known data patterns and edge cases.
 */

import { FractalMath } from '../../src/engine/FractalMath';
import { OHLCV, Fractal, BOS, TrendState } from '../../src/types';

describe('FractalMath', () => {
  // Helper function to create test OHLCV data
  const createCandle = (timestamp: number, open: number, high: number, low: number, close: number, volume: number = 1000): OHLCV => ({
    timestamp,
    open,
    high,
    low,
    close,
    volume
  });

  describe('detectFractals', () => {
    it('should detect swing high fractal', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 102),  // i=0
        createCandle(2, 102, 108, 98, 106),  // i=1
        createCandle(3, 106, 115, 104, 112), // i=2 - Swing High (115 > all neighbors)
        createCandle(4, 112, 110, 105, 108), // i=3
        createCandle(5, 108, 109, 103, 107)  // i=4
      ];

      const fractals = FractalMath.detectFractals(candles);
      
      expect(fractals).toHaveLength(1);
      expect(fractals[0].type).toBe('HIGH');
      expect(fractals[0].price).toBe(115);
      expect(fractals[0].barIndex).toBe(2);
      expect(fractals[0].confirmed).toBe(true);
    });

    it('should detect swing low fractal', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 102),  // i=0
        createCandle(2, 102, 108, 98, 106),  // i=1
        createCandle(3, 106, 110, 85, 88),   // i=2 - Swing Low (85 < all neighbors)
        createCandle(4, 88, 95, 87, 92),     // i=3
        createCandle(5, 92, 96, 90, 94)      // i=4
      ];

      const fractals = FractalMath.detectFractals(candles);
      
      // Should detect both high (110) and low (85) fractals at index 2
      expect(fractals).toHaveLength(2);
      const lowFractal = fractals.find(f => f.type === 'LOW');
      expect(lowFractal).toBeDefined();
      expect(lowFractal!.price).toBe(85);
      expect(lowFractal!.barIndex).toBe(2);
      expect(lowFractal!.confirmed).toBe(true);
    });

    it('should detect both high and low fractals', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 102),  // i=0
        createCandle(2, 102, 108, 98, 106),  // i=1
        createCandle(3, 106, 115, 104, 112), // i=2 - Swing High
        createCandle(4, 112, 110, 105, 108), // i=3
        createCandle(5, 108, 109, 103, 107), // i=4
        createCandle(6, 107, 110, 102, 105), // i=5
        createCandle(7, 105, 108, 85, 88),   // i=6 - Swing Low
        createCandle(8, 88, 95, 87, 92),     // i=7
        createCandle(9, 92, 96, 90, 94)      // i=8
      ];

      const fractals = FractalMath.detectFractals(candles);
      
      expect(fractals).toHaveLength(2);
      expect(fractals[0].type).toBe('HIGH');
      expect(fractals[0].price).toBe(115);
      expect(fractals[1].type).toBe('LOW');
      expect(fractals[1].price).toBe(85);
    });

    it('should return empty array for insufficient candles', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 102),
        createCandle(2, 102, 108, 98, 106)
      ];

      const fractals = FractalMath.detectFractals(candles);
      expect(fractals).toHaveLength(0);
    });

    it('should not detect fractal when pattern is not met', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 102),
        createCandle(2, 102, 108, 98, 106),
        createCandle(3, 106, 110, 104, 108), // Not a fractal (110 not > 108)
        createCandle(4, 108, 112, 105, 110),
        createCandle(5, 110, 115, 108, 112)
      ];

      const fractals = FractalMath.detectFractals(candles);
      expect(fractals).toHaveLength(0);
    });
  });

  describe('detectBOS', () => {
    it('should detect bullish BOS when close breaks above swing high', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 102),
        createCandle(2, 102, 108, 98, 106),
        createCandle(3, 106, 115, 104, 112), // Swing High at 115 (index 2)
        createCandle(4, 112, 110, 105, 108),
        createCandle(5, 108, 109, 103, 107),
        createCandle(6, 107, 120, 105, 118)  // Close at 118 > 115 (BOS at index 5)
      ];

      const fractals = FractalMath.detectFractals(candles);
      console.log('Detected fractals:', fractals);
      
      const bosEvents = FractalMath.detectBOS(candles, fractals);
      console.log('BOS events:', bosEvents);
      
      expect(bosEvents).toHaveLength(1);
      expect(bosEvents[0].direction).toBe('BULLISH');
      expect(bosEvents[0].price).toBe(118);
      expect(bosEvents[0].fractalsBreached).toHaveLength(1);
      expect(bosEvents[0].fractalsBreached[0].price).toBe(115);
    });

    it('should detect bearish BOS when close breaks below swing low', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 102),
        createCandle(2, 102, 108, 98, 106),
        createCandle(3, 106, 110, 85, 88),   // Swing Low at 85
        createCandle(4, 88, 95, 87, 92),
        createCandle(5, 92, 96, 90, 94),
        createCandle(6, 94, 90, 80, 82)      // Close at 82 < 85 (BOS)
      ];

      const fractals = FractalMath.detectFractals(candles);
      const bosEvents = FractalMath.detectBOS(candles, fractals);
      
      expect(bosEvents).toHaveLength(1);
      expect(bosEvents[0].direction).toBe('BEARISH');
      expect(bosEvents[0].price).toBe(82);
      expect(bosEvents[0].fractalsBreached).toHaveLength(1);
      expect(bosEvents[0].fractalsBreached[0].price).toBe(85);
    });

    it('should return empty array when no fractals provided', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 102),
        createCandle(2, 102, 108, 98, 106)
      ];

      const bosEvents = FractalMath.detectBOS(candles, []);
      expect(bosEvents).toHaveLength(0);
    });
  });

  describe('detectMSS', () => {
    it('should detect bearish MSS when bullish trend reverses', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 102),
        createCandle(2, 102, 108, 98, 106),
        createCandle(3, 106, 110, 85, 88),   // Swing Low
        createCandle(4, 88, 95, 87, 92),
        createCandle(5, 92, 96, 90, 94),
        createCandle(6, 94, 90, 80, 82)      // Bearish BOS
      ];

      const fractals = FractalMath.detectFractals(candles);
      const mss = FractalMath.detectMSS(candles, fractals, 'BULL');
      
      expect(mss).not.toBeNull();
      expect(mss!.direction).toBe('BEARISH');
      expect(mss!.price).toBe(82);
      expect(mss!.significance).toBe(80);
    });

    it('should detect bullish MSS when bearish trend reverses', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 102),
        createCandle(2, 102, 108, 98, 106),
        createCandle(3, 106, 115, 104, 112), // Swing High
        createCandle(4, 112, 110, 105, 108),
        createCandle(5, 108, 109, 103, 107),
        createCandle(6, 107, 120, 105, 118)  // Bullish BOS
      ];

      const fractals = FractalMath.detectFractals(candles);
      const mss = FractalMath.detectMSS(candles, fractals, 'BEAR');
      
      expect(mss).not.toBeNull();
      expect(mss!.direction).toBe('BULLISH');
      expect(mss!.price).toBe(118);
      expect(mss!.significance).toBe(80);
    });

    it('should return null when no MSS occurs', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 102),
        createCandle(2, 102, 108, 98, 106),
        createCandle(3, 106, 115, 104, 112), // Swing High
        createCandle(4, 112, 110, 105, 108),
        createCandle(5, 108, 109, 103, 107),
        createCandle(6, 107, 120, 105, 118)  // Bullish BOS (same direction as trend)
      ];

      const fractals = FractalMath.detectFractals(candles);
      const mss = FractalMath.detectMSS(candles, fractals, 'BULL'); // Same direction
      
      expect(mss).toBeNull();
    });
  });

  describe('calcDealingRange', () => {
    it('should calculate dealing range with premium/discount zones', () => {
      const fractals: Fractal[] = [
        {
          type: 'HIGH',
          price: 120,
          barIndex: 2,
          timestamp: 1000,
          confirmed: true
        },
        {
          type: 'LOW',
          price: 80,
          barIndex: 6,
          timestamp: 2000,
          confirmed: true
        }
      ];

      const dealingRange = FractalMath.calcDealingRange(fractals);
      
      expect(dealingRange.high).toBe(120);
      expect(dealingRange.low).toBe(80);
      expect(dealingRange.range).toBe(40);
      expect(dealingRange.midpoint).toBe(100); // 80 + (40 * 0.5)
      expect(dealingRange.premiumThreshold).toBe(100);
      expect(dealingRange.discountThreshold).toBe(100);
    });

    it('should throw error when insufficient fractals', () => {
      expect(() => {
        FractalMath.calcDealingRange([]);
      }).toThrow('Insufficient fractals to calculate dealing range');
    });

    it('should handle multiple fractals and find highest/lowest', () => {
      const fractals: Fractal[] = [
        { type: 'HIGH', price: 110, barIndex: 1, timestamp: 1000, confirmed: true },
        { type: 'HIGH', price: 125, barIndex: 3, timestamp: 2000, confirmed: true }, // Highest
        { type: 'HIGH', price: 115, barIndex: 5, timestamp: 3000, confirmed: true },
        { type: 'LOW', price: 85, barIndex: 2, timestamp: 1500, confirmed: true },
        { type: 'LOW', price: 75, barIndex: 4, timestamp: 2500, confirmed: true },  // Lowest
        { type: 'LOW', price: 90, barIndex: 6, timestamp: 3500, confirmed: true }
      ];

      const dealingRange = FractalMath.calcDealingRange(fractals);
      
      expect(dealingRange.high).toBe(125);
      expect(dealingRange.low).toBe(75);
      expect(dealingRange.range).toBe(50);
      expect(dealingRange.midpoint).toBe(100); // 75 + (50 * 0.5)
    });
  });

  describe('getTrendState', () => {
    it('should return BULL for consistent bullish BOS', () => {
      const bosEvents: BOS[] = [
        {
          direction: 'BULLISH',
          price: 105,
          barIndex: 3,
          timestamp: 1000,
          fractalsBreached: []
        },
        {
          direction: 'BULLISH',
          price: 110,
          barIndex: 6,
          timestamp: 2000,
          fractalsBreached: []
        },
        {
          direction: 'BULLISH',
          price: 115,
          barIndex: 9,
          timestamp: 3000,
          fractalsBreached: []
        }
      ];

      const trendState = FractalMath.getTrendState(bosEvents);
      expect(trendState).toBe('BULL');
    });

    it('should return BEAR for consistent bearish BOS', () => {
      const bosEvents: BOS[] = [
        {
          direction: 'BEARISH',
          price: 95,
          barIndex: 3,
          timestamp: 1000,
          fractalsBreached: []
        },
        {
          direction: 'BEARISH',
          price: 90,
          barIndex: 6,
          timestamp: 2000,
          fractalsBreached: []
        },
        {
          direction: 'BEARISH',
          price: 85,
          barIndex: 9,
          timestamp: 3000,
          fractalsBreached: []
        }
      ];

      const trendState = FractalMath.getTrendState(bosEvents);
      expect(trendState).toBe('BEAR');
    });

    it('should return RANGE for mixed BOS', () => {
      const bosEvents: BOS[] = [
        {
          direction: 'BULLISH',
          price: 105,
          barIndex: 3,
          timestamp: 1000,
          fractalsBreached: []
        },
        {
          direction: 'BEARISH',
          price: 95,
          barIndex: 6,
          timestamp: 2000,
          fractalsBreached: []
        }
      ];

      const trendState = FractalMath.getTrendState(bosEvents);
      expect(trendState).toBe('RANGE');
    });

    it('should return RANGE for insufficient BOS events', () => {
      const bosEvents: BOS[] = [
        {
          direction: 'BULLISH',
          price: 105,
          barIndex: 3,
          timestamp: 1000,
          fractalsBreached: []
        }
      ];

      const trendState = FractalMath.getTrendState(bosEvents);
      expect(trendState).toBe('RANGE');
    });
  });

  describe('validateCandles', () => {
    it('should validate correct OHLCV data', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 102),
        createCandle(2, 102, 108, 98, 106),
        createCandle(3, 106, 115, 104, 112),
        createCandle(4, 112, 118, 108, 115),
        createCandle(5, 115, 120, 112, 118)
      ];

      expect(() => FractalMath.validateCandles(candles)).not.toThrow();
    });

    it('should throw error for insufficient candles', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 102)
      ];

      expect(() => FractalMath.validateCandles(candles, 5)).toThrow('Insufficient candles');
    });

    it('should throw error for invalid high-low relationship', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 95, 105, 102) // high < low
      ];

      expect(() => FractalMath.validateCandles(candles, 1)).toThrow('high (95) < low (105)');
    });

    it('should throw error for close outside high-low range', () => {
      const candles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 110) // close > high
      ];

      expect(() => FractalMath.validateCandles(candles, 1)).toThrow('close (110) outside high-low range');
    });
  });

  describe('helper methods', () => {
    it('should get last fractal of specific type', () => {
      const fractals: Fractal[] = [
        { type: 'HIGH', price: 110, barIndex: 1, timestamp: 1000, confirmed: true },
        { type: 'LOW', price: 85, barIndex: 2, timestamp: 1500, confirmed: true },
        { type: 'HIGH', price: 125, barIndex: 3, timestamp: 2000, confirmed: true }
      ];

      const lastHigh = FractalMath.getLastFractal(fractals, 'HIGH');
      const lastLow = FractalMath.getLastFractal(fractals, 'LOW');

      expect(lastHigh?.price).toBe(125);
      expect(lastLow?.price).toBe(85);
    });

    it('should determine price location in dealing range', () => {
      const dealingRange = {
        high: 120,
        low: 80,
        midpoint: 100,
        premiumThreshold: 100,
        discountThreshold: 100,
        range: 40
      };

      expect(FractalMath.getPriceLocation(115, dealingRange)).toBe('PREMIUM');
      expect(FractalMath.getPriceLocation(85, dealingRange)).toBe('DISCOUNT');
      expect(FractalMath.getPriceLocation(100, dealingRange)).toBe('EQUILIBRIUM');
    });
  });
});