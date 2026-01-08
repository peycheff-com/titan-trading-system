/**
 * Integration Test Environment Configuration
 * 
 * Sets up environment variables for integration tests
 */

// Test environment
process.env.NODE_ENV = 'test';

// Database configuration for tests
process.env.TEST_DB_HOST = process.env.TEST_DB_HOST || 'localhost';
process.env.TEST_DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.TEST_DB_NAME = process.env.TEST_DB_NAME || 'test_titan_brain';
process.env.TEST_DB_USER = process.env.TEST_DB_USER || 'test_user';
process.env.TEST_DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'test_password';
process.env.TEST_DB_SSL = process.env.TEST_DB_SSL || 'false';

// Redis configuration for tests
process.env.TEST_REDIS_HOST = process.env.TEST_REDIS_HOST || 'localhost';
process.env.TEST_REDIS_PORT = process.env.TEST_REDIS_PORT || '6379';
process.env.TEST_REDIS_PASSWORD = process.env.TEST_REDIS_PASSWORD || '';
process.env.TEST_REDIS_DB = process.env.TEST_REDIS_DB || '15';

// Test-specific configuration
process.env.TEST_TIMEOUT = process.env.TEST_TIMEOUT || '60000';
process.env.TEST_VERBOSE = process.env.TEST_VERBOSE || 'false';
process.env.TEST_PARALLEL = process.env.TEST_PARALLEL || 'false';

// Disable external service calls in tests
process.env.DISABLE_EXTERNAL_SERVICES = 'true';

// Test secrets
process.env.TEST_HMAC_SECRET = 'test-hmac-secret-for-integration-tests';
process.env.TEST_JWT_SECRET = 'test-jwt-secret-for-integration-tests';

console.log('Integration test environment configured');
console.log(`Database: ${process.env.TEST_DB_HOST}:${process.env.TEST_DB_PORT}/${process.env.TEST_DB_NAME}`);
console.log(`Redis: ${process.env.TEST_REDIS_HOST}:${process.env.TEST_REDIS_PORT}/${process.env.TEST_REDIS_DB}`);
console.log(`Verbose: ${process.env.TEST_VERBOSE}`);