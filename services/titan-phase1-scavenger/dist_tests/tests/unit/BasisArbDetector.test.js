/**
 * Unit Tests for BasisArbDetector
 *
 * Tests the Basis Arb Detector (Rubber Band Strategy)
 */
import { BasisArbDetector } from '../../src/detectors/BasisArbDetector';
describe('BasisArbDetector', () => {
    let detector;
    let mockBinanceClient;
    let mockBybitClient;
    beforeEach(() => {
        // Mock Binance client
        mockBinanceClient = {
            getSpotPrice: jest.fn(),
        };
        // Mock Bybit client
        mockBybitClient = {
            getCurrentPrice: jest.fn(),
            get24hVolume: jest.fn(),
        };
        detector = new BasisArbDetector(mockBinanceClient, mockBybitClient);
    });
    describe('detectBasisArb', () => {
        it('should detect basis arb when basis > 0.5% and volume > $1M', async () => {
            // Setup: Spot at $50,000, Perp at $49,500 (1% basis)
            mockBinanceClient.getSpotPrice.mockResolvedValue(50000);
            mockBybitClient.getCurrentPrice.mockResolvedValue(49500);
            mockBybitClient.get24hVolume.mockResolvedValue(5000000); // $5M volume
            const result = await detector.detectBasisArb('BTCUSDT');
            expect(result).not.toBeNull();
            expect(result?.trapType).toBe('BASIS_ARB');
            expect(result?.direction).toBe('LONG');
            expect(result?.confidence).toBe(85);
            expect(result?.leverage).toBe(10);
            expect(result?.triggerPrice).toBeCloseTo(49500 * 1.001, 2); // Perp + 0.1%
            expect(result?.targetPrice).toBeCloseTo(50000 * 0.999, 2); // Spot * 0.999
            expect(result?.stopLoss).toBeCloseTo(49500 * 0.995, 2); // Perp * 0.995
            expect(result?.estimatedCascadeSize).toBeCloseTo(0.01, 4); // 1% basis
        });
        it('should return null when basis < 0.5%', async () => {
            // Setup: Spot at $50,000, Perp at $49,900 (0.2% basis)
            mockBinanceClient.getSpotPrice.mockResolvedValue(50000);
            mockBybitClient.getCurrentPrice.mockResolvedValue(49900);
            mockBybitClient.get24hVolume.mockResolvedValue(5000000);
            const result = await detector.detectBasisArb('BTCUSDT');
            expect(result).toBeNull();
        });
        it('should return null when volume < $1M', async () => {
            // Setup: Good basis but low volume
            mockBinanceClient.getSpotPrice.mockResolvedValue(50000);
            mockBybitClient.getCurrentPrice.mockResolvedValue(49500); // 1% basis
            mockBybitClient.get24hVolume.mockResolvedValue(500000); // $500k volume
            const result = await detector.detectBasisArb('BTCUSDT');
            expect(result).toBeNull();
        });
        it('should return null when basis is exactly 0.5%', async () => {
            // Setup: Spot at $50,000, Perp at $49,750 (0.5% basis)
            mockBinanceClient.getSpotPrice.mockResolvedValue(50000);
            mockBybitClient.getCurrentPrice.mockResolvedValue(49750);
            mockBybitClient.get24hVolume.mockResolvedValue(5000000);
            const result = await detector.detectBasisArb('BTCUSDT');
            // Should return null because basis must be > 0.5%, not >= 0.5%
            expect(result).toBeNull();
        });
        it('should detect basis arb with exactly $1M volume', async () => {
            // Setup: Good basis and exactly $1M volume
            mockBinanceClient.getSpotPrice.mockResolvedValue(50000);
            mockBybitClient.getCurrentPrice.mockResolvedValue(49500); // 1% basis
            mockBybitClient.get24hVolume.mockResolvedValue(1000000); // Exactly $1M
            const result = await detector.detectBasisArb('BTCUSDT');
            expect(result).not.toBeNull();
            expect(result?.trapType).toBe('BASIS_ARB');
        });
        it('should handle large basis (> 2%)', async () => {
            // Setup: Spot at $50,000, Perp at $49,000 (2% basis)
            mockBinanceClient.getSpotPrice.mockResolvedValue(50000);
            mockBybitClient.getCurrentPrice.mockResolvedValue(49000);
            mockBybitClient.get24hVolume.mockResolvedValue(10000000);
            const result = await detector.detectBasisArb('BTCUSDT');
            expect(result).not.toBeNull();
            expect(result?.estimatedCascadeSize).toBeCloseTo(0.02, 4); // 2% basis
            expect(result?.confidence).toBe(85);
        });
        it('should handle API errors gracefully', async () => {
            // Setup: Binance API fails
            mockBinanceClient.getSpotPrice.mockRejectedValue(new Error('API Error'));
            const result = await detector.detectBasisArb('BTCUSDT');
            expect(result).toBeNull();
        });
        it('should handle Bybit price fetch error', async () => {
            // Setup: Bybit getCurrentPrice fails
            mockBinanceClient.getSpotPrice.mockResolvedValue(50000);
            mockBybitClient.getCurrentPrice.mockRejectedValue(new Error('Network Error'));
            const result = await detector.detectBasisArb('BTCUSDT');
            expect(result).toBeNull();
        });
        it('should handle volume fetch error', async () => {
            // Setup: Volume fetch fails
            mockBinanceClient.getSpotPrice.mockResolvedValue(50000);
            mockBybitClient.getCurrentPrice.mockResolvedValue(49500);
            mockBybitClient.get24hVolume.mockRejectedValue(new Error('Volume API Error'));
            const result = await detector.detectBasisArb('BTCUSDT');
            expect(result).toBeNull();
        });
        it('should calculate correct target and stop loss', async () => {
            // Setup: Spot at $100, Perp at $99 (1% basis)
            mockBinanceClient.getSpotPrice.mockResolvedValue(100);
            mockBybitClient.getCurrentPrice.mockResolvedValue(99);
            mockBybitClient.get24hVolume.mockResolvedValue(2000000);
            const result = await detector.detectBasisArb('ETHUSDT');
            expect(result).not.toBeNull();
            expect(result?.targetPrice).toBeCloseTo(100 * 0.999, 2); // 99.9
            expect(result?.stopLoss).toBeCloseTo(99 * 0.995, 2); // 98.505
            expect(result?.triggerPrice).toBeCloseTo(99 * 1.001, 2); // 99.099
        });
        it('should set activated to false initially', async () => {
            mockBinanceClient.getSpotPrice.mockResolvedValue(50000);
            mockBybitClient.getCurrentPrice.mockResolvedValue(49500);
            mockBybitClient.get24hVolume.mockResolvedValue(5000000);
            const result = await detector.detectBasisArb('BTCUSDT');
            expect(result).not.toBeNull();
            expect(result?.activated).toBe(false);
        });
        it('should include symbol in result', async () => {
            mockBinanceClient.getSpotPrice.mockResolvedValue(50000);
            mockBybitClient.getCurrentPrice.mockResolvedValue(49500);
            mockBybitClient.get24hVolume.mockResolvedValue(5000000);
            const result = await detector.detectBasisArb('BTCUSDT');
            expect(result).not.toBeNull();
            expect(result?.symbol).toBe('BTCUSDT');
        });
        it('should work with different symbols', async () => {
            mockBinanceClient.getSpotPrice.mockResolvedValue(3000);
            mockBybitClient.getCurrentPrice.mockResolvedValue(2985); // 0.5% basis
            mockBybitClient.get24hVolume.mockResolvedValue(3000000);
            const result = await detector.detectBasisArb('ETHUSDT');
            expect(result).toBeNull(); // 0.5% is not > 0.5%
        });
        it('should detect basis arb with minimal threshold (0.51%)', async () => {
            // Setup: Spot at $50,000, Perp at $49,745 (0.51% basis)
            mockBinanceClient.getSpotPrice.mockResolvedValue(50000);
            mockBybitClient.getCurrentPrice.mockResolvedValue(49745);
            mockBybitClient.get24hVolume.mockResolvedValue(5000000);
            const result = await detector.detectBasisArb('BTCUSDT');
            expect(result).not.toBeNull();
            expect(result?.trapType).toBe('BASIS_ARB');
        });
    });
});
//# sourceMappingURL=BasisArbDetector.test.js.map