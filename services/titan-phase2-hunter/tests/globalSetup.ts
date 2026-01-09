/**
 * Global setup for Titan Phase 2 Hunter tests
 * Runs once before all test suites
 */

export default async function globalSetup() {
  console.log('🚀 Setting up Titan Phase 2 Hunter test environment...');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
  
  // Initialize any global test resources
  // (e.g., test database, mock servers, etc.)
  
  console.log('✅ Test environment setup complete');
}