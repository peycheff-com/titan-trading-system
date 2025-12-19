/**
 * CredentialManager - Secure Credential Storage with AES-256-GCM Encryption
 * 
 * Handles secure storage and retrieval of exchange API credentials using AES-256-GCM encryption.
 * Credentials are encrypted with a master password and stored in ~/.titan-scanner/secrets.enc
 * 
 * Security Features:
 * - AES-256-GCM authenticated encryption
 * - Random IV (Initialization Vector) for each encryption
 * - PBKDF2 key derivation from master password
 * - Salt stored with encrypted data
 * - Authentication tag verification on decryption
 * 
 * Requirements: Encrypted credential storage
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Exchange credentials structure
 */
export interface ExchangeCredentials {
  binance: {
    apiKey: string;
    apiSecret: string;
  };
  bybit: {
    apiKey: string;
    apiSecret: string;
  };
  mexc: {
    apiKey: string;
    apiSecret: string;
  };
}

/**
 * Encrypted data structure stored in file
 */
interface EncryptedData {
  version: number;           // Format version for future compatibility
  salt: string;              // Base64-encoded salt for key derivation
  iv: string;                // Base64-encoded initialization vector
  authTag: string;           // Base64-encoded authentication tag
  encryptedData: string;     // Base64-encoded encrypted credentials
}

/**
 * CredentialManager class
 */
export class CredentialManager {
  private readonly credentialsDir: string;
  private readonly credentialsPath: string;
  
  // Encryption constants
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_LENGTH = 32;        // 256 bits
  private readonly SALT_LENGTH = 32;       // 256 bits
  private readonly IV_LENGTH = 16;         // 128 bits
  private readonly PBKDF2_ITERATIONS = 100000;  // OWASP recommended minimum
  private readonly FORMAT_VERSION = 1;
  
  constructor() {
    // Use ~/.titan-scanner directory for credentials
    this.credentialsDir = path.join(os.homedir(), '.titan-scanner');
    this.credentialsPath = path.join(this.credentialsDir, 'secrets.enc');
    
    // Ensure credentials directory exists
    this.ensureCredentialsDir();
  }
  
  /**
   * Ensure credentials directory exists with secure permissions
   */
  private ensureCredentialsDir(): void {
    if (!fs.existsSync(this.credentialsDir)) {
      fs.mkdirSync(this.credentialsDir, { recursive: true, mode: 0o700 });
      console.log(`✅ Created credentials directory: ${this.credentialsDir}`);
    }
  }
  
  /**
   * Get master password from environment variable or prompt
   * Requirements: Support TITAN_MASTER_PASSWORD environment variable
   */
  private getMasterPassword(): string {
    const password = process.env.TITAN_MASTER_PASSWORD;
    
    if (!password) {
      throw new Error(
        'TITAN_MASTER_PASSWORD environment variable not set. ' +
        'Please set it before using credential manager.'
      );
    }
    
    if (password.length < 12) {
      throw new Error(
        'Master password must be at least 12 characters long for security.'
      );
    }
    
    return password;
  }
  
