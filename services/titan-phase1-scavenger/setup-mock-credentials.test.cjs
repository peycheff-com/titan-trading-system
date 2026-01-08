/**
 * Tests for setup-mock-credentials.cjs
 * 
 * Run with: node setup-mock-credentials.test.cjs
 */

const { encryptCredentials, parseArguments, CONFIG, MOCK_CREDENTIALS } = require('./setup-mock-credentials.cjs');
const crypto = require('crypto');

// Simple test framework
let testCount = 0;
let passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    console.log(`✅ ${name}`);
    passCount++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
  }
}

function assertEquals(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
  }
}

function assertThrows(fn, expectedMessage = '') {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    if (expectedMessage && !error.message.includes(expectedMessage)) {
      throw new Error(`Expected error message to contain "${expectedMessage}", got "${error.message}"`);
    }
  }
}

// Test encryption function
test('encryptCredentials - valid inputs', () => {
  const result = encryptCredentials(MOCK_CREDENTIALS, 'test_password_123');
  
  assertEquals(result.version, 1);
  assertEquals(result.algorithm, 'aes-256-cbc');
  assertEquals(typeof result.salt, 'string');
  assertEquals(typeof result.iv, 'string');
  assertEquals(typeof result.authTag, 'string');
  assertEquals(typeof result.encryptedData, 'string');
  assertEquals(typeof result.timestamp, 'string');
});

test('encryptCredentials - invalid credentials', () => {
  assertThrows(() => {
    encryptCredentials(null, 'test_password_123');
  }, 'Credentials must be a valid object');
});

test('encryptCredentials - invalid password', () => {
  assertThrows(() => {
    encryptCredentials(MOCK_CREDENTIALS, 'short');
  }, 'Master password must be at least 8 characters long');
});

test('encryptCredentials - empty password', () => {
  assertThrows(() => {
    encryptCredentials(MOCK_CREDENTIALS, '');
  }, 'Master password must be at least 8 characters long');
});

test('encryptCredentials - non-string password', () => {
  assertThrows(() => {
    encryptCredentials(MOCK_CREDENTIALS, 123);
  }, 'Master password must be at least 8 characters long');
});

// Test that encrypted data is different each time (due to random IV/salt)
test('encryptCredentials - produces different output each time', () => {
  const result1 = encryptCredentials(MOCK_CREDENTIALS, 'test_password_123');
  const result2 = encryptCredentials(MOCK_CREDENTIALS, 'test_password_123');
  
  if (result1.encryptedData === result2.encryptedData) {
    throw new Error('Encrypted data should be different each time due to random IV/salt');
  }
  if (result1.salt === result2.salt) {
    throw new Error('Salt should be different each time');
  }
  if (result1.iv === result2.iv) {
    throw new Error('IV should be different each time');
  }
});

// Test argument parsing
test('parseArguments - default values', () => {
  // Mock process.argv
  const originalArgv = process.argv;
  process.argv = ['node', 'script.js'];
  
  try {
    const result = parseArguments();
    assertEquals(result.password, CONFIG.DEFAULT_PASSWORD);
    assertEquals(typeof result.outputDir, 'string');
    assertEquals(result.help, false);
  } finally {
    process.argv = originalArgv;
  }
});

test('parseArguments - custom password', () => {
  const originalArgv = process.argv;
  process.argv = ['node', 'script.js', '--password', 'custom_password'];
  
  try {
    const result = parseArguments();
    assertEquals(result.password, 'custom_password');
  } finally {
    process.argv = originalArgv;
  }
});

test('parseArguments - help flag', () => {
  const originalArgv = process.argv;
  process.argv = ['node', 'script.js', '--help'];
  
  try {
    const result = parseArguments();
    assertEquals(result.help, true);
  } finally {
    process.argv = originalArgv;
  }
});

test('parseArguments - unknown option', () => {
  const originalArgv = process.argv;
  process.argv = ['node', 'script.js', '--unknown'];
  
  try {
    assertThrows(() => {
      parseArguments();
    }, 'Unknown option');
  } finally {
    process.argv = originalArgv;
  }
});

// Test configuration constants
test('CONFIG - has required properties', () => {
  assertEquals(CONFIG.ALGORITHM, 'aes-256-cbc');
  assertEquals(CONFIG.KEY_LENGTH, 32);
  assertEquals(CONFIG.IV_LENGTH, 16);
  assertEquals(CONFIG.SALT_LENGTH, 32);
  assertEquals(CONFIG.PBKDF2_ITERATIONS, 100000);
  assertEquals(typeof CONFIG.DEFAULT_PASSWORD, 'string');
  assertEquals(typeof CONFIG.DEFAULT_DIR, 'string');
  assertEquals(typeof CONFIG.SECRETS_FILE, 'string');
});

// Test mock credentials structure
test('MOCK_CREDENTIALS - has required exchanges', () => {
  assertEquals(typeof MOCK_CREDENTIALS.binance, 'object');
  assertEquals(typeof MOCK_CREDENTIALS.bybit, 'object');
  assertEquals(typeof MOCK_CREDENTIALS.mexc, 'object');
  
  assertEquals(typeof MOCK_CREDENTIALS.binance.apiKey, 'string');
  assertEquals(typeof MOCK_CREDENTIALS.binance.apiSecret, 'string');
  assertEquals(typeof MOCK_CREDENTIALS.bybit.apiKey, 'string');
  assertEquals(typeof MOCK_CREDENTIALS.bybit.apiSecret, 'string');
  assertEquals(typeof MOCK_CREDENTIALS.mexc.apiKey, 'string');
  assertEquals(typeof MOCK_CREDENTIALS.mexc.apiSecret, 'string');
});

// Test decryption (to verify encryption works correctly)
test('encryptCredentials - can be decrypted correctly', () => {
  const password = 'test_password_123';
  const encrypted = encryptCredentials(MOCK_CREDENTIALS, password);
  
  // Decrypt the data
  const salt = Buffer.from(encrypted.salt, 'base64');
  const iv = Buffer.from(encrypted.iv, 'base64');
  const authTag = encrypted.authTag;
  
  const key = crypto.pbkdf2Sync(password, salt, CONFIG.PBKDF2_ITERATIONS, CONFIG.KEY_LENGTH, 'sha256');
  
  // Verify HMAC first
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(encrypted.encryptedData);
  const computedAuthTag = hmac.digest('base64');
  
  if (computedAuthTag !== authTag) {
    throw new Error('Authentication tag verification failed');
  }
  
  // Decrypt
  const decipher = crypto.createDecipheriv(CONFIG.ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted.encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  const decryptedCredentials = JSON.parse(decrypted);
  
  // Verify the decrypted data matches the original
  assertEquals(JSON.stringify(decryptedCredentials), JSON.stringify(MOCK_CREDENTIALS));
});

// Run all tests
console.log('🧪 Running tests for setup-mock-credentials.cjs\n');

console.log(`\n📊 Test Results: ${passCount}/${testCount} passed`);

if (passCount === testCount) {
  console.log('🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('💥 Some tests failed!');
  process.exit(1);
}