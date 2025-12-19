/**
 * Jest test setup for Titan AI Quant
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = 'test-api-key';

// Increase timeout for property-based tests
// Note: jest global is available in test files automatically
