/**
 * Global teardown for Titan Phase 2 Hunter tests
 * Runs once after all test suites complete
 */

export default async function globalTeardown() {
  console.log('🧹 Cleaning up Titan Phase 2 Hunter test environment...');
  
  // Restore real timers
  jest.useRealTimers();
  
  // Clean up any global test resources
  // (e.g., close database connections, stop mock servers, etc.)
  
  // Clear all mocks
  jest.clearAllMocks();
  jest.restoreAllMocks();
  
  console.log('✅ Test environment cleanup complete');
}