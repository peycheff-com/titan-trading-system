/**
 * Configuration Encryption Module for Titan Production Deployment
 *
 * Provides AES-256-GCM encryption for sensitive configuration data
 * with secure key derivation and integrity verification.
 *
 * Requirements: 3.2 - Configuration encryption for sensitive data
 */
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes, } from 'crypto';
/**
 * Encryption algorithm configuration
 */
const ENCRYPTION_CONFIG = {
    algorithm: 'aes-256-gcm',
    keyLength: 32, // 256 bits
    ivLength: 16, // 128 bits
    tagLength: 16, // 128 bits
    saltLength: 32, // 256 bits
    iterations: 100000, // PBKDF2 iterations
    hashAlgorithm: 'sha256',
};
/**
 * Configuration encryption utilities
 */
export class ConfigEncryption {
    masterKey = null;
    /**
     * Initialize encryption with master password
     */
    initialize(masterPassword) {
        if (!masterPassword || masterPassword.length < 12) {
            throw new Error('Master password must be at least 12 characters long');
        }
        // Derive master key from password
        const salt = createHash(ENCRYPTION_CONFIG.hashAlgorithm)
            .update('titan-config-encryption')
            .digest();
        // eslint-disable-next-line functional/immutable-data
        this.masterKey = pbkdf2Sync(masterPassword, salt, ENCRYPTION_CONFIG.iterations, ENCRYPTION_CONFIG.keyLength, ENCRYPTION_CONFIG.hashAlgorithm);
    }
    /**
     * Encrypt sensitive configuration data
     */
    encrypt(data) {
        try {
            if (!this.masterKey) {
                throw new Error('Encryption not initialized. Call initialize() first.');
            }
            // Convert data to JSON string
            const plaintext = JSON.stringify(data);
            // Generate random salt and IV
            const salt = randomBytes(ENCRYPTION_CONFIG.saltLength);
            const iv = randomBytes(ENCRYPTION_CONFIG.ivLength);
            // Derive encryption key from master key and salt
            const encryptionKey = pbkdf2Sync(this.masterKey, salt, ENCRYPTION_CONFIG.iterations, ENCRYPTION_CONFIG.keyLength, ENCRYPTION_CONFIG.hashAlgorithm);
            // Create cipher with IV
            const cipher = createCipheriv(ENCRYPTION_CONFIG.algorithm, encryptionKey, iv);
            cipher.setAAD(Buffer.from('titan-config')); // Additional authenticated data
            // Encrypt data
            // eslint-disable-next-line functional/no-let
            let encrypted = cipher.update(plaintext, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            // Get authentication tag (for GCM mode)
            const tag = cipher.getAuthTag();
            return {
                success: true,
                data: {
                    encrypted,
                    iv: iv.toString('base64'),
                    tag: tag.toString('base64'),
                    salt: salt.toString('base64'),
                    algorithm: ENCRYPTION_CONFIG.algorithm,
                    iterations: ENCRYPTION_CONFIG.iterations,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown encryption error',
            };
        }
    }
    /**
     * Decrypt sensitive configuration data
     */
    decrypt(encryptedData) {
        try {
            if (!this.masterKey) {
                throw new Error('Encryption not initialized. Call initialize() first.');
            }
            // Validate encrypted data structure
            if (!encryptedData.encrypted ||
                !encryptedData.iv ||
                !encryptedData.tag ||
                !encryptedData.salt) {
                throw new Error('Invalid encrypted data structure');
            }
            // Convert base64 strings back to buffers
            const iv = Buffer.from(encryptedData.iv, 'base64');
            const tag = Buffer.from(encryptedData.tag, 'base64');
            const salt = Buffer.from(encryptedData.salt, 'base64');
            // Derive decryption key from master key and salt
            const decryptionKey = pbkdf2Sync(this.masterKey, salt, encryptedData.iterations, ENCRYPTION_CONFIG.keyLength, ENCRYPTION_CONFIG.hashAlgorithm);
            // Create decipher with IV
            const decipher = createDecipheriv(encryptedData.algorithm, decryptionKey, iv);
            decipher.setAuthTag(tag);
            decipher.setAAD(Buffer.from('titan-config')); // Additional authenticated data
            // Decrypt data
            // eslint-disable-next-line functional/no-let
            let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            // Parse JSON
            const data = JSON.parse(decrypted);
            return {
                success: true,
                data,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown decryption error',
            };
        }
    }
    /**
     * Encrypt specific fields in configuration object
     */
    encryptFields(config, fieldsToEncrypt) {
        const result = { ...config };
        for (const fieldPath of fieldsToEncrypt) {
            const value = this.getNestedValue(result, fieldPath);
            if (value !== undefined) {
                const encryptionResult = this.encrypt(value);
                if (encryptionResult.success && encryptionResult.data) {
                    this.setNestedValue(result, fieldPath, {
                        __encrypted: true,
                        ...encryptionResult.data,
                    });
                }
            }
        }
        return result;
    }
    /**
     * Decrypt specific fields in configuration object
     */
    decryptFields(config) {
        const result = { ...config };
        this.walkObject(result, (obj, key) => {
            const value = obj[key];
            if (value && typeof value === 'object' && value.__encrypted === true) {
                const decryptionResult = this.decrypt(value);
                if (decryptionResult.success) {
                    // eslint-disable-next-line functional/immutable-data
                    obj[key] = decryptionResult.data;
                }
            }
        });
        return result;
    }
    /**
     * Check if configuration contains encrypted fields
     */
    hasEncryptedFields(config) {
        // eslint-disable-next-line functional/no-let
        let hasEncrypted = false;
        this.walkObject(config, (obj, key) => {
            const value = obj[key];
            if (value && typeof value === 'object' && value.__encrypted === true) {
                hasEncrypted = true;
            }
        });
        return hasEncrypted;
    }
    /**
     * Get list of encrypted field paths in configuration
     */
    getEncryptedFieldPaths(config) {
        const encryptedPaths = [];
        this.walkObjectWithPath(config, (obj, key, path) => {
            const value = obj[key];
            if (value && typeof value === 'object' && value.__encrypted === true) {
                // eslint-disable-next-line functional/immutable-data
                encryptedPaths.push(path);
            }
        });
        return encryptedPaths;
    }
    /**
     * Validate master password strength
     */
    static validateMasterPassword(password) {
        const errors = [];
        // eslint-disable-next-line functional/no-let
        let strength = 'weak';
        if (password.length < 12) {
            // eslint-disable-next-line functional/immutable-data
            errors.push('Password must be at least 12 characters long');
        }
        if (!/[a-z]/.test(password)) {
            // eslint-disable-next-line functional/immutable-data
            errors.push('Password must contain at least one lowercase letter');
        }
        if (!/[A-Z]/.test(password)) {
            // eslint-disable-next-line functional/immutable-data
            errors.push('Password must contain at least one uppercase letter');
        }
        if (!/\d/.test(password)) {
            // eslint-disable-next-line functional/immutable-data
            errors.push('Password must contain at least one number');
        }
        if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
            // eslint-disable-next-line functional/immutable-data
            errors.push('Password must contain at least one special character');
        }
        // Determine strength
        if (errors.length === 0) {
            if (password.length >= 16) {
                strength = 'strong';
            }
            else if (password.length >= 12) {
                strength = 'medium';
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            strength,
        };
    }
    /**
     * Get nested value from object using dot notation
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }
    /**
     * Set nested value in object using dot notation
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        // eslint-disable-next-line functional/no-let
        let current = obj;
        // eslint-disable-next-line functional/no-let
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        current[keys[keys.length - 1]] = value;
    }
    /**
     * Walk object recursively and call callback for each property
     */
    walkObject(obj, callback) {
        if (typeof obj !== 'object' || obj === null) {
            return;
        }
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                callback(obj, key);
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    this.walkObject(obj[key], callback);
                }
            }
        }
    }
    /**
     * Walk object recursively with path tracking
     */
    walkObjectWithPath(obj, callback, currentPath = '') {
        if (typeof obj !== 'object' || obj === null) {
            return;
        }
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const path = currentPath ? `${currentPath}.${key}` : key;
                callback(obj, key, path);
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    this.walkObjectWithPath(obj[key], callback, path);
                }
            }
        }
    }
    /**
     * Clear master key from memory
     */
    destroy() {
        if (this.masterKey) {
            this.masterKey.fill(0);
            // eslint-disable-next-line functional/immutable-data
            this.masterKey = null;
        }
    }
}
/**
 * Singleton instance for global use
 */
// eslint-disable-next-line functional/no-let
let configEncryptionInstance = null;
/**
 * Get or create global config encryption instance
 */
export function getConfigEncryption() {
    if (!configEncryptionInstance) {
        configEncryptionInstance = new ConfigEncryption();
    }
    return configEncryptionInstance;
}
/**
 * Reset global config encryption instance
 */
export function resetConfigEncryption() {
    if (configEncryptionInstance) {
        configEncryptionInstance.destroy();
    }
    configEncryptionInstance = null;
}
//# sourceMappingURL=ConfigEncryption.js.map