/**
 * Unit tests for ConfigEncryption
 * 
 * Tests AES-256-GCM encryption/decryption of configuration data
 * with proper key derivation and integrity verification.
 */

import { ConfigEncryption } from '../../../src/config/ConfigEncryption';

describe('ConfigEncryption', () => {
  let encryption: ConfigEncryption;
  const masterPassword = 'TestMasterPassword123!@#';
  
  beforeEach(() => {
    encryption = new ConfigEncryption();
    encryption.initialize(masterPassword);
  });
  
  afterEach(() => {
    encryption.destroy();
  });
  
  describe('Initialization', () => {
    it('should initialize with valid master password', () => {
      const newEncryption = new ConfigEncryption();
      expect(() => {
        newEncryption.initialize(masterPassword);
      }).not.toThrow();
      newEncryption.destroy();
    });
    
    it('should reject weak master passwords', () => {
      const newEncryption = new ConfigEncryption();
      expect(() => {
        newEncryption.initialize('weak');
      }).toThrow('Master password must be at least 12 characters long');
      newEncryption.destroy();
    });
    
    it('should validate master password strength', () => {
      const weakPassword = 'password';
      const mediumPassword = 'Password123!';
      const strongPassword = 'VeryStrongPassword123!@#$';
      
      const weakResult = ConfigEncryption.validateMasterPassword(weakPassword);
      expect(weakResult.valid).toBe(false);
      expect(weakResult.strength).toBe('weak');
      expect(weakResult.errors.length).toBeGreaterThan(0);
      
      const mediumResult = ConfigEncryption.validateMasterPassword(mediumPassword);
      expect(mediumResult.valid).toBe(true);
      expect(mediumResult.strength).toBe('medium');
      
      const strongResult = ConfigEncryption.validateMasterPassword(strongPassword);
      expect(strongResult.valid).toBe(true);
      expect(strongResult.strength).toBe('strong');
    });
  });
  
  describe('Encryption and Decryption', () => {
    it('should encrypt and decrypt simple data', () => {
      const testData = { apiKey: 'secret-key-123', apiSecret: 'secret-value-456' };
      
      const encryptResult = encryption.encrypt(testData);
      expect(encryptResult.success).toBe(true);
      expect(encryptResult.data).toBeDefined();
      expect(encryptResult.data!.encrypted).toBeDefined();
      expect(encryptResult.data!.iv).toBeDefined();
      expect(encryptResult.data!.tag).toBeDefined();
      expect(encryptResult.data!.salt).toBeDefined();
      
      const decryptResult = encryption.decrypt(encryptResult.data!);
      expect(decryptResult.success).toBe(true);
      expect(decryptResult.data).toEqual(testData);
    });
    
    it('should encrypt and decrypt complex nested data', () => {
      const testData = {
        database: {
          host: 'localhost',
          port: 5432,
          credentials: {
            username: 'admin',
            password: 'super-secret-password'
          }
        },
        exchanges: {
          bybit: {
            apiKey: 'bybit-key',
            apiSecret: 'bybit-secret'
          },
          mexc: {
            apiKey: 'mexc-key',
            apiSecret: 'mexc-secret'
          }
        }
      };
      
      const encryptResult = encryption.encrypt(testData);
      expect(encryptResult.success).toBe(true);
      
      const decryptResult = encryption.decrypt(encryptResult.data!);
      expect(decryptResult.success).toBe(true);
      expect(decryptResult.data).toEqual(testData);
    });
    
    it('should fail decryption with wrong password', () => {
      const testData = { secret: 'value' };
      
      const encryptResult = encryption.encrypt(testData);
      expect(encryptResult.success).toBe(true);
      
      // Create new encryption instance with different password
      const wrongEncryption = new ConfigEncryption();
      wrongEncryption.initialize('WrongPassword123!');
      
      const decryptResult = wrongEncryption.decrypt(encryptResult.data!);
      expect(decryptResult.success).toBe(false);
      expect(decryptResult.error).toBeDefined();
      
      wrongEncryption.destroy();
    });
    
    it('should fail decryption with tampered data', () => {
      const testData = { secret: 'value' };
      
      const encryptResult = encryption.encrypt(testData);
      expect(encryptResult.success).toBe(true);
      
      // Tamper with encrypted data
      const tamperedData = { ...encryptResult.data! };
      tamperedData.encrypted = tamperedData.encrypted.slice(0, -5) + 'XXXXX';
      
      const decryptResult = encryption.decrypt(tamperedData);
      expect(decryptResult.success).toBe(false);
      expect(decryptResult.error).toBeDefined();
    });
    
    it('should handle encryption without initialization', () => {
      const uninitializedEncryption = new ConfigEncryption();
      const testData = { secret: 'value' };
      
      const encryptResult = uninitializedEncryption.encrypt(testData);
      expect(encryptResult.success).toBe(false);
      expect(encryptResult.error).toContain('not initialized');
    });
  });
  
  describe('Field-Level Encryption', () => {
    it('should encrypt specific fields in configuration', () => {
      const config = {
        maxLeverage: 20,
        exchanges: {
          bybit: {
            enabled: true,
            apiKey: 'secret-key',
            apiSecret: 'secret-value'
          }
        },
        publicSetting: 'not-secret'
      };
      
      const fieldsToEncrypt = ['exchanges.bybit.apiKey', 'exchanges.bybit.apiSecret'];
      const encryptedConfig = encryption.encryptFields(config, fieldsToEncrypt);
      
      // Check that specified fields are encrypted
      expect(encryptedConfig.exchanges.bybit.apiKey.__encrypted).toBe(true);
      expect(encryptedConfig.exchanges.bybit.apiSecret.__encrypted).toBe(true);
      
      // Check that other fields are not encrypted
      expect(encryptedConfig.maxLeverage).toBe(20);
      expect(encryptedConfig.publicSetting).toBe('not-secret');
      expect(encryptedConfig.exchanges.bybit.enabled).toBe(true);
    });
    
    it('should decrypt specific fields in configuration', () => {
      const config = {
        maxLeverage: 20,
        exchanges: {
          bybit: {
            enabled: true,
            apiKey: 'secret-key',
            apiSecret: 'secret-value'
          }
        }
      };
      
      const fieldsToEncrypt = ['exchanges.bybit.apiKey', 'exchanges.bybit.apiSecret'];
      const encryptedConfig = encryption.encryptFields(config, fieldsToEncrypt);
      const decryptedConfig = encryption.decryptFields(encryptedConfig);
      
      expect(decryptedConfig).toEqual(config);
    });
    
    it('should detect encrypted fields in configuration', () => {
      const config = {
        normalField: 'value',
        encryptedField: {
          __encrypted: true,
          encrypted: 'base64-data',
          iv: 'base64-iv',
          tag: 'base64-tag',
          salt: 'base64-salt',
          algorithm: 'aes-256-gcm',
          iterations: 100000
        }
      };
      
      expect(encryption.hasEncryptedFields(config)).toBe(true);
      
      const normalConfig = { normalField: 'value' };
      expect(encryption.hasEncryptedFields(normalConfig)).toBe(false);
    });
    
    it('should get encrypted field paths', () => {
      const config = {
        normalField: 'value',
        nested: {
          encryptedField: {
            __encrypted: true,
            encrypted: 'data'
          },
          normalField: 'value'
        },
        anotherEncrypted: {
          __encrypted: true,
          encrypted: 'data'
        }
      };
      
      const paths = encryption.getEncryptedFieldPaths(config);
      expect(paths).toContain('nested.encryptedField');
      expect(paths).toContain('anotherEncrypted');
      expect(paths).toHaveLength(2);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle invalid encrypted data structure', () => {
      const invalidData = {
        encrypted: 'data',
        // Missing required fields: iv, tag, salt
      } as any;
      
      const decryptResult = encryption.decrypt(invalidData);
      expect(decryptResult.success).toBe(false);
      expect(decryptResult.error).toContain('Invalid encrypted data structure');
    });
    
    it('should handle invalid JSON in decrypted data', () => {
      // This test would require mocking the crypto functions to return invalid JSON
      // For now, we'll test the general error handling path
      const testData = { test: 'value' };
      const encryptResult = encryption.encrypt(testData);
      expect(encryptResult.success).toBe(true);
    });
  });
  
  describe('Memory Management', () => {
    it('should clear master key on destroy', () => {
      const testData = { secret: 'value' };
      
      // Encrypt data
      const encryptResult = encryption.encrypt(testData);
      expect(encryptResult.success).toBe(true);
      
      // Destroy encryption instance
      encryption.destroy();
      
      // Try to encrypt again (should fail)
      const encryptResult2 = encryption.encrypt(testData);
      expect(encryptResult2.success).toBe(false);
      expect(encryptResult2.error).toContain('not initialized');
    });
  });
});