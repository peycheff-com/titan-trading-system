/**
 * Jest Test Setup
 *
 * Global test configuration and environment setup for Titan Phase 1 Scavenger tests.
 */
// Mock environment variables for tests
process.env.TITAN_MASTER_PASSWORD = 'test-password-minimum-12-chars';
process.env.BINANCE_API_KEY = 'test-binance-api-key';
process.env.BINANCE_API_SECRET = 'test-binance-api-secret';
process.env.BYBIT_API_KEY = 'test-bybit-api-key';
process.env.BYBIT_API_SECRET = 'test-bybit-api-secret';
process.env.MEXC_API_KEY = 'test-mexc-api-key';
process.env.MEXC_API_SECRET = 'test-mexc-api-secret';
// Suppress console output during tests (unless DEBUG is set)
if (!process.env.DEBUG) {
    global.console = {
        ...console,
        log: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        // Keep error for debugging test failures
    };
}
expect.extend({
    toBeWithinRange(received, floor, ceiling) {
        const pass = received >= floor && received <= ceiling;
        return {
            pass,
            message: () => pass
                ? `expected ${received} not to be within range ${floor} - ${ceiling}`
                : `expected ${received} to be within range ${floor} - ${ceiling}`,
        };
    },
    toBeValidPrice(received) {
        const pass = received > 0 && Number.isFinite(received);
        return {
            pass,
            message: () => pass
                ? `expected ${received} not to be a valid price`
                : `expected ${received} to be a valid price (positive finite number)`,
        };
    },
    toBeValidLeverage(received) {
        const pass = received >= 1 && received <= 100 && Number.isInteger(received);
        return {
            pass,
            message: () => pass
                ? `expected ${received} not to be valid leverage`
                : `expected ${received} to be valid leverage (integer between 1 and 100)`,
        };
    },
});
export {};
//# sourceMappingURL=setup.js.map