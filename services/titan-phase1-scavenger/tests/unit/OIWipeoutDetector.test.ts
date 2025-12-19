/**
 * OIWipeoutDetector Unit Tests
 * 
 * Tests the OI Wipeout detection logic for V-Shape catch strategy.
 */

import { OIWipeoutDetector } from '../../src/detectors/OIWipeoutDetector';

// Mock interfaces
interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Mock Bybit client
class MockBybitClient {
  private mockOI: number = 1000000;
  private mockPrice: number = 50000;
  private mockOHLCV: OHLCV[] = [];

  setMockOI(oi: number): void {
    this.mockOI = oi;
  }

  setMockPrice(price: number): void {
    this.mockPrice = price;
  }

  setMockOHLCV(ohlcv: OHLCV[]): void {
    this.mockOHLCV = ohlcv;
  }

  async getOpenInterest(symbol: string): Promise<number> {
    return this.mockOI;
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    return this.mockPrice;
  }

  async fetchOHLCV(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
    return this.mockOHLCV;
  }
}

// Mock CVD calculator
class MockCVDCalculator {
  private mockCVD: number = 0;

  setMockCVD(cvd: number): void {
    this.mockCVD = cvd;
  }

  async calcCVD(symbol: string, windowSeconds: number): Promise<number> {
    return this.mockCVD;
  }
}

