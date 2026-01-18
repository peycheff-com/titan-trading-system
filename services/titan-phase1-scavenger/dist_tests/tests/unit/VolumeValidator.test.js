/**
 * VolumeValidator Unit Tests
 *
 * Tests volume validation logic for breakout confirmation.
 * Requirements: 3.4-3.5 (Volume Validation)
 */
import { VolumeValidator } from '../../src/validators/VolumeValidator';
describe('VolumeValidator', () => {
    let validator;
    beforeEach(() => {
        validator = new VolumeValidator();
    });
    afterEach(() => {
        validator.resetAllCounters();
    });
    describe('validateVolume', () => {
        it('should return false on first call (window not complete)', () => {
            const result = validator.validateVolume('BTCUSDT', 10);
            expect(result).toBe(false);
        });
        it('should accumulate trades across multiple calls', () => {
            validator.validateVolume('BTCUSDT', 10);
            validator.validateVolume('BTCUSDT', 15);
            validator.validateVolume('BTCUSDT', 20);
            const state = validator.getCounterState('BTCUSDT');
            expect(state).not.toBeNull();
            expect(state.count).toBe(45);
        });
        it('should return true when >= 50 trades in 100ms window', async () => {
            validator.validateVolume('BTCUSDT', 30);
            validator.validateVolume('BTCUSDT', 25);
            // Wait for 100ms window to complete
            await new Promise(resolve => setTimeout(resolve, 110));
            const result = validator.validateVolume('BTCUSDT', 0);
            expect(result).toBe(true);
        });
        it('should return false when < 50 trades in 100ms window', async () => {
            validator.validateVolume('BTCUSDT', 20);
            validator.validateVolume('BTCUSDT', 15);
            // Wait for 100ms window to complete
            await new Promise(resolve => setTimeout(resolve, 110));
            const result = validator.validateVolume('BTCUSDT', 0);
            expect(result).toBe(false);
        });
        it('should reset counter after validation', async () => {
            validator.validateVolume('BTCUSDT', 60);
            // Wait for 100ms window to complete
            await new Promise(resolve => setTimeout(resolve, 110));
            validator.validateVolume('BTCUSDT', 0);
            // Counter should be reset
            const state = validator.getCounterState('BTCUSDT');
            expect(state).toBeNull();
        });
        it('should handle multiple symbols independently', async () => {
            validator.validateVolume('BTCUSDT', 30);
            validator.validateVolume('ETHUSDT', 40);
            validator.validateVolume('BTCUSDT', 25);
            validator.validateVolume('ETHUSDT', 15);
            // Wait for 100ms window to complete
            await new Promise(resolve => setTimeout(resolve, 110));
            const btcResult = validator.validateVolume('BTCUSDT', 0);
            const ethResult = validator.validateVolume('ETHUSDT', 0);
            expect(btcResult).toBe(true); // 30 + 25 = 55 trades
            expect(ethResult).toBe(true); // 40 + 15 = 55 trades
        });
        it('should handle exactly 50 trades as valid', async () => {
            validator.validateVolume('BTCUSDT', 50);
            // Wait for 100ms window to complete
            await new Promise(resolve => setTimeout(resolve, 110));
            const result = validator.validateVolume('BTCUSDT', 0);
            expect(result).toBe(true);
        });
        it('should handle 49 trades as invalid', async () => {
            validator.validateVolume('BTCUSDT', 49);
            // Wait for 100ms window to complete
            await new Promise(resolve => setTimeout(resolve, 110));
            const result = validator.validateVolume('BTCUSDT', 0);
            expect(result).toBe(false);
        });
        it('should start new window after reset', async () => {
            validator.validateVolume('BTCUSDT', 60);
            // Wait for 100ms window to complete
            await new Promise(resolve => setTimeout(resolve, 110));
            validator.validateVolume('BTCUSDT', 0); // Triggers reset
            // Start new window
            validator.validateVolume('BTCUSDT', 30);
            const state = validator.getCounterState('BTCUSDT');
            expect(state).not.toBeNull();
            expect(state.count).toBe(30);
        });
    });
    describe('resetCounter', () => {
        it('should reset counter for specific symbol', () => {
            validator.validateVolume('BTCUSDT', 30);
            validator.validateVolume('ETHUSDT', 40);
            validator.resetCounter('BTCUSDT');
            const btcState = validator.getCounterState('BTCUSDT');
            const ethState = validator.getCounterState('ETHUSDT');
            expect(btcState).toBeNull();
            expect(ethState).not.toBeNull();
            expect(ethState.count).toBe(40);
        });
        it('should handle resetting non-existent counter', () => {
            expect(() => {
                validator.resetCounter('NONEXISTENT');
            }).not.toThrow();
        });
    });
    describe('resetAllCounters', () => {
        it('should reset all counters', () => {
            validator.validateVolume('BTCUSDT', 30);
            validator.validateVolume('ETHUSDT', 40);
            validator.validateVolume('SOLUSDT', 50);
            validator.resetAllCounters();
            expect(validator.getCounterState('BTCUSDT')).toBeNull();
            expect(validator.getCounterState('ETHUSDT')).toBeNull();
            expect(validator.getCounterState('SOLUSDT')).toBeNull();
        });
    });
    describe('getCounterState', () => {
        it('should return null for non-existent counter', () => {
            const state = validator.getCounterState('NONEXISTENT');
            expect(state).toBeNull();
        });
        it('should return current count and elapsed time', () => {
            validator.validateVolume('BTCUSDT', 30);
            const state = validator.getCounterState('BTCUSDT');
            expect(state).not.toBeNull();
            expect(state.count).toBe(30);
            expect(state.elapsed).toBeGreaterThanOrEqual(0);
            expect(state.elapsed).toBeLessThan(100);
        });
        it('should show increasing elapsed time', async () => {
            validator.validateVolume('BTCUSDT', 30);
            const state1 = validator.getCounterState('BTCUSDT');
            await new Promise(resolve => setTimeout(resolve, 50));
            const state2 = validator.getCounterState('BTCUSDT');
            expect(state2.elapsed).toBeGreaterThan(state1.elapsed);
        });
    });
    describe('getConfig', () => {
        it('should return correct configuration values', () => {
            const config = validator.getConfig();
            expect(config.windowMs).toBe(100);
            expect(config.minTrades).toBe(50);
        });
    });
    describe('edge cases', () => {
        it('should handle zero trades', async () => {
            validator.validateVolume('BTCUSDT', 0);
            await new Promise(resolve => setTimeout(resolve, 110));
            const result = validator.validateVolume('BTCUSDT', 0);
            expect(result).toBe(false);
        });
        it('should handle very large trade counts', async () => {
            validator.validateVolume('BTCUSDT', 10000);
            await new Promise(resolve => setTimeout(resolve, 110));
            const result = validator.validateVolume('BTCUSDT', 0);
            expect(result).toBe(true);
        });
        it('should handle rapid successive calls', () => {
            for (let i = 0; i < 100; i++) {
                validator.validateVolume('BTCUSDT', 1);
            }
            const state = validator.getCounterState('BTCUSDT');
            expect(state).not.toBeNull();
            expect(state.count).toBe(100);
        });
    });
    describe('real-world scenarios', () => {
        it('should validate high-volume breakout', async () => {
            // Simulate high-volume breakout with multiple ticks
            validator.validateVolume('BTCUSDT', 15);
            await new Promise(resolve => setTimeout(resolve, 20));
            validator.validateVolume('BTCUSDT', 18);
            await new Promise(resolve => setTimeout(resolve, 20));
            validator.validateVolume('BTCUSDT', 22);
            await new Promise(resolve => setTimeout(resolve, 70));
            const result = validator.validateVolume('BTCUSDT', 0);
            expect(result).toBe(true); // 15 + 18 + 22 = 55 trades
        });
        it('should reject low-volume fake-out', async () => {
            // Simulate low-volume fake-out
            validator.validateVolume('BTCUSDT', 10);
            await new Promise(resolve => setTimeout(resolve, 30));
            validator.validateVolume('BTCUSDT', 12);
            await new Promise(resolve => setTimeout(resolve, 80));
            const result = validator.validateVolume('BTCUSDT', 0);
            expect(result).toBe(false); // 10 + 12 = 22 trades (< 50)
        });
        it('should handle multiple symbols during volatile market', async () => {
            // Simulate multiple symbols breaking out simultaneously
            const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AVAXUSDT'];
            for (const symbol of symbols) {
                validator.validateVolume(symbol, 60);
            }
            await new Promise(resolve => setTimeout(resolve, 110));
            for (const symbol of symbols) {
                const result = validator.validateVolume(symbol, 0);
                expect(result).toBe(true);
            }
        });
    });
});
//# sourceMappingURL=VolumeValidator.test.js.map