/**
 * FundingSqueezeDetector Unit Tests
 *
 * Tests the Funding Squeeze detection logic for predatory funding squeeze strategy.
 */
import { FundingSqueezeDetector } from '../../src/detectors/FundingSqueezeDetector';
// Mock Bybit client
class MockBybitClient {
    mockFundingRate = 0;
    mockPrice = 50000;
    mockOHLCV = [];
    setMockFundingRate(rate) {
        this.mockFundingRate = rate;
    }
    setMockPrice(price) {
        this.mockPrice = price;
    }
    setMockOHLCV(ohlcv) {
        this.mockOHLCV = ohlcv;
    }
    async getFundingRate(symbol) {
        return this.mockFundingRate;
    }
    async getCurrentPrice(symbol) {
        return this.mockPrice;
    }
    async fetchOHLCV(symbol, interval, limit) {
        return this.mockOHLCV;
    }
}
// Mock CVD calculator
class MockCVDCalculator {
    cvdValues = new Map();
    setMockCVD(windowSeconds, cvd, offsetSeconds) {
        const key = offsetSeconds ? `${windowSeconds}_${offsetSeconds}` : `${windowSeconds}`;
        this.cvdValues.set(key, cvd);
    }
    async calcCVD(symbol, windowSeconds, offsetSeconds) {
        const key = offsetSeconds ? `${windowSeconds}_${offsetSeconds}` : `${windowSeconds}`;
        return this.cvdValues.get(key) || 0;
    }
}
describe('FundingSqueezeDetector', () => {
    let detector;
    let mockBybitClient;
    let mockCVDCalculator;
    beforeEach(() => {
        mockBybitClient = new MockBybitClient();
        mockCVDCalculator = new MockCVDCalculator();
        detector = new FundingSqueezeDetector(mockBybitClient, mockCVDCalculator);
    });
    describe('detectSqueeze', () => {
        it('should return null when funding rate is not negative enough', async () => {
            // Funding rate is -0.01% (not negative enough, needs < -0.02%)
            mockBybitClient.setMockFundingRate(-0.0001);
            const result = await detector.detectSqueeze('BTCUSDT');
            expect(result).toBeNull();
        });
        it('should return null when funding rate is positive', async () => {
            // Funding rate is positive (longs pay shorts)
            mockBybitClient.setMockFundingRate(0.0003);
            const result = await detector.detectSqueeze('BTCUSDT');
            expect(result).toBeNull();
        });
        it('should return null when insufficient OHLCV data', async () => {
            mockBybitClient.setMockFundingRate(-0.0003); // -0.03% (negative enough)
            // Only 2 bars instead of 3
            mockBybitClient.setMockOHLCV([
                { timestamp: Date.now() - 600000, open: 50000, high: 50100, low: 49900, close: 50000, volume: 1000 },
                { timestamp: Date.now() - 300000, open: 50000, high: 50100, low: 49950, close: 50050, volume: 1000 },
            ]);
            const result = await detector.detectSqueeze('BTCUSDT');
            expect(result).toBeNull();
        });
        it('should return null when price is not making higher lows', async () => {
            mockBybitClient.setMockFundingRate(-0.0003); // -0.03% (negative enough)
            // Price making lower lows (not trapped shorts)
            mockBybitClient.setMockOHLCV([
                { timestamp: Date.now() - 900000, open: 50000, high: 50100, low: 49900, close: 50000, volume: 1000 },
                { timestamp: Date.now() - 600000, open: 50000, high: 50100, low: 49800, close: 49900, volume: 1000 },
                { timestamp: Date.now() - 300000, open: 49900, high: 50000, low: 49700, close: 49800, volume: 1000 },
            ]);
            mockCVDCalculator.setMockCVD(300, 100000); // Current CVD
            mockCVDCalculator.setMockCVD(300, 50000); // Previous CVD (offset)
            const result = await detector.detectSqueeze('BTCUSDT');
            expect(result).toBeNull();
        });
        it('should return null when CVD is not rising', async () => {
            mockBybitClient.setMockFundingRate(-0.0003); // -0.03% (negative enough)
            // Price making higher lows
            mockBybitClient.setMockOHLCV([
                { timestamp: Date.now() - 900000, open: 50000, high: 50100, low: 49900, close: 50000, volume: 1000 },
                { timestamp: Date.now() - 600000, open: 50000, high: 50100, low: 49950, close: 50050, volume: 1000 },
                { timestamp: Date.now() - 300000, open: 50050, high: 50150, low: 50000, close: 50100, volume: 1000 },
            ]);
            // CVD is falling (not rising)
            mockCVDCalculator.setMockCVD(300, 50000); // Current CVD
            mockCVDCalculator.setMockCVD(300, 100000, 300); // Previous CVD (higher, with offset)
            const result = await detector.detectSqueeze('BTCUSDT');
            expect(result).toBeNull();
        });
        it('should detect valid funding squeeze and return Tripwire', async () => {
            mockBybitClient.setMockFundingRate(-0.0003); // -0.03% ✓
            mockBybitClient.setMockPrice(50100);
            // Price making higher lows ✓
            mockBybitClient.setMockOHLCV([
                { timestamp: Date.now() - 900000, open: 50000, high: 50100, low: 49900, close: 50000, volume: 1000 },
                { timestamp: Date.now() - 600000, open: 50000, high: 50100, low: 49950, close: 50050, volume: 1000 },
                { timestamp: Date.now() - 300000, open: 50050, high: 50150, low: 50000, close: 50100, volume: 1000 },
                { timestamp: Date.now() - 240000, open: 50100, high: 50200, low: 50050, close: 50150, volume: 1000 },
                { timestamp: Date.now() - 180000, open: 50150, high: 50250, low: 50100, close: 50200, volume: 1000 },
                { timestamp: Date.now() - 120000, open: 50200, high: 50300, low: 50150, close: 50250, volume: 1000 },
                { timestamp: Date.now() - 60000, open: 50250, high: 50350, low: 50200, close: 50300, volume: 1000 },
            ]);
            // CVD is rising ✓
            mockCVDCalculator.setMockCVD(300, 100000); // Current CVD
            mockCVDCalculator.setMockCVD(300, 50000, 300); // Previous CVD (lower, with offset)
            const result = await detector.detectSqueeze('BTCUSDT');
            expect(result).not.toBeNull();
            expect(result.symbol).toBe('BTCUSDT');
            expect(result.direction).toBe('LONG');
            expect(result.trapType).toBe('FUNDING_SQUEEZE');
            expect(result.confidence).toBe(90);
            expect(result.leverage).toBe(15);
            expect(result.activated).toBe(false);
        });
        it('should calculate trigger price at current price + 0.1%', async () => {
            mockBybitClient.setMockFundingRate(-0.0003);
            mockBybitClient.setMockPrice(50000);
            mockBybitClient.setMockOHLCV([
                { timestamp: Date.now() - 900000, open: 50000, high: 50100, low: 49900, close: 50000, volume: 1000 },
                { timestamp: Date.now() - 600000, open: 50000, high: 50100, low: 49950, close: 50050, volume: 1000 },
                { timestamp: Date.now() - 300000, open: 50050, high: 50150, low: 50000, close: 50100, volume: 1000 },
            ]);
            mockCVDCalculator.setMockCVD(300, 100000);
            mockCVDCalculator.setMockCVD(300, 50000, 300);
            const result = await detector.detectSqueeze('BTCUSDT');
            // Trigger price: 50100 (last close) * 1.001 = 50150.1
            expect(result.triggerPrice).toBeCloseTo(50150.1, 1);
        });
        it('should calculate liquidation target at recent high + 2%', async () => {
            mockBybitClient.setMockFundingRate(-0.0003);
            mockBybitClient.setMockPrice(50100);
            // Recent high is 50350
            mockBybitClient.setMockOHLCV([
                { timestamp: Date.now() - 900000, open: 50000, high: 50100, low: 49900, close: 50000, volume: 1000 },
                { timestamp: Date.now() - 600000, open: 50000, high: 50200, low: 49950, close: 50050, volume: 1000 },
                { timestamp: Date.now() - 300000, open: 50050, high: 50350, low: 50000, close: 50100, volume: 1000 },
                { timestamp: Date.now() - 240000, open: 50100, high: 50300, low: 50050, close: 50150, volume: 1000 },
                { timestamp: Date.now() - 180000, open: 50150, high: 50250, low: 50100, close: 50200, volume: 1000 },
                { timestamp: Date.now() - 120000, open: 50200, high: 50300, low: 50150, close: 50250, volume: 1000 },
                { timestamp: Date.now() - 60000, open: 50250, high: 50300, low: 50200, close: 50250, volume: 1000 },
            ]);
            mockCVDCalculator.setMockCVD(300, 100000);
            mockCVDCalculator.setMockCVD(300, 50000, 300);
            const result = await detector.detectSqueeze('BTCUSDT');
            // Target: 50350 * 1.02 = 51357
            expect(result.targetPrice).toBe(51357);
        });
        it('should calculate stop loss at recent low - 0.5%', async () => {
            mockBybitClient.setMockFundingRate(-0.0003);
            mockBybitClient.setMockPrice(50100);
            // Recent lows: 49900, 49950, 50000 (last 3)
            mockBybitClient.setMockOHLCV([
                { timestamp: Date.now() - 900000, open: 50000, high: 50100, low: 49900, close: 50000, volume: 1000 },
                { timestamp: Date.now() - 600000, open: 50000, high: 50100, low: 49950, close: 50050, volume: 1000 },
                { timestamp: Date.now() - 300000, open: 50050, high: 50150, low: 50000, close: 50100, volume: 1000 },
            ]);
            mockCVDCalculator.setMockCVD(300, 100000);
            mockCVDCalculator.setMockCVD(300, 50000, 300);
            const result = await detector.detectSqueeze('BTCUSDT');
            // Stop loss: 50000 * 0.995 = 49750
            expect(result.stopLoss).toBe(49750);
        });
        it('should detect extreme funding squeeze (< -0.05%)', async () => {
            mockBybitClient.setMockFundingRate(-0.0006); // -0.06% (very negative)
            mockBybitClient.setMockPrice(50100);
            mockBybitClient.setMockOHLCV([
                { timestamp: Date.now() - 900000, open: 50000, high: 50100, low: 49900, close: 50000, volume: 1000 },
                { timestamp: Date.now() - 600000, open: 50000, high: 50100, low: 49950, close: 50050, volume: 1000 },
                { timestamp: Date.now() - 300000, open: 50050, high: 50150, low: 50000, close: 50100, volume: 1000 },
            ]);
            mockCVDCalculator.setMockCVD(300, 150000); // Strong CVD rise
            mockCVDCalculator.setMockCVD(300, 50000, 300);
            const result = await detector.detectSqueeze('BTCUSDT');
            expect(result).not.toBeNull();
            expect(result.confidence).toBe(90);
            expect(result.leverage).toBe(15);
        });
        it('should handle errors gracefully and return null', async () => {
            // Mock an error in getFundingRate
            mockBybitClient.getFundingRate = async () => {
                throw new Error('API Error');
            };
            const result = await detector.detectSqueeze('BTCUSDT');
            expect(result).toBeNull();
        });
        it('should detect squeeze with minimal higher low pattern', async () => {
            mockBybitClient.setMockFundingRate(-0.0003);
            mockBybitClient.setMockPrice(50100);
            // Minimal higher lows: 49900 → 49901 → 49902
            mockBybitClient.setMockOHLCV([
                { timestamp: Date.now() - 900000, open: 50000, high: 50100, low: 49900, close: 50000, volume: 1000 },
                { timestamp: Date.now() - 600000, open: 50000, high: 50100, low: 49901, close: 50050, volume: 1000 },
                { timestamp: Date.now() - 300000, open: 50050, high: 50150, low: 49902, close: 50100, volume: 1000 },
            ]);
            mockCVDCalculator.setMockCVD(300, 100000);
            mockCVDCalculator.setMockCVD(300, 50000, 300);
            const result = await detector.detectSqueeze('BTCUSDT');
            expect(result).not.toBeNull();
            expect(result.trapType).toBe('FUNDING_SQUEEZE');
        });
        it('should detect squeeze with strong CVD divergence', async () => {
            mockBybitClient.setMockFundingRate(-0.0003);
            mockBybitClient.setMockPrice(50100);
            mockBybitClient.setMockOHLCV([
                { timestamp: Date.now() - 900000, open: 50000, high: 50100, low: 49900, close: 50000, volume: 1000 },
                { timestamp: Date.now() - 600000, open: 50000, high: 50100, low: 49950, close: 50050, volume: 1000 },
                { timestamp: Date.now() - 300000, open: 50050, high: 50150, low: 50000, close: 50100, volume: 1000 },
            ]);
            // Strong CVD rise (from negative to positive)
            mockCVDCalculator.setMockCVD(300, 200000); // Current CVD (very positive)
            mockCVDCalculator.setMockCVD(300, -50000, 300); // Previous CVD (negative, with offset)
            const result = await detector.detectSqueeze('BTCUSDT');
            expect(result).not.toBeNull();
            expect(result.confidence).toBe(90);
        });
        it('should set estimated cascade size to 10%', async () => {
            mockBybitClient.setMockFundingRate(-0.0003);
            mockBybitClient.setMockPrice(50100);
            mockBybitClient.setMockOHLCV([
                { timestamp: Date.now() - 900000, open: 50000, high: 50100, low: 49900, close: 50000, volume: 1000 },
                { timestamp: Date.now() - 600000, open: 50000, high: 50100, low: 49950, close: 50050, volume: 1000 },
                { timestamp: Date.now() - 300000, open: 50050, high: 50150, low: 50000, close: 50100, volume: 1000 },
            ]);
            mockCVDCalculator.setMockCVD(300, 100000);
            mockCVDCalculator.setMockCVD(300, 50000, 300);
            const result = await detector.detectSqueeze('BTCUSDT');
            expect(result.estimatedCascadeSize).toBe(0.10); // 10%
        });
    });
});
//# sourceMappingURL=FundingSqueezeDetector.test.js.map