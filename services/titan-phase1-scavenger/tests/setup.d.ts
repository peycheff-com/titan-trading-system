/**
 * Jest Test Setup
 *
 * Global test configuration and environment setup for Titan Phase 1 Scavenger tests.
 */
export {};
declare global {
    namespace jest {
        interface Matchers<R> {
            toBeWithinRange(floor: number, ceiling: number): R;
            toBeValidPrice(): R;
            toBeValidLeverage(): R;
        }
    }
}
//# sourceMappingURL=setup.d.ts.map