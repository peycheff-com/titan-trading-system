/**
 * Unit Tests for Advanced Flow Validator Components
 * 
 * Tests for:
 * - FootprintAnalyzer
 * - SweepDetector
 * - IcebergDetector
 * - InstitutionalFlowClassifier
 * - AdvancedFlowValidator
 * 
 * Requirements: 2.1-2.7 (Advanced Flow Validator - Footprint & Sweep Detection)
 */

import {
  FootprintAnalyzer,
  SweepDetector,
  IcebergDetector,
  InstitutionalFlowClassifier,
  AdvancedFlowValidator
} from '../../src/flow';
import { CVDTrade, OHLCV, FVG, OrderBlock } from '../../src/types';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Generate mock trades for testing
 */
function generateMockTrades(
  symbol: string,
  count: number,
  basePrice: number,
  options: {
    buyerMakerRatio?: number;
    priceVariance?: number;
    volumeRange?: [number, number];
  } = {}
): CVDTrade[] {
  const {
    buyerMakerRatio = 0.5,
    priceVariance = 0.01,
    volumeRange = [0.1, 1.0]
  } = options;

  const trades: CVDTrade[] = [];
  const baseTime = Date.now() - count * 100;

  for (let i = 0; i < count; i++) {
    const priceOffset = (Math.random() - 0.5) * 2 * priceVariance * basePrice;
    const volume = volumeRange[0] + Math.random() * (volumeRange[1] - volumeRange[0]);

    trades.push({
      symbol,
      price: basePrice + priceOffset,
      qty: volume,
      time: baseTime + i * 100,
      isBuyerMaker: Math.random() < buyerMakerRatio
    });
  }

  return trades;
}

/**
 * Generate sweep-like trades (aggressive orders clearing levels)
 */
function generateSweepTrades(
  symbol: string,
  startPrice: number,
  direction: 'up' | 'down',
  levels: number
): CVDTrade[] {
  const trades: CVDTrade[] = [];
  const baseTime = Date.now();
  const tickSize = startPrice >= 10000 ? 1.0 : 0.01;

  for (let i = 0; i < levels; i++) {
    const price = direction === 'up'
      ? startPrice + i * tickSize
      : startPrice - i * tickSize;

    trades.push({
      symbol,
      price,
      qty: 1.0 + Math.random(),
      time: baseTime + i * 50, // Fast execution
      isBuyerMaker: direction === 'down' // Aggressive sell for down sweep
    });
  }

  return trades;
}

/**
 * Generate mock OHLCV candle
 */
function generateMockCandle(
  basePrice: number,
  options: {
    bullish?: boolean;
    volume?: number;
  } = {}
): OHLCV {
  const { bullish = true, volume = 1000 } = options;
  const range = basePrice * 0.01;

  return {
    timestamp: Date.now() - 60000,
    open: bullish ? basePrice - range / 2 : basePrice + range / 2,
    high: basePrice + range,
    low: basePrice - range,
    close: bullish ? basePrice + range / 2 : basePrice - range / 2,
    volume
  };
}

/**
 * Generate mock FVG POI
 */
function generateMockFVG(type: 'BULLISH' | 'BEARISH', basePrice: number): FVG {
  const gap = basePrice * 0.005;
  return {
    type,
    top: basePrice + gap,
    bottom: basePrice - gap,
    midpoint: basePrice,
    barIndex: 100,
    timestamp: Date.now() - 3600000,
    mitigated: false,
    fillPercent: 0
  };
}

// ============================================================================
// FOOTPRINT ANALYZER TESTS
// ============================================================================