describe('OIWipeoutDetector', () => {
  let detector: OIWipeoutDetector;
  let mockBybitClient: MockBybitClient;
  let mockCVDCalculator: MockCVDCalculator;

  beforeEach(() => {
    mockBybitClient = new MockBybitClient();
    mockCVDCalculator = new MockCVDCalculator();
    detector = new OIWipeoutDetector(mockBybitClient as any, mockCVDCalculator as any);
  });

  describe('recordOI', () => {
    it('should record OI history for a symbol', () => {
      detector.recordOI('BTCUSDT', 1000000);
      detector.recordOI('BTCUSDT', 950000);

      const history = detector.getOIHistory('BTCUSDT');
      expect(history).toHaveLength(2);
      expect(history[0].oi).toBe(1000000);
      expect(history[1].oi).toBe(950000);
    });

    it('should keep only last 10 minutes of history', () => {
      const now = Date.now();

      // Record OI from 11 minutes ago (should be removed)
      detector.recordOI('BTCUSDT', 1000000);
      const history = detector.getOIHistory('BTCUSDT');
      history[0].timestamp = now - 660000; // 11 minutes ago

      // Record new OI
      detector.recordOI('BTCUSDT', 950000);

      const updatedHistory = detector.getOIHistory('BTCUSDT');
      expect(updatedHistory).toHaveLength(1);
      expect(updatedHistory[0].oi).toBe(950000);
    });

    it('should handle multiple symbols independently', () => {
      detector.recordOI('BTCUSDT', 1000000);
      detector.recordOI('ETHUSDT', 500000);

      expect(detector.getOIHistory('BTCUSDT')).toHaveLength(1);
      expect(detector.getOIHistory('ETHUSDT')).toHaveLength(1);
      expect(detector.getOIHistory('BTCUSDT')[0].oi).toBe(1000000);
      expect(detector.getOIHistory('ETHUSDT')[0].oi).toBe(500000);
    });
  });

  describe('clearOIHistory', () => {
    it('should clear OI history for a symbol', () => {
      detector.recordOI('BTCUSDT', 1000000);
      expect(detector.getOIHistory('BTCUSDT')).toHaveLength(1);

      detector.clearOIHistory('BTCUSDT');
      expect(detector.getOIHistory('BTCUSDT')).toHaveLength(0);
    });
  });

  describe('detectWipeout', () => {
    it('should return null when no OI history exists', async () => {
      const result = await detector.detectWipeout('BTCUSDT');
      expect(result).toBeNull();
    });

    it('should return null when OI history is less than 5 minutes old', async () => {
      // Record OI only 2 minutes ago
      detector.recordOI('BTCUSDT', 1000000);
      const history = detector.getOIHistory('BTCUSDT');
      history[0].timestamp = Date.now() - 120000; // 2 minutes ago

      const result = await detector.detectWipeout('BTCUSDT');
      expect(result).toBeNull();
    });

    it('should return null when price drop is less than 3%', async () => {
      // Setup: OI dropped 25%, but price only dropped 2%
      detector.recordOI('BTCUSDT', 1000000);
      const history = detector.getOIHistory('BTCUSDT');
      history[0].timestamp = Date.now() - 300000; // 5 minutes ago

      mockBybitClient.setMockOI(750000); // -25% OI
      mockBybitClient.setMockPrice(49000); // -2% price (not enough)

      // Mock OHLCV: price started at 50000
      mockBybitClient.setMockOHLCV([
        { timestamp: Date.now() - 300000, open: 50000, high: 50000, low: 49000, close: 50000, volume: 1000 },
        { timestamp: Date.now() - 240000, open: 50000, high: 50000, low: 49000, close: 49500, volume: 1000 },
        { timestamp: Date.now() - 180000, open: 49500, high: 49500, low: 49000, close: 49200, volume: 1000 },
        { timestamp: Date.now() - 120000, open: 49200, high: 49200, low: 49000, close: 49100, volume: 1000 },
        { timestamp: Date.now() - 60000, open: 49100, high: 49100, low: 49000, close: 49000, volume: 1000 },
      ]);

      mockCVDCalculator.setMockCVD(100000); // Positive CVD

      const result = await detector.detectWipeout('BTCUSDT');
      expect(result).toBeNull();
    });

    it('should return null when OI drop is less than 20%', async () => {
      // Setup: Price dropped 4%, but OI only dropped 15%
      detector.recordOI('BTCUSDT', 1000000);
      const history = detector.getOIHistory('BTCUSDT');
      history[0].timestamp = Date.now() - 300000; // 5 minutes ago

      mockBybitClient.setMockOI(850000); // -15% OI (not enough)
      mockBybitClient.setMockPrice(48000); // -4% price

      // Mock OHLCV: price started at 50000
      mockBybitClient.setMockOHLCV([
        { timestamp: Date.now() - 300000, open: 50000, high: 50000, low: 48000, close: 50000, volume: 1000 },
        { timestamp: Date.now() - 240000, open: 50000, high: 50000, low: 48000, close: 49000, volume: 1000 },
        { timestamp: Date.now() - 180000, open: 49000, high: 49000, low: 48000, close: 48500, volume: 1000 },
        { timestamp: Date.now() - 120000, open: 48500, high: 48500, low: 48000, close: 48200, volume: 1000 },
        { timestamp: Date.now() - 60000, open: 48200, high: 48200, low: 48000, close: 48000, volume: 1000 },
      ]);

      mockCVDCalculator.setMockCVD(100000); // Positive CVD

      const result = await detector.detectWipeout('BTCUSDT');
      expect(result).toBeNull();
    });

    it('should return null when CVD is negative (no buying pressure)', async () => {
      // Setup: Price dropped 4%, OI dropped 25%, but CVD is negative
      detector.recordOI('BTCUSDT', 1000000);
      const history = detector.getOIHistory('BTCUSDT');
      history[0].timestamp = Date.now() - 300000; // 5 minutes ago

      mockBybitClient.setMockOI(750000); // -25% OI
      mockBybitClient.setMockPrice(48000); // -4% price

      // Mock OHLCV: price started at 50000
      mockBybitClient.setMockOHLCV([
        { timestamp: Date.now() - 300000, open: 50000, high: 50000, low: 48000, close: 50000, volume: 1000 },
        { timestamp: Date.now() - 240000, open: 50000, high: 50000, low: 48000, close: 49000, volume: 1000 },
        { timestamp: Date.now() - 180000, open: 49000, high: 49000, low: 48000, close: 48500, volume: 1000 },
        { timestamp: Date.now() - 120000, open: 48500, high: 48500, low: 48000, close: 48200, volume: 1000 },
        { timestamp: Date.now() - 60000, open: 48200, high: 48200, low: 48000, close: 48000, volume: 1000 },
      ]);

      mockCVDCalculator.setMockCVD(-50000); // Negative CVD (still selling)

      const result = await detector.detectWipeout('BTCUSDT');
      expect(result).toBeNull();
    });

    it('should detect valid OI wipeout and return Tripwire', async () => {
      // Setup: All conditions met
      detector.recordOI('BTCUSDT', 1000000);
      const history = detector.getOIHistory('BTCUSDT');
      history[0].timestamp = Date.now() - 300000; // 5 minutes ago

      mockBybitClient.setMockOI(750000); // -25% OI ✓
      mockBybitClient.setMockPrice(48000); // -4% price ✓

      // Mock OHLCV: price started at 50000
      mockBybitClient.setMockOHLCV([
        { timestamp: Date.now() - 300000, open: 50000, high: 50000, low: 48000, close: 50000, volume: 1000 },
        { timestamp: Date.now() - 240000, open: 50000, high: 50000, low: 48000, close: 49000, volume: 1000 },
        { timestamp: Date.now() - 180000, open: 49000, high: 49000, low: 48000, close: 48500, volume: 1000 },
        { timestamp: Date.now() - 120000, open: 48500, high: 48500, low: 48000, close: 48200, volume: 1000 },
        { timestamp: Date.now() - 60000, open: 48200, high: 48200, low: 48000, close: 48000, volume: 1000 },
      ]);

      mockCVDCalculator.setMockCVD(100000); // Positive CVD ✓

      const result = await detector.detectWipeout('BTCUSDT');

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('BTCUSDT');
      expect(result!.direction).toBe('LONG');
      expect(result!.trapType).toBe('OI_WIPEOUT');
      expect(result!.confidence).toBe(95);
      expect(result!.leverage).toBe(20);
      expect(result!.triggerPrice).toBe(48000);
      expect(result!.activated).toBe(false);
    });

    it('should calculate correct 50% retracement target', async () => {
      // Setup: Price dropped from 50000 to 48000 (-2000)
      detector.recordOI('BTCUSDT', 1000000);
      const history = detector.getOIHistory('BTCUSDT');
      history[0].timestamp = Date.now() - 300000;

      mockBybitClient.setMockOI(750000);
      mockBybitClient.setMockPrice(48000);

      mockBybitClient.setMockOHLCV([
        { timestamp: Date.now() - 300000, open: 50000, high: 50000, low: 48000, close: 50000, volume: 1000 },
        { timestamp: Date.now() - 240000, open: 50000, high: 50000, low: 48000, close: 49000, volume: 1000 },
        { timestamp: Date.now() - 180000, open: 49000, high: 49000, low: 48000, close: 48500, volume: 1000 },
        { timestamp: Date.now() - 120000, open: 48500, high: 48500, low: 48000, close: 48200, volume: 1000 },
        { timestamp: Date.now() - 60000, open: 48200, high: 48200, low: 48000, close: 48000, volume: 1000 },
      ]);

      mockCVDCalculator.setMockCVD(100000);

      const result = await detector.detectWipeout('BTCUSDT');

      // 50% retracement: 48000 + (2000 * 0.5) = 49000
      expect(result!.targetPrice).toBe(49000);
    });

    it('should set stop loss at -2% from entry', async () => {
      detector.recordOI('BTCUSDT', 1000000);
      const history = detector.getOIHistory('BTCUSDT');
      history[0].timestamp = Date.now() - 300000;

      mockBybitClient.setMockOI(750000);
      mockBybitClient.setMockPrice(48000);

      mockBybitClient.setMockOHLCV([
        { timestamp: Date.now() - 300000, open: 50000, high: 50000, low: 48000, close: 50000, volume: 1000 },
        { timestamp: Date.now() - 240000, open: 50000, high: 50000, low: 48000, close: 49000, volume: 1000 },
        { timestamp: Date.now() - 180000, open: 49000, high: 49000, low: 48000, close: 48500, volume: 1000 },
        { timestamp: Date.now() - 120000, open: 48500, high: 48500, low: 48000, close: 48200, volume: 1000 },
        { timestamp: Date.now() - 60000, open: 48200, high: 48200, low: 48000, close: 48000, volume: 1000 },
      ]);

      mockCVDCalculator.setMockCVD(100000);

      const result = await detector.detectWipeout('BTCUSDT');

      // Stop loss: 48000 * 0.98 = 47040
      expect(result!.stopLoss).toBe(47040);
    });

    it('should handle errors gracefully and return null', async () => {
      // Setup history
      detector.recordOI('BTCUSDT', 1000000);
      const history = detector.getOIHistory('BTCUSDT');
      history[0].timestamp = Date.now() - 300000;

      // Mock an error in getOpenInterest
      mockBybitClient.getOpenInterest = async () => {
        throw new Error('API Error');
      };

      const result = await detector.detectWipeout('BTCUSDT');
      expect(result).toBeNull();
    });

    it('should return null when OHLCV data is insufficient', async () => {
      detector.recordOI('BTCUSDT', 1000000);
      const history = detector.getOIHistory('BTCUSDT');
      history[0].timestamp = Date.now() - 300000;

      mockBybitClient.setMockOI(750000);
      mockBybitClient.setMockPrice(48000);

      // Only 3 bars instead of 5
      mockBybitClient.setMockOHLCV([
        { timestamp: Date.now() - 180000, open: 49000, high: 49000, low: 48000, close: 48500, volume: 1000 },
        { timestamp: Date.now() - 120000, open: 48500, high: 48500, low: 48000, close: 48200, volume: 1000 },
        { timestamp: Date.now() - 60000, open: 48200, high: 48200, low: 48000, close: 48000, volume: 1000 },
      ]);

      mockCVDCalculator.setMockCVD(100000);

      const result = await detector.detectWipeout('BTCUSDT');
      expect(result).toBeNull();
    });

    it('should detect extreme wipeout (>5% price drop, >30% OI drop)', async () => {
      detector.recordOI('BTCUSDT', 1000000);
      const history = detector.getOIHistory('BTCUSDT');
      history[0].timestamp = Date.now() - 300000;

      mockBybitClient.setMockOI(650000); // -35% OI
      mockBybitClient.setMockPrice(47000); // -6% price

      mockBybitClient.setMockOHLCV([
        { timestamp: Date.now() - 300000, open: 50000, high: 50000, low: 47000, close: 50000, volume: 1000 },
        { timestamp: Date.now() - 240000, open: 50000, high: 50000, low: 47000, close: 48500, volume: 1000 },
        { timestamp: Date.now() - 180000, open: 48500, high: 48500, low: 47000, close: 48000, volume: 1000 },
        { timestamp: Date.now() - 120000, open: 48000, high: 48000, low: 47000, close: 47500, volume: 1000 },
        { timestamp: Date.now() - 60000, open: 47500, high: 47500, low: 47000, close: 47000, volume: 1000 },
      ]);

      mockCVDCalculator.setMockCVD(200000); // Strong buying

      const result = await detector.detectWipeout('BTCUSDT');

      expect(result).not.toBeNull();
      expect(result!.confidence).toBe(95);
      expect(result!.leverage).toBe(20);
      // Target should be 50% retracement: 47000 + (3000 * 0.5) = 48500
      expect(result!.targetPrice).toBe(48500);
    });
  });
});
