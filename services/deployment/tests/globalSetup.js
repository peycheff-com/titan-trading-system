/**
 * Global Jest Setup
 * 
 * Validates test configuration and environment before running tests
 */

const fs = require('fs');
const path = require('path');

module.exports = async () => {
  console.log('🔧 Validating test environment...');
  
  // Validate required setup files exist
  const requiredFiles = [
    'tests/setup.ts',
    'tests/integration/setup.ts'
  ];
  
  const missingFiles = [];
  
  for (const file of requiredFiles) {
    const filePath = path.join(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(file);
    }
  }
  
  if (missingFiles.length > 0) {
    console.error('❌ Missing required test setup files:', missingFiles);
    throw new Error(`Missing test setup files: ${missingFiles.join(', ')}`);
  }
  
  // Validate test directories can be created
  const testDir = path.join(__dirname, '..', 'test-deployment');
  try {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    // Test write permissions
    const testFile = path.join(testDir, 'test-write.tmp');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch (error) {
    console.error('❌ Cannot create test directories:', error.message);
    throw new Error('Test directory setup failed');
  }
  
  console.log('✅ Test environment validation complete');
};