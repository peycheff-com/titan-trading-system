#!/usr/bin/env node

/**
 * Setup production credentials for Titan Scavenger
 * 
 * This script will prompt you for real API credentials and encrypt them securely.
 * 
 * REQUIRED API KEYS:
 * 1. Binance API Key & Secret (for signal validation)
 * 2. Bybit API Key & Secret (for order execution - optional if using titan-execution)
 * 3. MEXC API Key & Secret (optional backup exchange)
 * 
 * GET YOUR API KEYS:
 * - Binance: https://www.binance.com/en/my/settings/api-management
 * - Bybit: https://www.bybit.com/app/user/api-management
 * - MEXC: https://www.mexc.com/user/api
 * 
 * SECURITY RECOMMENDATIONS:
 * - Use API keys with minimal permissions (read-only for Binance, trading for Bybit)
 * - Enable IP whitelist restrictions
 * - Set withdrawal restrictions
 * - Use testnet keys first for testing
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Encryption settings
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const SALT_LENGTH = 32; // 256 bits

function encryptCredentials(credentials, masterPassword) {
  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Derive key from master password using PBKDF2
  const key = crypto.pbkdf2Sync(masterPassword, salt, 100000, KEY_LENGTH, 'sha256');
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt credentials
  const credentialsJson = JSON.stringify(credentials);
  let encrypted = cipher.update(credentialsJson, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  // Get authentication tag
  const authTag = cipher.getAuthTag();
  
  // Return encrypted data structure
  return {
    version: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encryptedData: encrypted
  };
}

function validateApiKey(key, exchange) {
  if (!key || key.trim().length === 0) {
    return `${exchange} API key cannot be empty`;
  }
  
  if (key.includes('mock') || key.includes('development') || key.includes('test')) {
    return `${exchange} API key appears to be a mock/test key`;
  }
  
  // Basic length validation
  if (key.length < 16) {
    return `${exchange} API key is too short (minimum 16 characters)`;
  }
  
  return null;
}

function validateApiSecret(secret, exchange) {
  if (!secret || secret.trim().length === 0) {
    return `${exchange} API secret cannot be empty`;
  }
  
  if (secret.includes('mock') || secret.includes('development') || secret.includes('test')) {
    return `${exchange} API secret appears to be a mock/test key`;
  }
  
  // Basic length validation
  if (secret.length < 16) {
    return `${exchange} API secret is too short (minimum 16 characters)`;
  }
  
  return null;
}

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function askSecretQuestion(rl, question) {
  return new Promise((resolve) => {
    // Hide input for secrets
    const stdin = process.stdin;
    stdin.setRawMode(true);
    
    let input = '';
    process.stdout.write(question);
    
    stdin.on('data', function handler(char) {
      char = char.toString();
      
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004': // Ctrl+D
          stdin.setRawMode(false);
          stdin.removeListener('data', handler);
          process.stdout.write('\n');
          resolve(input.trim());
          break;
        case '\u0003': // Ctrl+C
          process.exit(1);
          break;
        case '\u007f': // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          input += char;
          process.stdout.write('*');
          break;
      }
    });
  });
}

async function main() {
  console.log('🔐 Titan Scavenger - Production Credential Setup');
  console.log('================================================\n');
  
  console.log('⚠️  SECURITY WARNING:');
  console.log('   - Only use API keys with minimal required permissions');
  console.log('   - Enable IP whitelist restrictions');
  console.log('   - Disable withdrawal permissions');
  console.log('   - Test with testnet keys first\n');
  
  const rl = createReadlineInterface();
  
  try {
    // Get master password
    console.log('🔑 Master Password Setup:');
    const masterPassword = await askSecretQuestion(rl, 'Enter a secure master password (12+ characters): ');
    
    if (masterPassword.length < 12) {
      console.error('❌ Master password must be at least 12 characters long');
      process.exit(1);
    }
    
    const confirmPassword = await askSecretQuestion(rl, 'Confirm master password: ');
    
    if (masterPassword !== confirmPassword) {
      console.error('❌ Passwords do not match');
      process.exit(1);
    }
    
    console.log('✅ Master password set\n');
    
    // Get API credentials
    console.log('🔗 Exchange API Credentials:');
    console.log('');
    
    // Binance credentials (required for signal validation)
    console.log('📊 Binance (Required - for signal validation):');
    console.log('   Get keys from: https://www.binance.com/en/my/settings/api-management');
    console.log('   Permissions needed: Read-only (Spot & Futures)');
    const binanceApiKey = await askQuestion(rl, '   API Key: ');
    const binanceApiSecret = await askSecretQuestion(rl, '   API Secret: ');
    
    // Validate Binance credentials
    let error = validateApiKey(binanceApiKey, 'Binance');
    if (error) {
      console.error(`❌ ${error}`);
      process.exit(1);
    }
    
    error = validateApiSecret(binanceApiSecret, 'Binance');
    if (error) {
      console.error(`❌ ${error}`);
      process.exit(1);
    }
    
    console.log('   ✅ Binance credentials validated\n');
    
    // Bybit credentials (optional - execution handled by titan-execution)
    console.log('⚡ Bybit (Optional - for direct execution):');
    console.log('   Get keys from: https://www.bybit.com/app/user/api-management');
    console.log('   Permissions needed: Trading (Derivatives)');
    console.log('   Note: titan-execution service handles execution by default');
    
    const useBybit = await askQuestion(rl, '   Configure Bybit? (y/N): ');
    let bybitApiKey = 'not_configured';
    let bybitApiSecret = 'not_configured';
    
    if (useBybit.toLowerCase() === 'y' || useBybit.toLowerCase() === 'yes') {
      bybitApiKey = await askQuestion(rl, '   API Key: ');
      bybitApiSecret = await askSecretQuestion(rl, '   API Secret: ');
      
      // Validate Bybit credentials
      error = validateApiKey(bybitApiKey, 'Bybit');
      if (error) {
        console.error(`❌ ${error}`);
        process.exit(1);
      }
      
      error = validateApiSecret(bybitApiSecret, 'Bybit');
      if (error) {
        console.error(`❌ ${error}`);
        process.exit(1);
      }
      
      console.log('   ✅ Bybit credentials validated');
    } else {
      console.log('   ⏭️  Skipping Bybit configuration');
    }
    
    console.log('');
    
    // MEXC credentials (optional backup)
    console.log('🔄 MEXC (Optional - backup exchange):');
    console.log('   Get keys from: https://www.mexc.com/user/api');
    
    const useMexc = await askQuestion(rl, '   Configure MEXC? (y/N): ');
    let mexcApiKey = 'not_configured';
    let mexcApiSecret = 'not_configured';
    
    if (useMexc.toLowerCase() === 'y' || useMexc.toLowerCase() === 'yes') {
      mexcApiKey = await askQuestion(rl, '   API Key: ');
      mexcApiSecret = await askSecretQuestion(rl, '   API Secret: ');
      
      // Validate MEXC credentials
      error = validateApiKey(mexcApiKey, 'MEXC');
      if (error) {
        console.error(`❌ ${error}`);
        process.exit(1);
      }
      
      error = validateApiSecret(mexcApiSecret, 'MEXC');
      if (error) {
        console.error(`❌ ${error}`);
        process.exit(1);
      }
      
      console.log('   ✅ MEXC credentials validated');
    } else {
      console.log('   ⏭️  Skipping MEXC configuration');
    }
    
    console.log('');
    
    // Create credentials object
    const credentials = {
      binance: {
        apiKey: binanceApiKey,
        apiSecret: binanceApiSecret,
      },
      bybit: {
        apiKey: bybitApiKey,
        apiSecret: bybitApiSecret,
      },
      mexc: {
        apiKey: mexcApiKey,
        apiSecret: mexcApiSecret,
      },
    };
    
    // Encrypt and save credentials
    console.log('💾 Saving encrypted credentials...');
    
    const credentialsDir = path.join(os.homedir(), '.titan-scanner');
    const credentialsPath = path.join(credentialsDir, 'secrets.enc');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(credentialsDir)) {
      fs.mkdirSync(credentialsDir, { recursive: true });
    }
    
    // Encrypt credentials
    const encryptedData = encryptCredentials(credentials, masterPassword);
    
    // Save to file
    fs.writeFileSync(credentialsPath, JSON.stringify(encryptedData, null, 2));
    
    console.log(`✅ Production credentials saved to: ${credentialsPath}`);
    console.log('');
    console.log('🔒 Security Summary:');
    console.log(`   - Credentials encrypted with AES-256-GCM`);
    console.log(`   - Master password required for decryption`);
    console.log(`   - File permissions: 600 (owner read/write only)`);
    
    // Set secure file permissions
    fs.chmodSync(credentialsPath, 0o600);
    
    console.log('');
    console.log('🚀 Next Steps:');
    console.log('   1. Set environment variable: export TITAN_MASTER_PASSWORD="your_password"');
    console.log('   2. Update titan-execution/.env with your Bybit credentials');
    console.log('   3. Restart all Titan services');
    console.log('   4. Monitor the dashboard for successful connections');
    console.log('');
    console.log('⚠️  IMPORTANT: Keep your master password secure and never commit it to version control!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();