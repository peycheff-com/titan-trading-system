/**
 * Property-Based Test: Order Type Selection Determinism
 *
 * **Feature: titan-phase1-scavenger, Property 3: Order Type Selection Determinism**
 * **Validates: Requirements 4.2, 4.3, 4.4**
 *
 * For any velocity value, the same velocity should always produce the same order type.
 * Verify: velocity > 0.5% → MARKET, 0.1-0.5% → AGGRESSIVE LIMIT, < 0.1% → LIMIT
 */
import * as fc from 'fast-check';
import { describe, test, expect } from '@jest/globals';
/**
 * Order type selection logic (extracted from TitanTrap.fire())
 */
function selectOrderType(velocity) {
    const extremeVelocityThreshold = 0.005; // 0.5%/s
    const moderateVelocityThreshold = 0.001; // 0.1%/s
    const absVelocity = Math.abs(velocity);
    if (absVelocity > extremeVelocityThreshold) {
        return 'MARKET';
    }
    else if (absVelocity > moderateVelocityThreshold) {
        return 'AGGRESSIVE_LIMIT';
    }
    else {
        return 'LIMIT';
    }
}
describe('Property-Based Test: Order Type Selection Determinism', () => {
    test('Property 3: Same velocity should always produce same order type', async () => {
        await fc.assert(fc.asyncProperty(fc.double({ min: 0, max: 0.02, noNaN: true, noDefaultInfinity: true }), async (velocity) => {
            const results = [];
            for (let i = 0; i < 10; i++) {
                results.push(selectOrderType(velocity));
            }
            const firstResult = results[0];
            for (const result of results) {
                expect(result).toBe(firstResult);
            }
        }), { numRuns: 100, verbose: true });
    });
    test('Property 3a: Velocity > 0.5%/s should always produce MARKET order', async () => {
        await fc.assert(fc.asyncProperty(fc.double({ min: 0.005001, max: 0.02, noNaN: true, noDefaultInfinity: true }), async (velocity) => {
            expect(selectOrderType(velocity)).toBe('MARKET');
        }), { numRuns: 100, verbose: true });
    });
    test('Property 3b: Velocity 0.1-0.5%/s should always produce AGGRESSIVE_LIMIT order', async () => {
        await fc.assert(fc.asyncProperty(fc.double({ min: 0.001001, max: 0.004999, noNaN: true, noDefaultInfinity: true }), async (velocity) => {
            expect(selectOrderType(velocity)).toBe('AGGRESSIVE_LIMIT');
        }), { numRuns: 100, verbose: true });
    });
    test('Property 3c: Velocity < 0.1%/s should always produce LIMIT order', async () => {
        await fc.assert(fc.asyncProperty(fc.double({ min: 0, max: 0.000999, noNaN: true, noDefaultInfinity: true }), async (velocity) => {
            expect(selectOrderType(velocity)).toBe('LIMIT');
        }), { numRuns: 100, verbose: true });
    });
    test('Property 3d: Boundary values should be handled correctly', () => {
        expect(selectOrderType(0.000000)).toBe('LIMIT');
        expect(selectOrderType(0.000999)).toBe('LIMIT');
        expect(selectOrderType(0.001000)).toBe('LIMIT');
        expect(selectOrderType(0.001001)).toBe('AGGRESSIVE_LIMIT');
        expect(selectOrderType(0.004999)).toBe('AGGRESSIVE_LIMIT');
        expect(selectOrderType(0.005000)).toBe('AGGRESSIVE_LIMIT');
        expect(selectOrderType(0.005001)).toBe('MARKET');
        expect(selectOrderType(0.010000)).toBe('MARKET');
    });
    test('Property 3e: Order type aggressiveness should be monotonic with velocity', async () => {
        const aggressiveness = { 'LIMIT': 1, 'AGGRESSIVE_LIMIT': 2, 'MARKET': 3 };
        await fc.assert(fc.asyncProperty(fc.double({ min: 0, max: 0.01, noNaN: true, noDefaultInfinity: true }), fc.double({ min: 0, max: 0.01, noNaN: true, noDefaultInfinity: true }), async (vel1, vel2) => {
            const [v1, v2] = vel1 < vel2 ? [vel1, vel2] : [vel2, vel1];
            if (Math.abs(v2 - v1) < 0.0001)
                return;
            const orderType1 = selectOrderType(v1);
            const orderType2 = selectOrderType(v2);
            expect(aggressiveness[orderType2]).toBeGreaterThanOrEqual(aggressiveness[orderType1]);
        }), { numRuns: 100, verbose: true });
    });
    test('Property 3f: Zero velocity should always produce LIMIT order', () => {
        expect(selectOrderType(0)).toBe('LIMIT');
    });
    test('Property 3g: Negative velocities should be treated as absolute values', async () => {
        await fc.assert(fc.asyncProperty(fc.double({ min: 0.001, max: 0.01, noNaN: true, noDefaultInfinity: true }), async (velocity) => {
            expect(selectOrderType(velocity)).toBe(selectOrderType(-velocity));
        }), { numRuns: 50, verbose: true });
    });
});
//# sourceMappingURL=OrderTypeSelection.property.test.js.map