import { VelocityCalculator } from '../../src/calculators/VelocityCalculator';
describe('VelocityCalculator', () => {
    let calculator;
    beforeEach(() => {
        calculator = new VelocityCalculator();
    });
    describe('recordPrice', () => {
        it('should record price with exchange timestamp', () => {
            const symbol = 'BTCUSDT';
            const price = 50000;
            const exchangeTime = Date.now();
            calculator.recordPrice(symbol, price, exchangeTime);
            expect(calculator.getHistorySize(symbol)).toBe(1);
        });
        it('should maintain separate history for different symbols', () => {
            const time = Date.now();
            calculator.recordPrice('BTCUSDT', 50000, time);
            calculator.recordPrice('ETHUSDT', 3000, time);
            expect(calculator.getHistorySize('BTCUSDT')).toBe(1);
            expect(calculator.getHistorySize('ETHUSDT')).toBe(1);
        });
        it('should keep only last 10 seconds of history', () => {
            const symbol = 'BTCUSDT';
            const baseTime = Date.now();
            // Add prices over 15 seconds
            for (let i = 0; i < 15; i++) {
                calculator.recordPrice(symbol, 50000 + i, baseTime + i * 1000);
            }
            // Should only keep last 10 seconds (11 points including the cutoff)
            expect(calculator.getHistorySize(symbol)).toBeLessThanOrEqual(11);
        });
    });
    describe('calcVelocity', () => {
        it('should return 0 when no history exists', () => {
            const velocity = calculator.calcVelocity('BTCUSDT');
            expect(velocity).toBe(0);
        });
        it('should return 0 when only one price point exists', () => {
            calculator.recordPrice('BTCUSDT', 50000, Date.now());
            const velocity = calculator.calcVelocity('BTCUSDT');
            expect(velocity).toBe(0);
        });
        it('should calculate velocity for upward price movement', () => {
            const symbol = 'BTCUSDT';
            const baseTime = Date.now();
            const startPrice = 50000;
            const endPrice = 50500; // +1% over 5 seconds = 0.2%/s
            calculator.recordPrice(symbol, startPrice, baseTime);
            calculator.recordPrice(symbol, endPrice, baseTime + 5000);
            const velocity = calculator.calcVelocity(symbol);
            // Expected: (50500 - 50000) / 50000 / 5 = 0.002 (0.2%/s)
            expect(velocity).toBeCloseTo(0.002, 4);
        });
        it('should calculate velocity for downward price movement', () => {
            const symbol = 'BTCUSDT';
            const baseTime = Date.now();
            const startPrice = 50000;
            const endPrice = 49500; // -1% over 5 seconds = 0.2%/s
            calculator.recordPrice(symbol, startPrice, baseTime);
            calculator.recordPrice(symbol, endPrice, baseTime + 5000);
            const velocity = calculator.calcVelocity(symbol);
            // Should return absolute value
            expect(velocity).toBeCloseTo(0.002, 4);
        });
        it('should calculate high velocity for extreme moves', () => {
            const symbol = 'BTCUSDT';
            const baseTime = Date.now();
            const startPrice = 50000;
            const endPrice = 51500; // +3% over 5 seconds = 0.6%/s
            calculator.recordPrice(symbol, startPrice, baseTime);
            calculator.recordPrice(symbol, endPrice, baseTime + 5000);
            const velocity = calculator.calcVelocity(symbol);
            // Expected: (51500 - 50000) / 50000 / 5 = 0.006 (0.6%/s)
            expect(velocity).toBeCloseTo(0.006, 4);
            expect(velocity).toBeGreaterThan(0.005); // > 0.5%/s threshold for Market Order
        });
        it('should use only last 5 seconds for calculation', () => {
            const symbol = 'BTCUSDT';
            const baseTime = Date.now();
            // Add old data (8 seconds ago)
            calculator.recordPrice(symbol, 48000, baseTime - 8000);
            // Add recent data (last 5 seconds)
            calculator.recordPrice(symbol, 50000, baseTime);
            calculator.recordPrice(symbol, 50250, baseTime + 5000); // +0.5% over 5s = 0.1%/s
            const velocity = calculator.calcVelocity(symbol);
            // Should only use 50000 → 50250, not 48000
            expect(velocity).toBeCloseTo(0.001, 4);
        });
        it('should handle multiple price points in 5s window', () => {
            const symbol = 'BTCUSDT';
            const baseTime = Date.now();
            // Add multiple points over 5 seconds
            calculator.recordPrice(symbol, 50000, baseTime);
            calculator.recordPrice(symbol, 50100, baseTime + 1000);
            calculator.recordPrice(symbol, 50200, baseTime + 2000);
            calculator.recordPrice(symbol, 50300, baseTime + 3000);
            calculator.recordPrice(symbol, 50400, baseTime + 4000);
            calculator.recordPrice(symbol, 50500, baseTime + 5000);
            const velocity = calculator.calcVelocity(symbol);
            // Should use oldest (50000) and newest (50500) in 5s window
            // (50500 - 50000) / 50000 / 5 = 0.002 (0.2%/s)
            expect(velocity).toBeCloseTo(0.002, 4);
        });
        it('should return 0 when time difference is zero', () => {
            const symbol = 'BTCUSDT';
            const time = Date.now();
            calculator.recordPrice(symbol, 50000, time);
            calculator.recordPrice(symbol, 50100, time); // Same timestamp
            const velocity = calculator.calcVelocity(symbol);
            expect(velocity).toBe(0);
        });
        it('should return 0 when insufficient recent data', () => {
            const symbol = 'BTCUSDT';
            const baseTime = Date.now();
            // Add only one point in last 5 seconds
            calculator.recordPrice(symbol, 50000, baseTime - 8000);
            calculator.recordPrice(symbol, 50500, baseTime);
            const velocity = calculator.calcVelocity(symbol);
            // Should return 0 because only 1 point in 5s window
            expect(velocity).toBe(0);
        });
    });
    describe('Order Type Thresholds', () => {
        it('should identify Market Order velocity (> 0.5%/s)', () => {
            const symbol = 'BTCUSDT';
            const baseTime = Date.now();
            // 3% move in 5 seconds = 0.6%/s
            calculator.recordPrice(symbol, 50000, baseTime);
            calculator.recordPrice(symbol, 51500, baseTime + 5000);
            const velocity = calculator.calcVelocity(symbol);
            expect(velocity).toBeGreaterThan(0.005); // > 0.5%/s
        });
        it('should identify Aggressive Limit velocity (0.1-0.5%/s)', () => {
            const symbol = 'BTCUSDT';
            const baseTime = Date.now();
            // 1.5% move in 5 seconds = 0.3%/s
            calculator.recordPrice(symbol, 50000, baseTime);
            calculator.recordPrice(symbol, 50750, baseTime + 5000);
            const velocity = calculator.calcVelocity(symbol);
            expect(velocity).toBeGreaterThan(0.001); // > 0.1%/s
            expect(velocity).toBeLessThan(0.005); // < 0.5%/s
        });
        it('should identify Limit Order velocity (< 0.1%/s)', () => {
            const symbol = 'BTCUSDT';
            const baseTime = Date.now();
            // 0.4% move in 5 seconds = 0.08%/s
            calculator.recordPrice(symbol, 50000, baseTime);
            calculator.recordPrice(symbol, 50200, baseTime + 5000);
            const velocity = calculator.calcVelocity(symbol);
            expect(velocity).toBeLessThan(0.001); // < 0.1%/s
        });
    });
    describe('clearHistory', () => {
        it('should clear history for a symbol', () => {
            const symbol = 'BTCUSDT';
            const time = Date.now();
            calculator.recordPrice(symbol, 50000, time);
            calculator.recordPrice(symbol, 50100, time + 1000);
            expect(calculator.getHistorySize(symbol)).toBe(2);
            calculator.clearHistory(symbol);
            expect(calculator.getHistorySize(symbol)).toBe(0);
        });
        it('should not affect other symbols when clearing', () => {
            const time = Date.now();
            calculator.recordPrice('BTCUSDT', 50000, time);
            calculator.recordPrice('ETHUSDT', 3000, time);
            calculator.clearHistory('BTCUSDT');
            expect(calculator.getHistorySize('BTCUSDT')).toBe(0);
            expect(calculator.getHistorySize('ETHUSDT')).toBe(1);
        });
    });
    describe('Exchange Timestamp Usage', () => {
        it('should use exchange timestamps for velocity calculation', () => {
            const symbol = 'BTCUSDT';
            // Simulate exchange timestamps (not local time)
            const exchangeTime1 = 1704067200000; // 2024-01-01 00:00:00
            const exchangeTime2 = 1704067205000; // 2024-01-01 00:00:05
            calculator.recordPrice(symbol, 50000, exchangeTime1);
            calculator.recordPrice(symbol, 50500, exchangeTime2);
            const velocity = calculator.calcVelocity(symbol);
            // Should calculate based on exchange time difference (5 seconds)
            expect(velocity).toBeCloseTo(0.002, 4);
        });
        it('should handle out-of-order timestamps gracefully', () => {
            const symbol = 'BTCUSDT';
            const baseTime = Date.now();
            // Add prices in non-chronological order
            calculator.recordPrice(symbol, 50000, baseTime);
            calculator.recordPrice(symbol, 50500, baseTime + 5000);
            calculator.recordPrice(symbol, 50250, baseTime + 2500);
            // Should still calculate velocity using oldest and newest in 5s window
            const velocity = calculator.calcVelocity(symbol);
            expect(velocity).toBeGreaterThan(0);
        });
    });
});
//# sourceMappingURL=VelocityCalculator.test.js.map