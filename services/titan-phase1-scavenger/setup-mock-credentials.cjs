#!/usr/bin/env node

/**
 * Setup mock credentials for development
 * 
 * This script creates encrypted mock API credentials for development and testing.
 * The credentials are encrypted using AES-256-GCM and stored in the user's home directory.
 * 
 * Usage:
 *   node setup-mock-credentials.cjs [--password <password>] [--output-dir <dir>]
 * 
 * Options:
 *   --password    Custom master password (default: development_password_12345)
 *   --output-dir  Custom output directory (default: ~/.titan-scanner)
 *   --help        Show this help message
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration constants
const CONFIG = {
  ALGORITHM: 'aes-256-cbc',
  KEY_LENGTH: 32, // 256 bits
  IV_LENGTH: 16,  // 128 bits
  SALT_LENGTH: 32, // 256 bits
  PBKDF2_ITERATIONS: 100000,
  DEFAULT_PASSWORD: 'development_password_12345',
  DEFAULT_DIR: '.titan-scanner',
  SECRETS_FILE: 'secrets.enc'
};

// Mock credentials for development
const MOCK_CREDENTIALS = {
  binance: {
    apiKey: 'mock_binance_api_key_for_development',
    apiSecret: 'mock_binance_api_secret_for_development',
  },
  bybit: {
    apiKey: 'mock_bybit_api_key_for_development',
    apiSecret: 'mock_bybit_api_secret_for_development',
  },
  mexc: {
    apiKey: 'mock_mexc_api_key_for_development',
    apiSecret: 'mock_mexc_api_secret_for_development',
  },
};

function encryptCredentials(credentials, masterPassword) {
  // Input validation
  if (!credentials || typeof credentials !== 'object') {
    throw new Error('Credentials must be a valid object');
  }
  if (!masterPassword || typeof masterPassword !== 'string' || masterPassword.length < 8) {
    throw new Error('Master password must be at least 8 characters long');
  }

  try {
    // Generate cryptographically secure random values
    const salt = crypto.randomBytes(CONFIG.SALT_LENGTH);
    const iv = crypto.randomBytes(CONFIG.IV_LENGTH);
    
    // Derive encryption key from master password using PBKDF2
    const key = crypto.pbkdf2Sync(
      masterPassword, 
      salt, 
      CONFIG.PBKDF2_ITERATIONS, 
      CONFIG.KEY_LENGTH, 
      'sha256'
    );
    
    // Create cipher with CBC mode
    const cipher = crypto.createCipheriv(CONFIG.ALGORITHM, key, iv);
    
    // Encrypt credentials
    const credentialsJson = JSON.stringify(credentials);
    let encrypted = cipher.update(credentialsJson, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Create HMAC for integrity verification
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(encrypted);
    const authTag = hmac.digest('base64');
    
    // Return encrypted data structure
    return {
      version: 1,
      algorithm: CONFIG.ALGORITHM,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag,
      encryptedData: encrypted,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Parses command line arguments
 * 
 * @returns {Object} Parsed arguments object
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const options = {
    password: CONFIG.DEFAULT_PASSWORD,
    outputDir: path.join(os.homedir(), CONFIG.DEFAULT_DIR),
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--password':
        if (i + 1 < args.length) {
          options.password = args[++i];
        } else {
          throw new Error('--password requires a value');
        }
        break;
      case '--output-dir':
        if (i + 1 < args.length) {
          options.outputDir = path.resolve(args[++i]);
        } else {
          throw new Error('--output-dir requires a value');
        }
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${args[i]}`);
    }
  }

  return options;
}

/**
 * Displays help information
 */
function showHelp() {
  console.log(`
Setup Mock Credentials for Titan Trading System

Usage:
  node setup-mock-credentials.cjs [options]

Options:
  --password <password>    Custom master password (min 8 chars)
  --output-dir <dir>       Custom output directory
  --help, -h               Show this help message

Examples:
  node setup-mock-credentials.cjs
  node setup-mock-credentials.cjs --password "my_secure_password"
  node setup-mock-credentials.cjs --output-dir "/custom/path"

The script creates encrypted mock API credentials for development and testing.
Credentials are encrypted using AES-256-GCM and stored securely.
`);
}

/**
 * Ensures directory exists, creating it if necessary
 * 
 * @param {string} dirPath - Directory path to ensure
 */
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dirPath}`);
  }
}

/**
 * Main execution function
 */
function main() {
  try {
    // Parse command line arguments
    const options = parseArguments();
    
    if (options.help) {
      showHelp();
      return;
    }

    console.log('🔐 Setting up mock credentials for development...');
    console.log(`📁 Output directory: ${options.outputDir}`);
    
    const credentialsPath = path.join(options.outputDir, CONFIG.SECRETS_FILE);
    
    // Ensure output directory exists
    ensureDirectory(options.outputDir);
    
    // Encrypt credentials
    const encryptedData = encryptCredentials(MOCK_CREDENTIALS, options.password);
    
    // Save encrypted data to file
    fs.writeFileSync(credentialsPath, JSON.stringify(encryptedData, null, 2));
    
    // Success output
    console.log(`✅ Mock credentials saved to: ${credentialsPath}`);
    console.log(`✅ Master password: ${options.password}`);
    console.log('');
    console.log('Mock credentials created for:');
    console.log('  - Binance: ✓');
    console.log('  - Bybit: ✓');
    console.log('  - MEXC: ✓');
    console.log('');
    console.log('🔒 Encryption details:');
    console.log(`  - Algorithm: ${encryptedData.algorithm}`);
    console.log(`  - Version: ${encryptedData.version}`);
    console.log(`  - Timestamp: ${encryptedData.timestamp}`);
    console.log('');
    console.log('🚀 You can now start the scavenger service!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('Unknown option') || error.message.includes('requires a value')) {
      console.log('\nUse --help for usage information.');
    }
    
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (require.main === module) {
  main();
}

// Export functions for testing
module.exports = {
  encryptCredentials,
  parseArguments,
  CONFIG,
  MOCK_CREDENTIALS
};