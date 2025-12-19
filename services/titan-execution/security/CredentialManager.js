/**
 * Credential Manager for Titan Execution Service
 * 
 * Encrypts and decrypts API credentials using AES-256-GCM.
 * Requires TITAN_MASTER_PASSWORD environment variable.
 * 
 * Requirements: 10.4-10.5
 * 
 * Usage:
 *   const credManager = new CredentialManager({ masterPassword: process.env.TITAN_MASTER_PASSWORD });
 *   
 *   // Encrypt credentials
 *   credManager.encrypt({
 *     bybit: { apiKey: '...', apiSecret: '...' },
 *     mexc: { apiKey: '...', apiSecret: '...' }
 *   });
 *   
 *   // Decrypt credentials
 *   const creds = credManager.decrypt();
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CredentialManager {
  constructor({ masterPassword, credentialsPath }) {
    if (!masterPassword) {
      throw new Error('Master password is required. Set TITAN_MASTER_PASSWORD environment variable.');
    }
    
    this.masterPassword = masterPassword;
    this.credentialsPath = credentialsPath || path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.titan',
      'credentials.enc'
    );
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits
    this.saltLength = 32;
    this.tagLength = 16;
  }
  
  /**
   * Property 31: Credential Encryption Round Trip
   * For any credentials, encrypting then decrypting should produce equivalent credentials
   * 
   * Encrypt credentials and save to file
   * @param {Object} credentials - Credentials object to encrypt
   */
  encrypt(credentials) {
    try {
      // Generate random salt
      const salt = crypto.randomBytes(this.saltLength);
      
      // Derive key from master password using PBKDF2
      const key = crypto.pbkdf2Sync(
        this.masterPassword,
        salt,
        100000, // iterations
        this.keyLength,
        'sha256'
      );
      
      // Generate random IV
      const iv = crypto.randomBytes(this.ivLength);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      // Encrypt credentials
      const credentialsJson = JSON.stringify(credentials);
      const encrypted = Buffer.concat([
        cipher.update(credentialsJson, 'utf8'),
        cipher.final()
      ]);
      
      // Get authentication tag
      const authTag = cipher.getAuthTag();
      
      // Combine: salt + iv + authTag + encrypted
      const combined = Buffer.concat([salt, iv, authTag, encrypted]);
      
      // Ensure directory exists
      const dir = path.dirname(this.credentialsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Write to file with restricted permissions
      fs.writeFileSync(this.credentialsPath, combined, { mode: 0o600 });
      
      console.log(`✅ Credentials encrypted and saved to ${this.credentialsPath}`);
      console.log(`   File permissions: 600 (owner read/write only)`);
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to encrypt credentials: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Decrypt credentials from file
   * @returns {Object} Decrypted credentials object
   */
  decrypt() {
    try {
      // Check if file exists
      if (!fs.existsSync(this.credentialsPath)) {
        throw new Error(`Credentials file not found: ${this.credentialsPath}`);
      }
      
      // Read encrypted file
      const combined = fs.readFileSync(this.credentialsPath);
      
      // Extract components
      let offset = 0;
      const salt = combined.slice(offset, offset + this.saltLength);
      offset += this.saltLength;
      
      const iv = combined.slice(offset, offset + this.ivLength);
      offset += this.ivLength;
      
      const authTag = combined.slice(offset, offset + this.tagLength);
      offset += this.tagLength;
      
      const encrypted = combined.slice(offset);
      
      // Derive key from master password
      const key = crypto.pbkdf2Sync(
        this.masterPassword,
        salt,
        100000, // iterations (must match encryption)
        this.keyLength,
        'sha256'
      );
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      // Parse JSON
      const credentials = JSON.parse(decrypted.toString('utf8'));
      
      console.log(`✅ Credentials decrypted successfully`);
      
      return credentials;
    } catch (error) {
      if (error.message.includes('bad decrypt')) {
        throw new Error('Failed to decrypt credentials. Invalid master password or corrupted file.');
      }
      console.error(`❌ Failed to decrypt credentials: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check if encrypted credentials file exists
   * @returns {boolean}
   */
  exists() {
    return fs.existsSync(this.credentialsPath);
  }
  
  /**
   * Delete encrypted credentials file
   */
  delete() {
    if (fs.existsSync(this.credentialsPath)) {
      fs.unlinkSync(this.credentialsPath);
      console.log(`✅ Credentials file deleted: ${this.credentialsPath}`);
    }
  }
  
  /**
   * Rotate master password (re-encrypt with new password)
   * @param {string} newMasterPassword - New master password
   */
  rotateMasterPassword(newMasterPassword) {
    // Decrypt with old password
    const credentials = this.decrypt();
    
    // Backup old credentials file
    const backupPath = `${this.credentialsPath}.backup.${Date.now()}`;
    if (fs.existsSync(this.credentialsPath)) {
      fs.copyFileSync(this.credentialsPath, backupPath);
      console.log(`📄 Backup created: ${backupPath}`);
    }
    
    // Update master password
    this.masterPassword = newMasterPassword;
    
    // Re-encrypt with new password
    this.encrypt(credentials);
    
    console.log(`✅ Master password rotated successfully`);
  }

  /**
   * Rotate encryption keys (re-encrypt with new salt and IV)
   * Provides additional security by changing encryption parameters
   */
  rotateEncryptionKeys() {
    // Decrypt with current parameters
    const credentials = this.decrypt();
    
    // Backup old credentials file
    const backupPath = `${this.credentialsPath}.backup.${Date.now()}`;
    if (fs.existsSync(this.credentialsPath)) {
      fs.copyFileSync(this.credentialsPath, backupPath);
      console.log(`📄 Backup created: ${backupPath}`);
    }
    
    // Re-encrypt with new salt and IV (encrypt() generates new random values)
    this.encrypt(credentials);
    
    console.log(`✅ Encryption keys rotated successfully`);
  }

  /**
   * Scheduled key rotation (should be called periodically)
   * @param {number} rotationIntervalDays - Days between rotations (default: 90)
   */
  scheduleKeyRotation(rotationIntervalDays = 90) {
    const rotationInterval = rotationIntervalDays * 24 * 60 * 60 * 1000; // Convert to milliseconds
    
    setInterval(() => {
      try {
        console.log('🔄 Performing scheduled key rotation...');
        this.rotateEncryptionKeys();
        console.log('✅ Scheduled key rotation completed');
      } catch (error) {
        console.error(`❌ Scheduled key rotation failed: ${error.message}`);
      }
    }, rotationInterval);
    
    console.log(`⏰ Scheduled key rotation every ${rotationIntervalDays} days`);
  }
  
  /**
   * Validate credentials structure
   * @param {Object} credentials - Credentials to validate
   * @returns {boolean}
   */
  static validateCredentials(credentials) {
    if (!credentials || typeof credentials !== 'object') {
      return false;
    }
    
    // Check for required exchanges
    const requiredExchanges = ['bybit'];
    for (const exchange of requiredExchanges) {
      if (!credentials[exchange]) {
        console.error(`❌ Missing credentials for ${exchange}`);
        return false;
      }
      
      if (!credentials[exchange].apiKey || !credentials[exchange].apiSecret) {
        console.error(`❌ Invalid credentials for ${exchange}: missing apiKey or apiSecret`);
        return false;
      }
    }
    
    return true;
  }
}

/**
 * CLI tool for managing credentials
 * 
 * Usage:
 *   node CredentialManager.js encrypt
 *   node CredentialManager.js decrypt
 *   node CredentialManager.js rotate
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  if (!process.env.TITAN_MASTER_PASSWORD) {
    console.error('❌ TITAN_MASTER_PASSWORD environment variable not set');
    process.exit(1);
  }
  
  const credManager = new CredentialManager({
    masterPassword: process.env.TITAN_MASTER_PASSWORD
  });
  
  switch (command) {
    case 'encrypt': {
      console.log('Enter credentials (JSON format):');
      console.log('Example: {"bybit":{"apiKey":"...","apiSecret":"..."},"mexc":{"apiKey":"...","apiSecret":"..."}}');
      
      // Read from stdin
      let input = '';
      process.stdin.on('data', (chunk) => {
        input += chunk;
      });
      
      process.stdin.on('end', () => {
        try {
          const credentials = JSON.parse(input);
          
          if (!CredentialManager.validateCredentials(credentials)) {
            console.error('❌ Invalid credentials structure');
            process.exit(1);
          }
          
          credManager.encrypt(credentials);
          console.log('✅ Credentials encrypted successfully');
        } catch (error) {
          console.error(`❌ Failed to encrypt: ${error.message}`);
          process.exit(1);
        }
      });
      break;
    }
    
    case 'decrypt': {
      try {
        const credentials = credManager.decrypt();
        console.log('\n📄 Decrypted Credentials:');
        console.log(JSON.stringify(credentials, null, 2));
      } catch (error) {
        console.error(`❌ Failed to decrypt: ${error.message}`);
        process.exit(1);
      }
      break;
    }
    
    case 'rotate': {
      if (!process.env.TITAN_NEW_MASTER_PASSWORD) {
        console.error('❌ TITAN_NEW_MASTER_PASSWORD environment variable not set');
        process.exit(1);
      }
      
      try {
        credManager.rotateMasterPassword(process.env.TITAN_NEW_MASTER_PASSWORD);
        console.log('✅ Master password rotated successfully');
      } catch (error) {
        console.error(`❌ Failed to rotate: ${error.message}`);
        process.exit(1);
      }
      break;
    }
    
    case 'exists': {
      if (credManager.exists()) {
        console.log('✅ Credentials file exists');
        process.exit(0);
      } else {
        console.log('❌ Credentials file does not exist');
        process.exit(1);
      }
      break;
    }
    
    default:
      console.log('Usage: node CredentialManager.js <command>');
      console.log('Commands:');
      console.log('  encrypt  - Encrypt credentials from stdin');
      console.log('  decrypt  - Decrypt and display credentials');
      console.log('  rotate   - Rotate master password');
      console.log('  exists   - Check if credentials file exists');
      process.exit(1);
  }
}
