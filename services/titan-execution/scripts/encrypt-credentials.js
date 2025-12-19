#!/usr/bin/env node

/**
 * Credential Encryption Script
 * 
 * Encrypts API credentials using AES-256-GCM with master password.
 * 
 * Requirements: 10.4-10.5 - Encrypt credentials with AES-256-GCM
 * 
 * Usage:
 *   export TITAN_MASTER_PASSWORD="your-strong-password"
 *   export BYBIT_API_KEY="your-api-key"
 *   export BYBIT_API_SECRET="your-api-secret"
 *   node scripts/encrypt-credentials.js
 */

import { CredentialManager } from '../security/CredentialManager.js';
import 'dotenv/config';

console.log('🔐 Titan Credential Encryption');
console.log('==============================\n');

// Get master password
const masterPassword = process.env.TITAN_MASTER_PASSWORD;

if (!masterPassword) {
  console.error('❌ TITAN_MASTER_PASSWORD environment variable not set');
  console.error('');
  console.error('Please set your master password:');
  console.error('  export TITAN_MASTER_PASSWORD="your-strong-password-here"');
  console.error('');
  console.error('Password requirements:');
  console.error('  - Minimum 16 characters');
  console.error('  - Mix of uppercase, lowercase, numbers, symbols');
  console.error('  - Not a dictionary word');
  console.error('');
  console.error('Generate a strong password:');
  console.error('  node -e "console.log(require(\'crypto\').randomBytes(16).toString(\'hex\'))"');
  process.exit(1);
}

// Validate master password strength
if (masterPassword.length < 16) {
  console.error('❌ Master password must be at least 16 characters');
  console.error('   Current length:', masterPassword.length);
  console.error('');
  console.error('Generate a stronger password:');
  console.error('  node -e "console.log(require(\'crypto\').randomBytes(16).toString(\'hex\'))"');
  process.exit(1);
}

console.log('✅ Master password validated');
console.log('   Length:', masterPassword.length, 'characters');
console.log('');

// Get credentials from environment
const credentials = {
  bybit: {
    apiKey: process.env.BYBIT_API_KEY || '',
    apiSecret: process.env.BYBIT_API_SECRET || '',
    testnet: process.env.BYBIT_TESTNET === 'true',
    category: process.env.BYBIT_CATEGORY || 'linear',
    rateLimitRps: parseInt(process.env.BYBIT_RATE_LIMIT_RPS || '10'),
    maxRetries: parseInt(process.env.BYBIT_MAX_RETRIES || '3'),
    accountCacheTtl: parseInt(process.env.BYBIT_ACCOUNT_CACHE_TTL || '5000')
  },
  // Add other credentials as needed
  // mexc: { ... },
  // binance: { ... }
};

// Validate Bybit credentials
if (!credentials.bybit.apiKey || !credentials.bybit.apiSecret) {
  console.error('❌ Bybit API credentials not set');
  console.error('');
  console.error('Please set your Bybit API credentials:');
  console.error('  export BYBIT_API_KEY="your-api-key"');
  console.error('  export BYBIT_API_SECRET="your-api-secret"');
  console.error('');
  console.error('Get API keys from:');
  console.error('  Testnet: https://testnet.bybit.com/app/user/api-management');
  console.error('  Mainnet: https://www.bybit.com/app/user/api-management');
  process.exit(1);
}

console.log('✅ Credentials validated');
console.log('   Bybit API Key:', credentials.bybit.apiKey.substring(0, 8) + '...');
console.log('   Bybit Testnet:', credentials.bybit.testnet);
console.log('   Bybit Category:', credentials.bybit.category);
console.log('');

// Initialize credential manager
const credentialManager = new CredentialManager({ masterPassword });

// Encrypt and save
try {
  console.log('🔒 Encrypting credentials...');
  credentialManager.encrypt(credentials);
  
  console.log('');
  console.log('✅ Credentials encrypted successfully!');
  console.log('');
  console.log('📁 Encrypted file location:');
  console.log('   ~/.titan/credentials.enc');
  console.log('');
  console.log('🔐 Encryption details:');
  console.log('   Algorithm: AES-256-GCM');
  console.log('   Key Size: 256 bits');
  console.log('   IV Size: 128 bits');
  console.log('   Auth Tag: 128 bits');
  console.log('');
  console.log('⚠️  IMPORTANT SECURITY NOTES:');
  console.log('   1. Keep your master password safe and secure');
  console.log('   2. Never commit credentials.enc to version control');
  console.log('   3. Back up credentials.enc to a secure location');
  console.log('   4. Rotate credentials regularly (every 90 days)');
  console.log('   5. Use different master passwords for dev/staging/prod');
  console.log('');
  console.log('🚀 Next steps:');
  console.log('   1. Verify encryption:');
  console.log('      ls -lh ~/.titan/credentials.enc');
  console.log('');
  console.log('   2. Test decryption:');
  console.log('      node scripts/test-decryption.js');
  console.log('');
  console.log('   3. Start server with encrypted credentials:');
  console.log('      export TITAN_MASTER_PASSWORD="your-password"');
  console.log('      npm start');
  console.log('');
  
} catch (error) {
  console.error('');
  console.error('❌ Encryption failed:', error.message);
  console.error('');
  console.error('Troubleshooting:');
  console.error('  1. Verify master password is set correctly');
  console.error('  2. Check file permissions on ~/.titan/ directory');
  console.error('  3. Ensure you have write access to ~/.titan/');
  console.error('');
  process.exit(1);
}
