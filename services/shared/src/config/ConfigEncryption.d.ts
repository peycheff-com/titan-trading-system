/**
 * Configuration Encryption Module for Titan Production Deployment
 *
 * Provides AES-256-GCM encryption for sensitive configuration data
 * with secure key derivation and integrity verification.
 *
 * Requirements: 3.2 - Configuration encryption for sensitive data
 */
/**
 * Encrypted data structure
 */
export interface EncryptedData {
    encrypted: string;
    iv: string;
    tag: string;
    salt: string;
    algorithm: string;
    iterations: number;
}
/**
 * Encryption result
 */
export interface EncryptionResult {
    success: boolean;
    data?: EncryptedData;
    error?: string;
}
/**
 * Decryption result
 */
export interface DecryptionResult {
    success: boolean;
    data?: any;
    error?: string;
}
/**
 * Configuration encryption utilities
 */
export declare class ConfigEncryption {
    private masterKey;
    /**
     * Initialize encryption with master password
     */
    initialize(masterPassword: string): void;
    /**
     * Encrypt sensitive configuration data
     */
    encrypt(data: any): EncryptionResult;
    /**
     * Decrypt sensitive configuration data
     */
    decrypt(encryptedData: EncryptedData): DecryptionResult;
    /**
     * Encrypt specific fields in configuration object
     */
    encryptFields(config: any, fieldsToEncrypt: string[]): any;
    /**
     * Decrypt specific fields in configuration object
     */
    decryptFields(config: any): any;
    /**
     * Check if configuration contains encrypted fields
     */
    hasEncryptedFields(config: any): boolean;
    /**
     * Get list of encrypted field paths in configuration
     */
    getEncryptedFieldPaths(config: any): string[];
    /**
     * Validate master password strength
     */
    static validateMasterPassword(password: string): {
        valid: boolean;
        errors: string[];
        strength: 'weak' | 'medium' | 'strong';
    };
    /**
     * Get nested value from object using dot notation
     */
    private getNestedValue;
    /**
     * Set nested value in object using dot notation
     */
    private setNestedValue;
    /**
     * Walk object recursively and call callback for each property
     */
    private walkObject;
    /**
     * Walk object recursively with path tracking
     */
    private walkObjectWithPath;
    /**
     * Clear master key from memory
     */
    destroy(): void;
}
/**
 * Get or create global config encryption instance
 */
export declare function getConfigEncryption(): ConfigEncryption;
/**
 * Reset global config encryption instance
 */
export declare function resetConfigEncryption(): void;
//# sourceMappingURL=ConfigEncryption.d.ts.map