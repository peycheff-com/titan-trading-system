/**
 * API Key Manager - Handles secure key storage and automated rotation
 * 
 * Requirements:
 * - 4.2: THE Security_Layer SHALL implement API key rotation every 30 days
 * - 3.2: THE Configuration_Manager SHALL encrypt sensitive data (API keys, secrets) using AES-256-GCM
 */

import { promises as fs } from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export interface APIKey {
  id: string;
  name: string;
  key: string;
  secret?: string;
  service: string;
  environment: 'production' | 'staging' | 'development';
  createdAt: Date;
  expiresAt: Date;
  lastUsed?: Date;
  rotationCount: number;
  status: 'active' | 'expired' | 'revoked' | 'pending_rotation';
}

export interface EncryptedAPIKey {
  id: string;
  name: string;
  encryptedKey: string;
  encryptedSecret?: string;
  service: string;
  environment: string;
  createdAt: string;
  expiresAt: string;
  lastUsed?: string;
  rotationCount: number;
  status: string;
  iv: string;
  authTag: string;
}

export interface KeyRotationResult {
  success: boolean;
  keyId: string;
  oldKey?: string;
  newKey?: string;
  rotationTime: number;
  error?: string;
}

export interface KeyVault {
  keys: EncryptedAPIKey[];
  masterKeyHash: string;
  lastRotation: string;
  rotationSchedule: RotationSchedule;
  version: string;
}

export interface RotationSchedule {
  enabled: boolean;
  intervalDays: number;
  nextRotation: string;
  autoRotate: boolean;
  notificationDays: number[];
}

export class APIKeyManager {
  private readonly vaultPath: string;
  private readonly logFile: string;
  private readonly backupDir: string;
  private masterKey: Buffer;
  private vault: KeyVault;

  constructor(
    vaultPath: string = '/etc/titan/api-keys.vault',
    logFile: string = '/var/log/titan/api-key-manager.log',
    backupDir: string = '/var/backups/titan/keys'
  ) {
    this.vaultPath = vaultPath;
    this.logFile = logFile;
    this.backupDir = backupDir;
    this.vault = this.getDefaultVault();
  }

  /**
   * Initialize the API key manager with master password
   */
  async initialize(masterPassword: string): Promise<void> {
    try {
      this.log('Initializing API Key Manager...');

      // Derive master key from password
      this.masterKey = await this.deriveMasterKey(masterPassword);

      // Create necessary directories
      await this.createDirectories();

      // Load or create vault
      await this.loadVault();

      // Set up rotation schedule
      await this.setupRotationSchedule();

      this.log('API Key Manager initialized successfully');

    } catch (error) {
      this.log(`Failed to initialize API Key Manager: ${error.message}`);
      throw new Error(`Initialization failed: ${error.message}`);
    }
  }

  /**
   * Store API key securely
   */
  async storeAPIKey(
    name: string,
    key: string,
    secret: string | undefined,
    service: string,
    environment: 'production' | 'staging' | 'development' = 'production'
  ): Promise<string> {
    try {
      this.log(`Storing API key for service: ${service}`);

      // Generate unique ID
      const keyId = crypto.randomUUID();

      // Create API key object
      const apiKey: APIKey = {
        id: keyId,
        name,
        key,
        secret,
        service,
        environment,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)), // 30 days
        rotationCount: 0,
        status: 'active'
      };

      // Encrypt and store
      const encryptedKey = await this.encryptAPIKey(apiKey);
      this.vault.keys.push(encryptedKey);

      // Save vault
      await this.saveVault();

      // Create backup
      await this.createBackup(`key_added_${keyId}`);

      this.log(`API key stored successfully for service: ${service} (ID: ${keyId})`);
      
      // Log security event
      await this.logSecurityEvent('API_KEY_STORED', {
        keyId,
        service,
        environment
      });