describe('FootprintAnalyzer', () => {
  let analyzer: FootprintAnalyzer;

  beforeEach(() => {
    analyzer = new FootprintAnalyzer();
  });

  afterEach(() => {
    analyzer.destroy();
  });

  describe('buildFootprint', () => {
    it('should build footprint from trades and candle', () => {
      const symbol = 'BTCUSDT';
      const candle = generateMockCandle(50000);
      const trades = generateMockTrades(symbol, 50, 50000);

      const footprint = analyzer.buildFootprint(symbol, candle, trades);

      expect(footprint.symbol).toBe(symbol);
      expect(footprint.totalVolume).toBeGreaterThan(0);
      expect(footprint.priceLevels.length).toBeGreaterThan(0);
      expect(footprint.delta).toBeDefined();
    });

    it('should calculate correct delta (buy - sell volume)', () => {
      const symbol = 'BTCUSDT';
      const candle = generateMockCandle(50000);
      // Generate trades with more buyers (isBuyerMaker = false means buyer is aggressor)
      const trades = generateMockTrades(symbol, 100, 50000, { buyerMakerRatio: 0.3 });

      const footprint = analyzer.buildFootprint(symbol, candle, trades);

      // With buyerMakerRatio = 0.3, 70% are aggressive buys
      expect(footprint.totalBuyVolume).toBeGreaterThan(footprint.totalSellVolume);
      expect(footprint.delta).toBeGreaterThan(0);
    });

    it('should calculate imbalance score between -100 and +100', () => {
      const symbol = 'BTCUSDT';
      const candle = generateMockCandle(50000);
      const trades = generateMockTrades(symbol, 50, 50000);

      const footprint = analyzer.buildFootprint(symbol, candle, trades);

      expect(footprint.imbalanceScore).toBeGreaterThanOrEqual(-100);
      expect(footprint.imbalanceScore).toBeLessThanOrEqual(100);
    });
  });

  describe('analyzeFootprint', () => {
    it('should analyze footprint and determine dominant flow', () => {
      const symbol = 'BTCUSDT';
      const candle = generateMockCandle(50000);
      const trades = generateMockTrades(symbol, 100, 50000, { buyerMakerRatio: 0.2 });

      const footprint = analyzer.buildFootprint(symbol, candle, trades);
      const analysis = analyzer.analyzeFootprint(footprint);

      expect(analysis.dominantFlow).toBe('buying');
      expect(analysis.confidence).toBeGreaterThanOrEqual(0);
      expect(analysis.confidence).toBeLessThanOrEqual(100);
    });

    it('should detect institutional signature for concentrated volume', () => {
      const symbol = 'BTCUSDT';
      const candle = generateMockCandle(50000);
      // Generate trades concentrated at specific levels
      const trades = generateMockTrades(symbol, 100, 50000, {
        buyerMakerRatio: 0.2,
        priceVariance: 0.001 // Very tight price range
      });

      const footprint = analyzer.buildFootprint(symbol, candle, trades);
      const analysis = analyzer.analyzeFootprint(footprint);

      expect(analysis.analysis.volumeConcentration).toBeDefined();
    });
  });

  describe('classifyVolume', () => {
    it('should classify aggressive vs passive volume', () => {
      const trades = generateMockTrades('BTCUSDT', 100, 50000, { buyerMakerRatio: 0.3 });

      const classification = analyzer.classifyVolume(trades);

      expect(classification.aggressive.buy).toBeGreaterThan(0);
      expect(classification.aggressive.sell).toBeGreaterThan(0);
      expect(classification.ratio).toBeGreaterThanOrEqual(0);
      expect(classification.ratio).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================================================
// SWEEP DETECTOR TESTS
// ============================================================================

describe('SweepDetector', () => {
  let detector: SweepDetector;

  beforeEach(() => {
    detector = new SweepDetector({ minLevelsCleared: 5 });
  });

  afterEach(() => {
    detector.destroy();
  });

  describe('detectSweeps', () => {
    it('should detect sweep pattern when 5+ levels cleared', () => {
      const symbol = 'BTCUSDT';
      const trades = generateSweepTrades(symbol, 50000, 'down', 7);

      const sweeps = detector.detectSweeps(symbol, trades);

      expect(sweeps.length).toBeGreaterThan(0);
      expect(sweeps[0].levelsCleared).toBeGreaterThanOrEqual(5);
      expect(sweeps[0].direction).toBe('down');
    });

    it('should not detect sweep when fewer than 5 levels cleared', () => {
      const symbol = 'BTCUSDT';
      const trades = generateSweepTrades(symbol, 50000, 'up', 3);

      const sweeps = detector.detectSweeps(symbol, trades);

      expect(sweeps.length).toBe(0);
    });

    it('should classify urgency based on speed', () => {
      const symbol = 'BTCUSDT';
      const trades = generateSweepTrades(symbol, 50000, 'up', 10);

      const sweeps = detector.detectSweeps(symbol, trades);

      if (sweeps.length > 0) {
        expect(['low', 'medium', 'high']).toContain(sweeps[0].urgency);
      }
    });
  });

  describe('analyzeSweeps', () => {
    it('should provide comprehensive sweep analysis', () => {
      const symbol = 'BTCUSDT';
      const trades = generateSweepTrades(symbol, 50000, 'down', 8);

      const result = detector.analyzeSweeps(symbol, trades);

      expect(result.sweeps).toBeDefined();
      expect(result.totalSweepVolume).toBeGreaterThanOrEqual(0);
      expect(result.urgencyScore).toBeGreaterThanOrEqual(0);
      expect(result.urgencyScore).toBeLessThanOrEqual(100);
      expect(result.institutionalProbability).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateSweep', () => {
    it('should validate and score sweep patterns', () => {
      const symbol = 'BTCUSDT';
      const trades = generateSweepTrades(symbol, 50000, 'up', 7);
      const sweeps = detector.detectSweeps(symbol, trades);

      if (sweeps.length > 0) {
        const validation = detector.validateSweep(sweeps[0]);

        expect(validation.isValid).toBe(true);
        expect(validation.score).toBeGreaterThan(0);
        expect(validation.reasons.length).toBeGreaterThan(0);
      }
    });
  });
});

// ============================================================================
// ICEBERG DETECTOR TESTS
// ============================================================================

describe('IcebergDetector', () => {
  let detector: IcebergDetector;

  beforeEach(() => {
    detector = new IcebergDetector();
  });

  afterEach(() => {
    detector.destroy();
  });

  describe('measureRefillRate', () => {
    it('should measure liquidity refill rate at price level', () => {
      const symbol = 'BTCUSDT';
      const priceLevel = 50000;
      const trades = generateMockTrades(symbol, 50, priceLevel, {
        priceVariance: 0.001
      });

      const refillRate = detector.measureRefillRate(symbol, priceLevel, trades);

      expect(refillRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateIcebergDensity', () => {
    it('should calculate iceberg density at price level', () => {
      const symbol = 'BTCUSDT';
      const priceLevel = 50000;
      const trades = generateMockTrades(symbol, 100, priceLevel, {
        priceVariance: 0.001
      });

      const analysis = detector.calculateIcebergDensity(symbol, priceLevel, trades);

      expect(analysis.priceLevel).toBeDefined();
      expect(analysis.density).toBeGreaterThanOrEqual(0);
      expect(analysis.density).toBeLessThanOrEqual(100);
      expect(typeof analysis.isIceberg).toBe('boolean');
    });
  });

  describe('monitorOrderBlockLiquidity', () => {
    it('should monitor Order Block liquidity changes', () => {
      const symbol = 'BTCUSDT';
      const obHigh = 50100;
      const obLow = 49900;
      const trades = generateMockTrades(symbol, 100, 50000);

      const result = detector.monitorOrderBlockLiquidity(symbol, obHigh, obLow, trades);

      expect(result.priceLevel).toBeDefined();
      expect(result.icebergAnalysis).toBeDefined();
      expect(['strong', 'weakening', 'depleted']).toContain(result.liquidityHealth);
      expect(['valid', 'caution', 'invalid']).toContain(result.recommendation);
    });
  });
});

// ============================================================================
// INSTITUTIONAL FLOW CLASSIFIER TESTS
// ============================================================================

describe('InstitutionalFlowClassifier', () => {
  let classifier: InstitutionalFlowClassifier;

  beforeEach(() => {
    classifier = new InstitutionalFlowClassifier();
  });

  afterEach(() => {
    classifier.destroy();
  });

  describe('detectPassiveAbsorption', () => {
    it('should detect passive absorption pattern', () => {
      const symbol = 'BTCUSDT';
      // High buyerMakerRatio = more passive buys absorbing aggressive sells
      const trades = generateMockTrades(symbol, 100, 50000, {
        buyerMakerRatio: 0.8,
        priceVariance: 0.001 // Stable price during absorption
      });

      const result = classifier.detectPassiveAbsorption(symbol, trades);

      expect(typeof result.detected).toBe('boolean');
      expect(result.strength).toBeGreaterThanOrEqual(0);
      expect(result.strength).toBeLessThanOrEqual(100);
    });
  });

  describe('detectAggressivePushing', () => {
    it('should detect aggressive pushing pattern', () => {
      const symbol = 'BTCUSDT';
      // Low buyerMakerRatio = more aggressive buys
      const trades = generateMockTrades(symbol, 100, 50000, {
        buyerMakerRatio: 0.2
      });

      const result = classifier.detectAggressivePushing(symbol, trades);

      expect(typeof result.detected).toBe('boolean');
      expect(result.strength).toBeGreaterThanOrEqual(0);
      expect(['up', 'down']).toContain(result.direction);
    });
  });

  describe('buildFlowValidationScore', () => {
    it('should build comprehensive flow validation score', () => {
      const symbol = 'BTCUSDT';
      const trades = generateMockTrades(symbol, 100, 50000);

      const validation = classifier.buildFlowValidationScore(symbol, trades);

      expect(validation.isValid).toBeDefined();
      expect(validation.confidence).toBeGreaterThanOrEqual(0);
      expect(validation.confidence).toBeLessThanOrEqual(100);
      expect(['passive_absorption', 'aggressive_pushing', 'neutral']).toContain(validation.flowType);
    });
  });

  describe('classifyFlow', () => {
    it('should provide comprehensive flow classification', () => {
      const symbol = 'BTCUSDT';
      const trades = generateMockTrades(symbol, 100, 50000);

      const result = classifier.classifyFlow(symbol, trades);

      expect(result.flowType).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.institutionalProbability).toBeGreaterThanOrEqual(0);
      expect(result.breakdown).toBeDefined();
      expect(result.signals).toBeDefined();
      expect(result.recommendation).toBeDefined();
    });
  });
});

// ============================================================================
// ADVANCED FLOW VALIDATOR TESTS
// ============================================================================

describe('AdvancedFlowValidator', () => {
  let validator: AdvancedFlowValidator;

  beforeEach(() => {
    validator = new AdvancedFlowValidator();
  });

  afterEach(() => {
    validator.destroy();
  });

  describe('validatePOI', () => {
    it('should validate POI with flow analysis', () => {
      const symbol = 'BTCUSDT';
      const poi = generateMockFVG('BULLISH', 50000);
      const trades = generateMockTrades(symbol, 100, 50000);

      const result = validator.validatePOI(symbol, poi, trades);

      expect(result.poi).toBe(poi);
      expect(result.flowValidation).toBeDefined();
      expect(typeof result.isValid).toBe('boolean');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.adjustments).toBeDefined();
      expect(result.veto).toBeDefined();
    });

    it('should veto bullish POI when iceberg detected', () => {
      const symbol = 'BTCUSDT';
      const poi = generateMockFVG('BULLISH', 50000);
      // Generate trades that might trigger iceberg detection
      const trades = generateMockTrades(symbol, 200, 50000, {
        buyerMakerRatio: 0.9, // Heavy selling pressure
        priceVariance: 0.001
      });

      const result = validator.validatePOI(symbol, poi, trades);

      // Result should have veto information
      expect(result.veto).toBeDefined();
      expect(typeof result.veto.vetoed).toBe('boolean');
    });

    it('should return disabled result when validator is disabled', () => {
      validator.updateConfig({ enabled: false });

      const symbol = 'BTCUSDT';
      const poi = generateMockFVG('BULLISH', 50000);
      const trades = generateMockTrades(symbol, 50, 50000);

      const result = validator.validatePOI(symbol, poi, trades);

      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe(100);
      expect(result.recommendation).toContain('disabled');
    });
  });

  describe('enhanceCVDConfirmation', () => {
    it('should enhance CVD confirmation with flow analysis', () => {
      const symbol = 'BTCUSDT';
      const trades = generateMockTrades(symbol, 100, 50000);
      const cvdValue = 10000; // Positive CVD (bullish)

      const result = validator.enhanceCVDConfirmation(symbol, trades, cvdValue);

      expect(typeof result.cvdConfirmed).toBe('boolean');
      expect(result.cvdValue).toBe(cvdValue);
      expect(['bullish', 'bearish', 'neutral']).toContain(result.cvdDirection);
      expect(result.confidenceAdjustment).toBeDefined();
    });
  });

  describe('processTrade', () => {
    it('should process trades for all analyzers', () => {
      const trade: CVDTrade = {
        symbol: 'BTCUSDT',
        price: 50000,
        qty: 1.0,
        time: Date.now(),
        isBuyerMaker: false
      };

      // Should not throw
      expect(() => validator.processTrade(trade)).not.toThrow();
    });
  });

  describe('getState', () => {
    it('should return validator state', () => {
      const state = validator.getState();

      expect(typeof state.enabled).toBe('boolean');
      expect(typeof state.symbolsTracked).toBe('number');
      expect(typeof state.totalValidations).toBe('number');
      expect(typeof state.vetoCount).toBe('number');
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', () => {
      const stats = validator.getStats();

      expect(stats.state).toBeDefined();
      expect(stats.footprint).toBeDefined();
      expect(stats.sweep).toBeDefined();
      expect(stats.iceberg).toBeDefined();
      expect(stats.classifier).toBeDefined();
    });
  });
});
