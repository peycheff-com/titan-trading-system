/**
 * Jest test setup file
 * Configures global test environment and suppresses expected console output
 */

// Suppress expected console.error messages in tests
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const message = args[0];
  
  // Suppress expected error messages from tests
  const suppressedMessages = [
    'Redis set error:',
    'Redis delete error:',
    'Redis clear error:',
    'Redis disconnect error:',
    'Failed to close positions during circuit breaker trigger:',
    'Failed to send emergency notification:',
    'Failed to persist breaker event:',
    'Error fetching balances from',
    'Telegram test failed:'
  ];
  
  // Only suppress if it's an expected test error
  if (typeof message === 'string' && suppressedMessages.some(msg => message.includes(msg))) {
    return; // Suppress this error
  }
  
  // Otherwise, log normally
  originalConsoleError.apply(console, args);
};

// Increase max listeners for tests to prevent warnings
process.setMaxListeners(20);

// Stub uuid ESM module for Jest CJS tests
jest.mock("uuid", () => ({
  v4: () => "test-uuid-0000",
}));

// Clean up after each test
afterEach(() => {
  // Reset any global state if needed
});