  /**
   * Derive encryption key from master password using PBKDF2
   * 
   * @param password - Master password
   * @param salt - Salt for key derivation
   * @returns Derived encryption key
   */
  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      password,
      salt,
      this.PBKDF2_ITERATIONS,
      this.KEY_LENGTH,
      'sha256'
    );
  }
  
  /**
   * Save credentials with AES-256-GCM encryption
   * Requirements: Implement saveCredentials() with AES-256-GCM encryption
   * 
   * @param credentials - Exchange credentials to encrypt and save
   */
  saveCredentials(credentials: ExchangeCredentials): void {
    try {
      // Get master password
      const masterPassword = this.getMasterPassword();
      
      // Generate random salt and IV
      const salt = crypto.randomBytes(this.SALT_LENGTH);
      const iv = crypto.randomBytes(this.IV_LENGTH);
      
      // Derive encryption key from password
      const key = this.deriveKey(masterPassword, salt);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
      
      // Serialize credentials to JSON
      const plaintext = JSON.stringify(credentials);
      
      // Encrypt data
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      // Get authentication tag
      const authTag = cipher.getAuthTag();
      
      // Create encrypted data structure
      const encryptedData: EncryptedData = {
        version: this.FORMAT_VERSION,
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        encryptedData: encrypted,
      };
      
      // Ensure directory exists
      this.ensureCredentialsDir();
      
      // Write encrypted data to file with secure permissions
      fs.writeFileSync(
        this.credentialsPath,
        JSON.stringify(encryptedData, null, 2),
        { mode: 0o600 }  // Read/write for owner only
      );
      
      console.log('✅ Credentials encrypted and saved');
      console.log(`🔒 Location: ${this.credentialsPath}`);
      console.log(`🔐 Encryption: AES-256-GCM with PBKDF2 (${this.PBKDF2_ITERATIONS} iterations)`);
    } catch (error) {
      console.error(`❌ Failed to save credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
  
  /**
   * Load credentials with master password decryption
   * Requirements: Implement loadCredentials() with master password decryption
   * 
   * @returns Decrypted exchange credentials
   * @throws Error if decryption fails or credentials file doesn't exist
   */
  loadCredentials(): ExchangeCredentials {
    try {
      // Check if credentials file exists
      if (!fs.existsSync(this.credentialsPath)) {
        throw new Error(
          `Credentials file not found: ${this.credentialsPath}\n` +
          'Please save credentials first using saveCredentials()'
        );
      }
      
      // Read encrypted data from file
      const fileContent = fs.readFileSync(this.credentialsPath, 'utf-8');
      const encryptedData: EncryptedData = JSON.parse(fileContent);
      
      // Validate format version
      if (encryptedData.version !== this.FORMAT_VERSION) {
        throw new Error(
          `Unsupported credentials format version: ${encryptedData.version}. ` +
          `Expected version: ${this.FORMAT_VERSION}`
        );
      }
      
      // Get master password
      const masterPassword = this.getMasterPassword();
      
      // Decode base64 values
      const salt = Buffer.from(encryptedData.salt, 'base64');
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const authTag = Buffer.from(encryptedData.authTag, 'base64');
      
      // Derive encryption key from password
      const key = this.deriveKey(masterPassword, salt);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      
      // Decrypt data
      let decrypted = decipher.update(encryptedData.encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Parse JSON
      const credentials: ExchangeCredentials = JSON.parse(decrypted);
      
      console.log('✅ Credentials decrypted successfully');
      
      return credentials;
    } catch (error) {
      if (error instanceof Error) {
        // Provide helpful error messages
        if (error.message.includes('bad decrypt') || error.message.includes('Unsupported state')) {
          throw new Error(
            'Failed to decrypt credentials. ' +
            'This usually means the master password is incorrect or the file is corrupted.'
          );
        }
      }
      
      console.error(`❌ Failed to load credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
  
  /**
   * Check if credentials file exists
   * 
   * @returns True if credentials file exists
   */
  credentialsExist(): boolean {
    return fs.existsSync(this.credentialsPath);
  }
  
  /**
   * Delete credentials file
   * 
   * @returns True if file was deleted, false if it didn't exist
   */
  deleteCredentials(): boolean {
    try {
      if (fs.existsSync(this.credentialsPath)) {
        fs.unlinkSync(this.credentialsPath);
        console.log('✅ Credentials file deleted');
        return true;
      }
      return false;
    } catch (error) {
      console.error(`❌ Failed to delete credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
  
  /**
   * Get credentials file path
   * 
   * @returns Path to encrypted credentials file
   */
  getCredentialsPath(): string {
    return this.credentialsPath;
  }
  
  /**
   * Validate credentials structure
   * 
   * @param credentials - Credentials to validate
   * @returns Array of validation errors, empty if valid
   */
  validateCredentials(credentials: ExchangeCredentials): string[] {
    const errors: string[] = [];
    
    // Validate Binance credentials
    if (!credentials.binance) {
      errors.push('Binance credentials missing');
    } else {
      if (!credentials.binance.apiKey || credentials.binance.apiKey.trim() === '') {
        errors.push('Binance API key is required');
      }
      if (!credentials.binance.apiSecret || credentials.binance.apiSecret.trim() === '') {
        errors.push('Binance API secret is required');
      }
    }
    
    // Validate Bybit credentials
    if (!credentials.bybit) {
      errors.push('Bybit credentials missing');
    } else {
      if (!credentials.bybit.apiKey || credentials.bybit.apiKey.trim() === '') {
        errors.push('Bybit API key is required');
      }
      if (!credentials.bybit.apiSecret || credentials.bybit.apiSecret.trim() === '') {
        errors.push('Bybit API secret is required');
      }
    }
    
    // Validate MEXC credentials (optional, but if provided must be complete)
    if (credentials.mexc) {
      if (credentials.mexc.apiKey && !credentials.mexc.apiSecret) {
        errors.push('MEXC API secret is required when API key is provided');
      }
      if (!credentials.mexc.apiKey && credentials.mexc.apiSecret) {
        errors.push('MEXC API key is required when API secret is provided');
      }
    }
    
    return errors;
  }
  
  /**
   * Create empty credentials template
   * 
   * @returns Empty credentials structure
   */
  createEmptyCredentials(): ExchangeCredentials {
    return {
      binance: {
        apiKey: '',
        apiSecret: '',
      },
      bybit: {
        apiKey: '',
        apiSecret: '',
      },
      mexc: {
        apiKey: '',
        apiSecret: '',
      },
    };
  }
  
  /**
   * Update specific exchange credentials
   * 
   * @param exchange - Exchange name
   * @param apiKey - API key
   * @param apiSecret - API secret
   * @param skipValidation - Skip full validation (useful for partial updates)
   */
  updateExchangeCredentials(
    exchange: 'binance' | 'bybit' | 'mexc',
    apiKey: string,
    apiSecret: string,
    skipValidation: boolean = false
  ): void {
    // Load existing credentials or create new
    let credentials: ExchangeCredentials;
    
    try {
      credentials = this.loadCredentials();
    } catch {
      credentials = this.createEmptyCredentials();
    }
    
    // Update specific exchange
    credentials[exchange] = {
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
    };
    
    // Validate and save (skip validation if requested for partial updates)
    if (!skipValidation) {
      const errors = this.validateCredentials(credentials);
      if (errors.length > 0) {
        throw new Error(`Credential validation failed:\n${errors.join('\n')}`);
      }
    }
    
    this.saveCredentials(credentials);
    console.log(`✅ ${exchange.toUpperCase()} credentials updated`);
  }
  
  /**
   * Change master password
   * Re-encrypts credentials with new password
   * 
   * @param newPassword - New master password
   */
  changeMasterPassword(newPassword: string): void {
    if (newPassword.length < 12) {
      throw new Error('New master password must be at least 12 characters long');
    }
    
    // Load credentials with old password
    const credentials = this.loadCredentials();
    
    // Temporarily set new password in environment
    const oldPassword = process.env.TITAN_MASTER_PASSWORD;
    process.env.TITAN_MASTER_PASSWORD = newPassword;
    
    try {
      // Save with new password
      this.saveCredentials(credentials);
      console.log('✅ Master password changed successfully');
    } catch (error) {
      // Restore old password on failure
      process.env.TITAN_MASTER_PASSWORD = oldPassword;
      throw error;
    }
  }
}
