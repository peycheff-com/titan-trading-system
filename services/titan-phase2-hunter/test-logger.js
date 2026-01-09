/**
 * Integration test for Logger to verify it works in real environment
 * Tests all logging methods and verifies JSONL format output
 */

const { Logger } = require('./dist/logging/Logger.js');
const fs = require('fs');
const path = require('path');

// Test configuration constants
const TEST_CONFIG = {
  LOG_DIR: './test-logs',
  LOG_FILE: 'test-trades.jsonl',
  MAX_FILE_SIZE: 1024, // 1KB for testing rotation
  WRITE_DELAY_MS: 100
};

// Mock data factory functions
const createMockSignal = () => ({
  symbol: 'BTCUSDT',
  direction: 'LONG',
  confidence: 90,
  leverage: 5,
  entryPrice: 50000,
  stopLoss: 49000,
  takeProfit: 52500,
  positionSize: 0.1
});

const createMockHologram = () => ({
  status: 'A+',
  alignmentScore: 85,
  rsScore: 0.05,
  daily: { trend: 'BULL', location: 'DISCOUNT' },
  h4: { trend: 'BULL', location: 'DISCOUNT' },
  m15: { trend: 'BULL', mss: true }
});

const createMockOrderResult = () => ({
  orderId: 'test123',
  symbol: 'BTCUSDT',
  side: 'Buy',
  qty: 0.1,
  price: 50050,
  status: 'FILLED',
  timestamp: Date.now()
});

/**
 * Creates and configures test logger instance
 * @returns {Logger} Configured logger for testing
 */
function createTestLogger() {
  try {
    return new Logger({ 
      logDir: TEST_CONFIG.LOG_DIR, 
      logFileName: TEST_CONFIG.LOG_FILE,
      enableConsoleOutput: true,
      maxFileSizeBytes: TEST_CONFIG.MAX_FILE_SIZE
    });
  } catch (error) {
    throw new Error(`Failed to create test logger: ${error.message}`);
  }
}

/**
 * Tests all logger methods with mock data
 * @param {Logger} logger - Logger instance to test
 */
async function testLoggerMethods(logger) {
  console.log('📝 Testing logger methods...');
  
  const mockSignal = createMockSignal();
  const mockHologram = createMockHologram();
  const mockOrderResult = createMockOrderResult();

  // Test signal logging
  logger.logSignal(mockSignal, mockHologram, 'LONDON', 'ORDER_BLOCK', true);
  
  // Test execution logging
  logger.logExecution(mockOrderResult, 0.001, 'signal123', 2.5);
  
  // Test position close logging
  logger.logPositionClose(
    'pos123',
    'BTCUSDT', 
    'LONG',
    50000,
    52500,
    5.0,
    'TAKE_PROFIT',
    3600000,
    2.5
  );
  
  // Test error logging
  logger.logError('WARNING', 'Test warning message', {
    symbol: 'BTCUSDT',
    component: 'TestLogger'
  });

  // Wait for async writes to complete
  await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.WRITE_DELAY_MS));
}

/**
 * Validates log file creation and JSONL format
 * @param {string} logPath - Path to log file
 * @returns {boolean} True if validation passes
 */
function validateLogFile(logPath) {
  if (!fs.existsSync(logPath)) {
    console.error('❌ Log file was not created');
    return false;
  }

  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.trim().split('\n').filter(line => line.length > 0);
  
  console.log(`✅ Log file created with ${lines.length} entries`);
  
  // Verify JSONL format
  let validEntries = 0;
  lines.forEach((line, index) => {
    try {
      const entry = JSON.parse(line);
      console.log(`✅ Line ${index + 1}: Valid JSON (type: ${entry.type})`);
      validEntries++;
    } catch (error) {
      console.error(`❌ Line ${index + 1}: Invalid JSON - ${error.message}`);
    }
  });
  
  return validEntries === lines.length;
}

/**
 * Cleans up test artifacts
 */
function cleanupTestFiles() {
  try {
    if (fs.existsSync(TEST_CONFIG.LOG_DIR)) {
      fs.rmSync(TEST_CONFIG.LOG_DIR, { recursive: true, force: true });
      console.log('🧹 Cleaned up test files');
    }
  } catch (error) {
    console.warn(`⚠️ Failed to clean up test files: ${error.message}`);
  }
}

/**
 * Main test function
 */
async function testLogger() {
  console.log('🧪 Testing Logger integration...');
  
  let logger;
  let testPassed = false;
  
  try {
    // Create test logger
    logger = createTestLogger();
    
    // Test all logging methods
    await testLoggerMethods(logger);
    
    // Validate log file
    const logPath = path.join(TEST_CONFIG.LOG_DIR, TEST_CONFIG.LOG_FILE);
    const fileValid = validateLogFile(logPath);
    
    if (fileValid) {
      // Test log stats
      const stats = await logger.getLogStats();
      console.log('📊 Log Stats:', stats);
      testPassed = true;
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Ensure cleanup happens regardless of test outcome
    if (logger) {
      try {
        await logger.close();
      } catch (error) {
        console.warn(`⚠️ Failed to close logger: ${error.message}`);
      }
    }
    
    cleanupTestFiles();
    
    if (testPassed) {
      console.log('✅ Logger integration test completed successfully');
    } else {
      console.log('❌ Logger integration test failed');
      process.exit(1);
    }
  }
}

// Execute test if run directly
if (require.main === module) {
  testLogger().catch(error => {
    console.error('💥 Unhandled test error:', error);
    process.exit(1);
  });
}