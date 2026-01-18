/**
 * Property-Based Test: Volume Validation Consistency
 *
 * **Feature: titan-phase1-scavenger, Property 2: Volume Validation Consistency**
 * **Validates: Requirements 3.4, 3.5**
 *
 * For any symbol, if volume validation succeeds, it should consistently trigger execution.
 * Verify that 50+ trades in 100ms always triggers validation.
 */
import * as fc from 'fast-check';
import { describe, test, expect } from '@jest/globals';
import { VolumeValidator } from '../../src/validators/VolumeValidator.js';
describe('Property-Based Test: Volume Validation Consistency', () => {
    /**
     * Property 2: Volume Validation Consistency
     *
     * For any symbol, if volume validation succeeds (>= 50 trades in 100ms),
     * it should consistently trigger execution.
     */
    test('Property 2: Volume validation should consistently trigger when >= 50 trades in 100ms', async () => {
        await fc.assert(fc.asyncProperty(
        // Generate random symbol
        fc.constantFrom('BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT'), 
        // Generate total trade count >= 50
        fc.integer({ min: 50, max: 200 }), async (symbol, totalTrades) => {
            const validator = new VolumeValidator();
            // Feed all trades in first call (simulating burst of trades)
            let validationResult = validator.validateVolume(symbol, totalTrades);
            // Should return false initially (window not complete)
            expect(validationResult).toBe(false);
            // Wait for window to complete
            await new Promise(resolve => setTimeout(resolve, 101));
            // Make another call to trigger window completion check
            validationResult = validator.validateVolume(symbol, 0);
            // PROPERTY: If total trades >= 50, validation MUST succeed
            expect(validationResult).toBe(true);
            // PROPERTY: After successful validation, counter should be reset
            const counterState = validator.getCounterState(symbol);
            expect(counterState).toBeNull();
        }), {
            numRuns: 100, // Run 100 iterations as specified in design
            verbose: true,
        });
    });
    /**
     * Property 2b: Volume validation should NOT trigger when < 50 trades
     *
     * For any symbol, if volume validation has < 50 trades in 100ms,
     * it should NOT trigger execution.
     */
    test('Property 2b: Volume validation should NOT trigger when < 50 trades in 100ms', async () => {
        await fc.assert(fc.asyncProperty(
        // Generate random symbol
        fc.constantFrom('BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT'), 
        // Generate total trade count < 50
        fc.integer({ min: 1, max: 49 }), async (symbol, totalTrades) => {
            const validator = new VolumeValidator();
            // Feed all trades in first call
            let validationResult = validator.validateVolume(symbol, totalTrades);
            // Should return false initially (window not complete)
            expect(validationResult).toBe(false);
            // Wait for window to complete
            await new Promise(resolve => setTimeout(resolve, 101));
            // Make another call to trigger window completion check
            validationResult = validator.validateVolume(symbol, 0);
            // PROPERTY: If total trades < 50, validation MUST fail
            expect(validationResult).toBe(false);
            // PROPERTY: After failed validation, counter should be reset
            const counterState = validator.getCounterState(symbol);
            expect(counterState).toBeNull();
        }), {
            numRuns: 100,
            verbose: true,
        });
    });
    /**
     * Property 2c: Volume validation should be deterministic
     *
     * For any symbol and trade count, running validation multiple times
     * with the same inputs should produce the same result.
     */
    test('Property 2c: Volume validation should be deterministic for same inputs', async () => {
        await fc.assert(fc.asyncProperty(
        // Generate random symbol
        fc.constantFrom('BTCUSDT', 'ETHUSDT', 'SOLUSDT'), 
        // Generate random trade count
        fc.integer({ min: 1, max: 200 }), async (symbol, tradeCount) => {
            // Run validation twice with same inputs
            const results = [];
            for (let run = 0; run < 2; run++) {
                const validator = new VolumeValidator();
                // Feed trades
                validator.validateVolume(symbol, tradeCount);
                // Wait for window to complete
                await new Promise(resolve => setTimeout(resolve, 101));
                // Get result
                const result = validator.validateVolume(symbol, 0);
                results.push(result);
            }
            // PROPERTY: Both runs should produce the same result
            expect(results[0]).toBe(results[1]);
        }), {
            numRuns: 50, // Reduced for performance
            verbose: true,
        });
    });
    /**
     * Property 2d: Volume validation should be independent per symbol
     *
     * For any two different symbols, validation state should be independent.
     * Validating one symbol should not affect another symbol's state.
     */
    test('Property 2d: Volume validation should be independent per symbol', async () => {
        await fc.assert(fc.asyncProperty(
        // Generate two different symbols
        fc.constantFrom('BTCUSDT', 'ETHUSDT'), fc.constantFrom('SOLUSDT', 'BNBUSDT'), 
        // Generate trade counts for both symbols
        fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 100 }), async (symbol1, symbol2, trades1, trades2) => {
            const validator = new VolumeValidator();
            // Feed trades for symbol1
            validator.validateVolume(symbol1, trades1);
            // Check symbol1 state
            const state1Before = validator.getCounterState(symbol1);
            expect(state1Before).not.toBeNull();
            expect(state1Before.count).toBe(trades1);
            // Feed trades for symbol2
            validator.validateVolume(symbol2, trades2);
            // Check symbol1 state again - should be unchanged
            const state1After = validator.getCounterState(symbol1);
            expect(state1After).not.toBeNull();
            expect(state1After.count).toBe(trades1);
            // Check symbol2 state - should be independent
            const state2 = validator.getCounterState(symbol2);
            expect(state2).not.toBeNull();
            expect(state2.count).toBe(trades2);
        }), {
            numRuns: 100,
            verbose: true,
        });
    });
    /**
     * Property 2e: Volume validation should reset counter after validation
     *
     * For any symbol, after validation completes (success or failure),
     * the counter should be reset and ready for next validation cycle.
     */
    test('Property 2e: Volume validation should reset counter after validation completes', async () => {
        await fc.assert(fc.asyncProperty(
        // Generate random symbol
        fc.constantFrom('BTCUSDT', 'ETHUSDT', 'SOLUSDT'), 
        // Generate two separate trade counts
        fc.integer({ min: 1, max: 200 }), fc.integer({ min: 1, max: 200 }), async (symbol, firstTrades, secondTrades) => {
            const validator = new VolumeValidator();
            // First validation cycle
            validator.validateVolume(symbol, firstTrades);
            await new Promise(resolve => setTimeout(resolve, 101));
            validator.validateVolume(symbol, 0);
            // PROPERTY: After first validation, counter should be reset
            const stateAfterFirst = validator.getCounterState(symbol);
            expect(stateAfterFirst).toBeNull();
            // Second validation cycle should start fresh
            validator.validateVolume(symbol, secondTrades);
            // PROPERTY: New counter should be created with fresh count
            const stateAfterSecond = validator.getCounterState(symbol);
            expect(stateAfterSecond).not.toBeNull();
            expect(stateAfterSecond.count).toBe(secondTrades);
        }), {
            numRuns: 50, // Reduced for performance
            verbose: true,
        });
    });
    /**
     * Property 2f: Volume validation threshold should be exactly 50 trades
     *
     * For any symbol, validation should succeed with exactly 50 trades
     * and fail with exactly 49 trades.
     */
    test('Property 2f: Volume validation threshold should be exactly 50 trades', async () => {
        await fc.assert(fc.asyncProperty(
        // Generate random symbol
        fc.constantFrom('BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'), async (symbol) => {
            // Test with exactly 49 trades (should fail)
            const validator49 = new VolumeValidator();
            validator49.validateVolume(symbol, 49);
            await new Promise(resolve => setTimeout(resolve, 101));
            const result49 = validator49.validateVolume(symbol, 0);
            // PROPERTY: 49 trades should NOT trigger validation
            expect(result49).toBe(false);
            // Test with exactly 50 trades (should succeed)
            const validator50 = new VolumeValidator();
            validator50.validateVolume(symbol, 50);
            await new Promise(resolve => setTimeout(resolve, 101));
            const result50 = validator50.validateVolume(symbol, 0);
            // PROPERTY: 50 trades should trigger validation
            expect(result50).toBe(true);
            // Test with exactly 51 trades (should succeed)
            const validator51 = new VolumeValidator();
            validator51.validateVolume(symbol, 51);
            await new Promise(resolve => setTimeout(resolve, 101));
            const result51 = validator51.validateVolume(symbol, 0);
            // PROPERTY: 51 trades should trigger validation
            expect(result51).toBe(true);
        }), {
            numRuns: 50, // Reduced for performance
            verbose: true,
        });
    });
});
//# sourceMappingURL=VolumeValidation.property.test.js.map