      return keyId;

    } catch (error) {
      this.log(`Failed to store API key for service ${service}: ${error.message}`);
      throw new Error(`Key storage failed: ${error.message}`);
    }
  }

  /**
   * Retrieve API key by ID
   */
  async getAPIKey(keyId: string): Promise<APIKey | null> {
    try {
      const encryptedKey = this.vault.keys.find(k => k.id === keyId);
      if (!encryptedKey) {
        return null;
      }

      const apiKey = await this.decryptAPIKey(encryptedKey);
      
      // Update last used timestamp
      apiKey.lastUsed = new Date();
      const updatedEncryptedKey = await this.encryptAPIKey(apiKey);
      
      // Replace in vault
      const index = this.vault.keys.findIndex(k => k.id === keyId);
      this.vault.keys[index] = updatedEncryptedKey;
      
      await this.saveVault();

      return apiKey;

    } catch (error) {
      this.log(`Failed to retrieve API key ${keyId}: ${error.message}`);
      throw new Error(`Key retrieval failed: ${error.message}`);
    }
  }

  /**
   * Get API keys by service
   */
  async getAPIKeysByService(service: string, environment?: string): Promise<APIKey[]> {
    try {
      const keys: APIKey[] = [];

      for (const encryptedKey of this.vault.keys) {
        if (encryptedKey.service === service) {
          if (!environment || encryptedKey.environment === environment) {
            const apiKey = await this.decryptAPIKey(encryptedKey);
            keys.push(apiKey);
          }
        }
      }

      return keys.filter(key => key.status === 'active');

    } catch (error) {
      this.log(`Failed to get API keys for service ${service}: ${error.message}`);
      throw new Error(`Key retrieval failed: ${error.message}`);
    }
  }

  /**
   * Rotate API key
   */
  async rotateAPIKey(keyId: string, newKey: string, newSecret?: string): Promise<KeyRotationResult> {
    const startTime = Date.now();

    try {
      this.log(`Starting API key rotation for key: ${keyId}`);

      // Get current key
      const currentKey = await this.getAPIKey(keyId);
      if (!currentKey) {
        throw new Error(`API key not found: ${keyId}`);
      }

      // Create backup before rotation
      await this.createBackup(`rotation_${keyId}_${Date.now()}`);

      // Store old key values
      const oldKey = currentKey.key;
      const oldSecret = currentKey.secret;

      // Update key with new values
      currentKey.key = newKey;
      currentKey.secret = newSecret;
      currentKey.rotationCount += 1;
      currentKey.expiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // Reset expiry
      currentKey.status = 'active';

      // Encrypt and update in vault
      const encryptedKey = await this.encryptAPIKey(currentKey);
      const index = this.vault.keys.findIndex(k => k.id === keyId);
      this.vault.keys[index] = encryptedKey;

      // Save vault
      await this.saveVault();

      const rotationTime = Date.now() - startTime;

      this.log(`API key rotated successfully for key: ${keyId} (rotation #${currentKey.rotationCount})`);
      
      // Log security event
      await this.logSecurityEvent('API_KEY_ROTATED', {
        keyId,
        service: currentKey.service,
        rotationCount: currentKey.rotationCount,
        rotationTime
      });

      return {
        success: true,
        keyId,
        oldKey,
        newKey,
        rotationTime
      };

    } catch (error) {
      const rotationTime = Date.now() - startTime;
      this.log(`API key rotation failed for key ${keyId}: ${error.message}`);
      
      return {
        success: false,
        keyId,
        error: error.message,
        rotationTime
      };
    }
  }

  /**
   * Auto-rotate expired keys
   */
  async autoRotateExpiredKeys(): Promise<KeyRotationResult[]> {
    try {
      this.log('Starting automatic rotation of expired keys...');

      const results: KeyRotationResult[] = [];
      const now = new Date();

      for (const encryptedKey of this.vault.keys) {
        const apiKey = await this.decryptAPIKey(encryptedKey);
        
        // Check if key is expired or expiring soon (within 7 days)
        const daysUntilExpiry = Math.floor((apiKey.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        
        if (daysUntilExpiry <= 7 && apiKey.status === 'active') {
          this.log(`Key ${apiKey.id} expires in ${daysUntilExpiry} days, attempting auto-rotation...`);
          
          // Generate new key and secret
          const newKey = this.generateAPIKey();
          const newSecret = apiKey.secret ? this.generateAPISecret() : undefined;
          
          // Attempt rotation
          const result = await this.rotateAPIKey(apiKey.id, newKey, newSecret);
          results.push(result);
          
          if (result.success) {
            // Notify about successful rotation
            await this.sendRotationNotification(apiKey.service, apiKey.name, 'success');
          } else {
            // Notify about failed rotation
            await this.sendRotationNotification(apiKey.service, apiKey.name, 'failed', result.error);
          }
        }
      }

      this.log(`Auto-rotation completed. Processed ${results.length} keys.`);
      return results;

    } catch (error) {
      this.log(`Auto-rotation failed: ${error.message}`);
      throw new Error(`Auto-rotation failed: ${error.message}`);
    }
  }

  /**
   * Revoke API key
   */
  async revokeAPIKey(keyId: string, reason?: string): Promise<void> {
    try {
      this.log(`Revoking API key: ${keyId}`);

      const encryptedKey = this.vault.keys.find(k => k.id === keyId);
      if (!encryptedKey) {
        throw new Error(`API key not found: ${keyId}`);
      }

      // Decrypt, update status, and re-encrypt
      const apiKey = await this.decryptAPIKey(encryptedKey);
      apiKey.status = 'revoked';

      const updatedEncryptedKey = await this.encryptAPIKey(apiKey);
      const index = this.vault.keys.findIndex(k => k.id === keyId);
      this.vault.keys[index] = updatedEncryptedKey;

      // Save vault
      await this.saveVault();

      // Create backup
      await this.createBackup(`key_revoked_${keyId}`);

      this.log(`API key revoked successfully: ${keyId}`);
      
      // Log security event
      await this.logSecurityEvent('API_KEY_REVOKED', {
        keyId,
        service: apiKey.service,
        reason
      });

    } catch (error) {
      this.log(`Failed to revoke API key ${keyId}: ${error.message}`);
      throw new Error(`Key revocation failed: ${error.message}`);
    }
  }

  /**
   * Get key rotation status
   */
  async getRotationStatus(): Promise<{
    totalKeys: number;
    activeKeys: number;
    expiredKeys: number;
    expiringKeys: number;
    nextRotation: Date;
    lastRotation: Date;
  }> {
    try {
      const now = new Date();
      let activeKeys = 0;
      let expiredKeys = 0;
      let expiringKeys = 0;

      for (const encryptedKey of this.vault.keys) {
        const apiKey = await this.decryptAPIKey(encryptedKey);
        
        if (apiKey.status === 'active') {
          activeKeys++;
          
          const daysUntilExpiry = Math.floor((apiKey.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          
          if (daysUntilExpiry <= 0) {
            expiredKeys++;
          } else if (daysUntilExpiry <= 7) {
            expiringKeys++;
          }
        }
      }

      return {
        totalKeys: this.vault.keys.length,
        activeKeys,
        expiredKeys,
        expiringKeys,
        nextRotation: new Date(this.vault.rotationSchedule.nextRotation),
        lastRotation: new Date(this.vault.lastRotation)
      };

    } catch (error) {
      throw new Error(`Failed to get rotation status: ${error.message}`);
    }
  }

  /**
   * Encrypt API key using AES-256-GCM
   */
  private async encryptAPIKey(apiKey: APIKey): Promise<EncryptedAPIKey> {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', this.masterKey);
    cipher.setAAD(Buffer.from(apiKey.id));

    const keyData = JSON.stringify({
      key: apiKey.key,
      secret: apiKey.secret
    });

    let encrypted = cipher.update(keyData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      id: apiKey.id,
      name: apiKey.name,
      encryptedKey: encrypted,
      service: apiKey.service,
      environment: apiKey.environment,
      createdAt: apiKey.createdAt.toISOString(),
      expiresAt: apiKey.expiresAt.toISOString(),
      lastUsed: apiKey.lastUsed?.toISOString(),
      rotationCount: apiKey.rotationCount,
      status: apiKey.status,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypt API key using AES-256-GCM
   */
  private async decryptAPIKey(encryptedKey: EncryptedAPIKey): Promise<APIKey> {
    const iv = Buffer.from(encryptedKey.iv, 'hex');
    const authTag = Buffer.from(encryptedKey.authTag, 'hex');
    
    const decipher = crypto.createDecipher('aes-256-gcm', this.masterKey);
    decipher.setAAD(Buffer.from(encryptedKey.id));
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedKey.encryptedKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    const keyData = JSON.parse(decrypted);

    return {
      id: encryptedKey.id,
      name: encryptedKey.name,
      key: keyData.key,
      secret: keyData.secret,
      service: encryptedKey.service,
      environment: encryptedKey.environment as any,
      createdAt: new Date(encryptedKey.createdAt),
      expiresAt: new Date(encryptedKey.expiresAt),
      lastUsed: encryptedKey.lastUsed ? new Date(encryptedKey.lastUsed) : undefined,
      rotationCount: encryptedKey.rotationCount,
      status: encryptedKey.status as any
    };
  }

  /**
   * Derive master key from password using PBKDF2
   */
  private async deriveMasterKey(password: string): Promise<Buffer> {
    const salt = Buffer.from('titan-api-key-salt-2024', 'utf8');
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  }

  /**
   * Generate secure API key
   */
  private generateAPIKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate secure API secret
   */
  private generateAPISecret(): string {
    return crypto.randomBytes(64).toString('base64');
  }

  /**
   * Create necessary directories
   */
  private async createDirectories(): Promise<void> {
    const vaultDir = path.dirname(this.vaultPath);
    const logDir = path.dirname(this.logFile);

    await fs.mkdir(vaultDir, { recursive: true });
    await fs.mkdir(logDir, { recursive: true });
    await fs.mkdir(this.backupDir, { recursive: true });

    // Set secure permissions
    await fs.chmod(vaultDir, 0o700);
    await fs.chmod(this.backupDir, 0o700);
  }

  /**
   * Load vault from file
   */
  private async loadVault(): Promise<void> {
    try {
      const vaultData = await fs.readFile(this.vaultPath, 'utf8');
      this.vault = JSON.parse(vaultData);
    } catch (error) {
      // Create new vault if file doesn't exist
      this.vault = this.getDefaultVault();
      await this.saveVault();
    }
  }

  /**
   * Save vault to file
   */
  private async saveVault(): Promise<void> {
    const vaultData = JSON.stringify(this.vault, null, 2);
    await fs.writeFile(this.vaultPath, vaultData, { mode: 0o600 });
  }

  /**
   * Get default vault structure
   */
  private getDefaultVault(): KeyVault {
    return {
      keys: [],
      masterKeyHash: '',
      lastRotation: new Date().toISOString(),
      rotationSchedule: {
        enabled: true,
        intervalDays: 30,
        nextRotation: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString(),
        autoRotate: true,
        notificationDays: [7, 3, 1]
      },
      version: '1.0.0'
    };
  }

  /**
   * Setup rotation schedule
   */
  private async setupRotationSchedule(): Promise<void> {
    // Create cron job for automatic rotation
    const cronScript = this.generateRotationCronScript();
    const scriptPath = '/etc/cron.daily/titan-api-key-rotation';
    
    await fs.writeFile(scriptPath, cronScript, { mode: 0o755 });

    this.log('API key rotation schedule configured');
  }

  /**
   * Generate rotation cron script
   */
  private generateRotationCronScript(): string {
    return `#!/bin/bash
# Titan API Key Rotation Script
# Generated automatically

LOG_FILE="/var/log/titan/api-key-rotation.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] Starting API key rotation check..." >> "$LOG_FILE"

# Run the rotation check (this would call the Node.js script)
# Note: In production, this would call a dedicated rotation service
node -e "
const { APIKeyManager } = require('/opt/titan/services/security/dist/APIKeyManager.js');
const manager = new APIKeyManager();
manager.initialize(process.env.TITAN_MASTER_PASSWORD)
  .then(() => manager.autoRotateExpiredKeys())
  .then(results => {
    console.log('Rotation completed:', results.length, 'keys processed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Rotation failed:', error.message);
    process.exit(1);
  });
" >> "$LOG_FILE" 2>&1

echo "[$DATE] API key rotation check completed" >> "$LOG_FILE"
`;
  }

  /**
   * Create backup of vault
   */
  private async createBackup(suffix: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `vault-${timestamp}-${suffix}.json`);
    
    const vaultData = JSON.stringify(this.vault, null, 2);
    await fs.writeFile(backupPath, vaultData, { mode: 0o600 });
    
    // Keep only last 30 backups
    await this.cleanupOldBackups();
  }

  /**
   * Cleanup old backups
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(f => f.startsWith('vault-') && f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          mtime: fs.stat(path.join(this.backupDir, f)).then(s => s.mtime)
        }));

      // Sort by modification time (newest first)
      const sortedFiles = await Promise.all(
        backupFiles.map(async f => ({
          ...f,
          mtime: await f.mtime
        }))
      );
      
      sortedFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Remove files beyond the 30 most recent
      for (let i = 30; i < sortedFiles.length; i++) {
        await fs.unlink(sortedFiles[i].path);
      }

    } catch (error) {
      this.log(`Failed to cleanup old backups: ${error.message}`);
    }
  }

  /**
   * Send rotation notification
   */
  private async sendRotationNotification(
    service: string,
    keyName: string,
    status: 'success' | 'failed',
    error?: string
  ): Promise<void> {
    // This would integrate with the alerting system
    // For now, just log the event
    await this.logSecurityEvent('KEY_ROTATION_NOTIFICATION', {
      service,
      keyName,
      status,
      error
    });
  }

  /**
   * Log security event
   */
  private async logSecurityEvent(eventType: string, details: any): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type: 'SECURITY_EVENT',
      eventType,
      component: 'APIKeyManager',
      details
    };

    const securityLogPath = '/var/log/titan/security.log';
    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      await fs.appendFile(securityLogPath, logLine);
    } catch (error) {
      // Fallback to console if log file is not accessible
      console.error('Security Event:', logEntry);
    }
  }

  /**
   * Log message to API key manager log file
   */
  private async log(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    try {
      await fs.appendFile(this.logFile, logEntry);
    } catch (error) {
      // Fallback to console if log file is not accessible
      console.log(`API Key Manager: ${message}`);
    }
  }
}