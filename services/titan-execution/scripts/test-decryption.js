#!/usr/bin/env node

/**
 * Test Credential Decryption Script
 * 
 * Tests that encrypted credentials can be decrypted successfully.
 * 
 * Usage:
 *   export TITAN_MASTER_PASSWORD="your-strong-password"
 *   node scripts/test-decryption.js
 */

import { CredentialManager } from '../security/CredentialManager.js';
import 'dotenv/config';

console.log('🔓 Testing Credential Decryption');
console.log('================================\n');

// Get master password
const masterPassword = process.env.TITAN_MASTER_PASSWORD;

if (!masterPassword) {
  console.error('❌ TITAN_MASTER_PASSWORD environment variable not set');
  console.error('');
  console.error('Please set your master password:');
  console.error('  export TITAN_MASTER_PASSWORD="your-strong-password-here"');
  process.exit(1);
}

console.log('✅ Master password found');
console.log('');

// Initialize credential manager
const credentialManager = new CredentialManager({ masterPassword });

// Test decryption
try {
  console.log('🔓 Decrypting credentials...');
  const credentials = credentialManager.decrypt();
  
  console.log('');
  console.log('✅ Decryption successful!');
  console.log('');
  console.log('📋 Decrypted credentials:');
  console.log('');
  
  // Bybit credentials
  if (credentials.bybit) {
    console.log('Bybit:');
    console.log('  API Key:', credentials.bybit.apiKey.substring(0, 8) + '...' + credentials.bybit.apiKey.substring(credentials.bybit.apiKey.length - 4));
    console.log('  API Secret:', credentials.bybit.apiSecret.substring(0, 8) + '...' + credentials.bybit.apiSecret.substring(credentials.bybit.apiSecret.length - 4));
    console.log('  Testnet:', credentials.bybit.testnet);
    console.log('  Category:', credentials.bybit.category);
    console.log('  Rate Limit:', credentials.bybit.rateLimitRps, 'req/s');
    console.log('  Max Retries:', credentials.bybit.maxRetries);
    console.log('  Cache TTL:', credentials.bybit.accountCacheTtl, 'ms');
    console.log('');
  }
  
  // Add other credential checks as needed
  
  console.log('✅ All credentials decrypted successfully');
  console.log('');
  console.log('🚀 You can now start the server:');
  console.log('   export TITAN_MASTER_PASSWORD="your-password"');
  console.log('   npm start');
  console.log('');
  
} catch (error) {
  console.error('');
  console.error('❌ Decryption failed:', error.message);
  console.error('');
  console.error('Possible causes:');
  console.error('  1. Wrong master password');
  console.error('  2. Corrupted credentials.enc file');
  console.error('  3. File not found at ~/.titan/credentials.enc');
  console.error('');
  console.error('Solutions:');
  console.error('  1. Verify master password is correct');
  console.error('  2. Check file exists: ls -lh ~/.titan/credentials.enc');
  console.error('  3. Re-encrypt credentials: node scripts/encrypt-credentials.js');
  console.error('');
  process.exit(1);
}
