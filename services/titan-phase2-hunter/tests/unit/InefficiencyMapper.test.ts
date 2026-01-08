/**
 * Unit tests for InefficiencyMapper
 * 
 * Tests FVG detection, Order Block detection, Liquidity Pool detection,
 * and POI validation functionality.
 */

import { InefficiencyMapper } from '../../src/engine/InefficiencyMapper';
import { OHLCV, BOS, Fractal, FVG, OrderBlock, LiquidityPool } from '../../src/types';

describe('InefficiencyMapper', () => {
  let mapper: InefficiencyMapper;

  beforeEach(() => {
    mapper = new InefficiencyMapper();
  });

  describe('detectFVG', () => {
    it('should detect bullish FVG when candle 1 high < candle 3 low', () => {
      const candles: OHLCV[] = [
        { timestamp: 1000, open: 100, high: 102, low: 99, close: 101, volume: 1000 },
        { timestamp: 2000, open: 101, high: 103, low: 100, close: 102, volume: 1000 },
        { timestamp: 3000, open: 105, high: 107, low: 104, close: 106, volume: 1000 }
      ];

      const fvgs = mapper.detectFVG(candles);

      expect(fvgs).toHaveLength(1);
      expect(fvgs[0].type).toBe('BULLISH');
      expect(fvgs[0].top).toBe(104); // candle 3 low
      expect(fvgs[0].bottom).toBe(102); // candle 1 high
      expect(fvgs[0].midpoint).toBe(103);
      expect(fvgs[0].mitigated).toBe(false);
    });

    it('should detect bearish FVG when candle 1 low > candle 3 high', () => {
      const candles: OHLCV[] = [
        { timestamp: 1000, open: 100, high: 102, low: 99, close: 101, volume: 1000 },
        { timestamp: 2000, open: 101, high: 103, low: 100, close: 102, volume: 1000 },
        { timestamp: 3000, open: 95, high: 97, low: 94, close: 96, volume: 1000 }
      ];

      const fvgs = mapper.detectFVG(candles);

      expect(fvgs).toHaveLength(1);
      expect(fvgs[0].type).toBe('BEARISH');
      expect(fvgs[0].top).toBe(99); // candle 1 low
      expect(fvgs[0].bottom).toBe(97); // candle 3 high
      expect(fvgs[0].midpoint).toBe(98);
      expect(fvgs[0].mitigated).toBe(false);
    });

    it('should return empty array when no FVGs exist', () => {
      const candles: OHLCV[] = [
        { timestamp: 1000, open: 100, high: 102, low: 99, close: 101, volume: 1000 },
        { timestamp: 2000, open: 101, high: 103, low: 100, close: 102, volume: 1000 },
        { timestamp: 3000, open: 102, high: 104, low: 101, close: 103, volume: 1000 }
      ];

      const fvgs = mapper.detectFVG(candles);

      expect(fvgs).toHaveLength(0);
    });

    it('should return empty array when insufficient candles', () => {
      const candles: OHLCV[] = [
        { timestamp: 1000, open: 100, high: 102, low: 99, close: 101, volume: 1000 }
      ];

      const fvgs = mapper.detectFVG(candles);

      expect(fvgs).toHaveLength(0);
    });
  });

  describe('detectOrderBlock', () => {
    const candles: OHLCV[] = [
      { timestamp: 1000, open: 100, high: 102, low: 99, close: 99.5, volume: 1000 }, // down candle
      { timestamp: 2000, open: 99.5, high: 101, low: 98, close: 100.5, volume: 1200 }, // up candle
      { timestamp: 3000, open: 100.5, high: 103, low: 100, close: 102, volume: 1100 }, // BOS candle
    ];

    it('should detect bullish order block for bullish BOS', () => {
      const bos: BOS[] = [{
        direction: 'BULLISH',
        price: 102,
        barIndex: 2,
        timestamp: 3000,
        fractalsBreached: []
      }];

      const orderBlocks = mapper.detectOrderBlock(candles, bos);

      expect(orderBlocks).toHaveLength(1);
      expect(orderBlocks[0].type).toBe('BULLISH');
      expect(orderBlocks[0].high).toBe(102); // last down candle high
      expect(orderBlocks[0].low).toBe(99); // last down candle low
      expect(orderBlocks[0].barIndex).toBe(0);
      expect(orderBlocks[0].mitigated).toBe(false);
      expect(orderBlocks[0].confidence).toBeGreaterThan(0);
    });

    it('should detect bearish order block for bearish BOS', () => {
      const bearishCandles: OHLCV[] = [
        { timestamp: 1000, open: 100, high: 102, low: 99, close: 101.5, volume: 1000 }, // up candle
        { timestamp: 2000, open: 101.5, high: 103, low: 100, close: 99.5, volume: 1200 }, // down candle
        { timestamp: 3000, open: 99.5, high: 100, low: 97, close: 98, volume: 1100 }, // BOS candle
      ];

      const bos: BOS[] = [{
        direction: 'BEARISH',
        price: 98,
        barIndex: 2,
        timestamp: 3000,
        fractalsBreached: []
      }];

      const orderBlocks = mapper.detectOrderBlock(bearishCandles, bos);

      expect(orderBlocks).toHaveLength(1);
      expect(orderBlocks[0].type).toBe('BEARISH');
      expect(orderBlocks[0].high).toBe(102); // last up candle high
      expect(orderBlocks[0].low).toBe(99); // last up candle low
      expect(orderBlocks[0].barIndex).toBe(0);
      expect(orderBlocks[0].mitigated).toBe(false);
    });

    it('should return empty array when no BOS events', () => {
      const orderBlocks = mapper.detectOrderBlock(candles, []);

      expect(orderBlocks).toHaveLength(0);
    });
  });

  describe('detectLiquidityPools', () => {
    const candles: OHLCV[] = [
      { timestamp: 1000, open: 100, high: 102, low: 99, close: 101, volume: 1000 },
      { timestamp: 2000, open: 101, high: 103, low: 100, close: 102, volume: 1500 },
      { timestamp: 3000, open: 102, high: 104, low: 101, close: 103, volume: 800 },
    ];

    it('should detect liquidity pools at fractal points', () => {
      const fractals: Fractal[] = [{
        type: 'HIGH',
        price: 103,
        barIndex: 1,
        timestamp: 2000,
        confirmed: true
      }];

      // Mock Date.now to control age calculation
      const mockNow = 2000 + (24 * 60 * 60 * 1000); // 24 hours later
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      const pools = mapper.detectLiquidityPools(candles, fractals);

      expect(pools).toHaveLength(1);
      expect(pools[0].type).toBe('HIGH');
      expect(pools[0].price).toBe(103);
      expect(pools[0].strength).toBeGreaterThan(20);
      expect(pools[0].swept).toBe(false);

      jest.restoreAllMocks();
    });

    it('should filter out weak liquidity pools', () => {
      const fractals: Fractal[] = [{
        type: 'LOW',
        price: 99,
        barIndex: 0,
        timestamp: 1000,
        confirmed: true
      }];

      // Mock Date.now to simulate very old fractal (low strength)
      const mockNow = 1000 + (100 * 24 * 60 * 60 * 1000); // 100 days later
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      const pools = mapper.detectLiquidityPools(candles, fractals);

      expect(pools).toHaveLength(0); // Should be filtered out due to low strength

      jest.restoreAllMocks();
    });

    it('should merge nearby liquidity pools', () => {
      const fractals: Fractal[] = [
        {
          type: 'HIGH',
          price: 103,
          barIndex: 1,
          timestamp: 2000,
          confirmed: true
        },
        {
          type: 'HIGH',
          price: 103.2, // Within 1% of first fractal
          barIndex: 2,
          timestamp: 3000,
          confirmed: true
        }
      ];

      // Mock Date.now to control age calculation
      const mockNow = 3000 + (12 * 60 * 60 * 1000); // 12 hours later
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      const pools = mapper.detectLiquidityPools(candles, fractals);

      expect(pools).toHaveLength(1); // Should be merged into one pool
      expect(pools[0].type).toBe('HIGH');
      expect(pools[0].price).toBeCloseTo(103.1, 1); // Average price
      expect(pools[0].strength).toBeGreaterThan(40); // Combined strength

      jest.restoreAllMocks();
    });
  });

  describe('validatePOI', () => {
    it('should invalidate bullish FVG when price fills the gap', () => {
      const fvg: FVG = {
        type: 'BULLISH',
        top: 105,
        bottom: 103,
        midpoint: 104,
        barIndex: 2,
        timestamp: 3000,
        mitigated: false,
        fillPercent: 0
      };

      const currentPrice = 102; // Below bottom, gap filled

      const isValid = mapper.validatePOI(fvg, currentPrice);

      expect(isValid).toBe(false);
    });

    it('should invalidate bearish FVG when price fills the gap', () => {
      const fvg: FVG = {
        type: 'BEARISH',
        top: 105,
        bottom: 103,
        midpoint: 104,
        barIndex: 2,
        timestamp: 3000,
        mitigated: false,
        fillPercent: 0
      };

      const currentPrice = 106; // Above top, gap filled

      const isValid = mapper.validatePOI(fvg, currentPrice);

      expect(isValid).toBe(false);
    });

    it('should invalidate bullish order block when price closes below low', () => {
      const orderBlock: OrderBlock = {
        type: 'BULLISH',
        high: 102,
        low: 99,
        barIndex: 0,
        timestamp: 1000,
        mitigated: false,
        confidence: 90
      };

      const currentPrice = 98; // Below low

      const isValid = mapper.validatePOI(orderBlock, currentPrice);

      expect(isValid).toBe(false);
    });

    it('should invalidate bearish order block when price closes above high', () => {
      const orderBlock: OrderBlock = {
        type: 'BEARISH',
        high: 102,
        low: 99,
        barIndex: 0,
        timestamp: 1000,
        mitigated: false,
        confidence: 90
      };

      const currentPrice = 103; // Above high

      const isValid = mapper.validatePOI(orderBlock, currentPrice);

      expect(isValid).toBe(false);
    });

    it('should invalidate liquidity pool when swept', () => {
      const pool: LiquidityPool = {
        type: 'HIGH',
        price: 100,
        strength: 80,
        barIndex: 1,
        timestamp: 2000,
        swept: false
      };

      const currentPrice = 100.2; // Above high pool with sweep threshold

      const isValid = mapper.validatePOI(pool, currentPrice);

      expect(isValid).toBe(false);
    });

    it('should apply age decay to order block confidence', () => {
      const orderBlock: OrderBlock = {
        type: 'BULLISH',
        high: 102,
        low: 99,
        barIndex: 0,
        timestamp: Date.now() - (48 * 60 * 60 * 1000), // 48 hours ago
        mitigated: false,
        confidence: 90
      };

      const currentPrice = 101; // Valid price

      const isValid = mapper.validatePOI(orderBlock, currentPrice);

      expect(isValid).toBe(true);
      expect(orderBlock.confidence).toBeLessThan(90); // Should be decayed
    });
  });

  describe('getAllPOIs', () => {
    it('should return all POI types and filter valid ones', () => {
      const candles: OHLCV[] = [
        { timestamp: 1000, open: 100, high: 102, low: 99, close: 99.5, volume: 1000 },
        { timestamp: 2000, open: 99.5, high: 101, low: 98, close: 100.5, volume: 1200 },
        { timestamp: 3000, open: 105, high: 107, low: 104, close: 106, volume: 1100 }, // Creates FVG
      ];

      const bos: BOS[] = [{
        direction: 'BULLISH',
        price: 106,
        barIndex: 2,
        timestamp: 3000,
        fractalsBreached: []
      }];

      const fractals: Fractal[] = [{
        type: 'HIGH',
        price: 102,
        barIndex: 0,
        timestamp: 1000,
        confirmed: true
      }];

      const currentPrice = 105;

      // Mock Date.now for liquidity pool calculation
      jest.spyOn(Date, 'now').mockReturnValue(3000 + (12 * 60 * 60 * 1000));

      const result = mapper.getAllPOIs(candles, bos, fractals, currentPrice);

      expect(result.fvgs.length).toBeGreaterThan(0);
      expect(result.orderBlocks.length).toBeGreaterThan(0);
      expect(result.validPOIs.length).toBeGreaterThan(0);

      jest.restoreAllMocks();
    });
  });

  describe('findAlignedPOIs', () => {
    it('should find POIs that align within proximity threshold', () => {
      const fvg: FVG = {
        type: 'BULLISH',
        top: 105,
        bottom: 103,
        midpoint: 104,
        barIndex: 2,
        timestamp: 3000,
        mitigated: false,
        fillPercent: 0
      };

      const orderBlock: OrderBlock = {
        type: 'BULLISH',
        high: 104.2,
        low: 103.8,
        barIndex: 1,
        timestamp: 2000,
        mitigated: false,
        confidence: 90
      };

      const pois = [fvg, orderBlock];

      const alignedGroups = mapper.findAlignedPOIs(pois, 0.01); // 1% threshold

      expect(alignedGroups).toHaveLength(1);
      expect(alignedGroups[0]).toHaveLength(2);
      expect(alignedGroups[0]).toContain(fvg);
      expect(alignedGroups[0]).toContain(orderBlock);
    });

    it('should not group POIs that are too far apart', () => {
      const fvg: FVG = {
        type: 'BULLISH',
        top: 105,
        bottom: 103,
        midpoint: 104,
        barIndex: 2,
        timestamp: 3000,
        mitigated: false,
        fillPercent: 0
      };

      const orderBlock: OrderBlock = {
        type: 'BULLISH',
        high: 110,
        low: 108,
        barIndex: 1,
        timestamp: 2000,
        mitigated: false,
        confidence: 90
      };

      const pois = [fvg, orderBlock];

      const alignedGroups = mapper.findAlignedPOIs(pois, 0.005); // 0.5% threshold

      expect(alignedGroups).toHaveLength(0); // No groups should be formed
    });
  });
});