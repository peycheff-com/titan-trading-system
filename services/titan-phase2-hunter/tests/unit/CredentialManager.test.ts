/**
 * Unit tests for CredentialManager
 *
 * Tests AES-256-GCM encryption/decryption, master password handling,
 * credential validation, and file operations.
 */

// Unmock crypto to avoid global mock in setup.ts breaking standard encryption
jest.unmock("crypto");

import { existsSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir, tmpdir } from "os";

// Mock os module to safely redirect homedir
jest.mock("os", () => {
  const originalOs = jest.requireActual("os");
  return {
    ...originalOs,
    homedir: jest.fn(),
  };
});

import {
  CredentialManager,
  ExchangeCredentials,
} from "../../src/config/CredentialManager";

describe("CredentialManager", () => {
  let credentialManager: CredentialManager;
  let testDir: string;
  let originalEnv: string | undefined;

  const validCredentials: ExchangeCredentials = {
    binance: {
      apiKey: "binance_test_api_key_32_characters_long",
      apiSecret:
        "binance_test_api_secret_64_characters_long_for_testing_purposes",
    },
    bybit: {
      apiKey: "bybit_test_api_key_24_chars",
      apiSecret: "bybit_test_api_secret_48_characters_long_test",
    },
  };

  const testPassword = "test_master_password_123";

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(tmpdir(), `titan-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // configure mock
    (homedir as jest.Mock).mockReturnValue(testDir);

    // Save original environment variable
    originalEnv = process.env.TITAN_MASTER_PASSWORD;

    credentialManager = new CredentialManager();
  });

  afterEach(() => {
    // Restore environment variable
    if (originalEnv !== undefined) {
      process.env.TITAN_MASTER_PASSWORD = originalEnv;
    } else {
      delete process.env.TITAN_MASTER_PASSWORD;
    }

    // Clean up test files
    try {
      const credentialsPath = join(testDir, ".titan-scanner", "secrets.enc");
      if (existsSync(credentialsPath)) {
        unlinkSync(credentialsPath);
      }
    } catch (error) {
      // Ignore cleanup errors
    }

    // Restore mocks
    jest.restoreAllMocks();
  });

  describe("Master Password Management", () => {
    test("should set master password directly", () => {
      expect(() => credentialManager.setMasterPassword(testPassword)).not
        .toThrow();
    });

    test("should get master password from environment variable", () => {
      process.env.TITAN_MASTER_PASSWORD = testPassword;
      expect(() => credentialManager.setMasterPassword()).not.toThrow();
    });

    test("should throw error when no master password provided", () => {
      delete process.env.TITAN_MASTER_PASSWORD;
      expect(() => credentialManager.setMasterPassword()).toThrow(
        "Master password not provided",
      );
    });

    test("should throw error when trying to save without master password", () => {
      expect(() => credentialManager.saveCredentials(validCredentials)).toThrow(
        "Master password not set",
      );
    });

    test("should throw error when trying to load without master password", () => {
      expect(() => credentialManager.loadCredentials()).toThrow(
        "Master password not set",
      );
    });
  });

  describe("Credential Validation", () => {
    beforeEach(() => {
      credentialManager.setMasterPassword(testPassword);
    });

    test("should validate valid credentials", () => {
      expect(() => credentialManager.saveCredentials(validCredentials)).not
        .toThrow();
    });

    test("should reject credentials with empty Binance API key", () => {
      const invalidCredentials = {
        ...validCredentials,
        binance: { ...validCredentials.binance, apiKey: "" },
      };

      expect(() => credentialManager.saveCredentials(invalidCredentials))
        .toThrow(
          "Binance API key is empty",
        );
    });

    test("should reject credentials with empty Binance API secret", () => {
      const invalidCredentials = {
        ...validCredentials,
        binance: { ...validCredentials.binance, apiSecret: "" },
      };

      expect(() => credentialManager.saveCredentials(invalidCredentials))
        .toThrow(
          "Binance API secret is empty",
        );
    });

    test("should reject credentials with empty Bybit API key", () => {
      const invalidCredentials = {
        ...validCredentials,
        bybit: { ...validCredentials.bybit, apiKey: "" },
      };

      expect(() => credentialManager.saveCredentials(invalidCredentials))
        .toThrow(
          "Bybit API key is empty",
        );
    });

    test("should reject credentials with empty Bybit API secret", () => {
      const invalidCredentials = {
        ...validCredentials,
        bybit: { ...validCredentials.bybit, apiSecret: "" },
      };

      expect(() => credentialManager.saveCredentials(invalidCredentials))
        .toThrow(
          "Bybit API secret is empty",
        );
    });

    test("should reject credentials missing Binance section", () => {
      const invalidCredentials = {
        bybit: validCredentials.bybit,
      } as any;

      expect(() => credentialManager.saveCredentials(invalidCredentials))
        .toThrow(
          "Missing Binance credentials",
        );
    });

    test("should reject credentials missing Bybit section", () => {
      const invalidCredentials = {
        binance: validCredentials.binance,
      } as any;

      expect(() => credentialManager.saveCredentials(invalidCredentials))
        .toThrow(
          "Missing Bybit credentials",
        );
    });
  });

  describe("Encryption and Decryption", () => {
    beforeEach(() => {
      credentialManager.setMasterPassword(testPassword);
    });

    test("should save and load credentials successfully", () => {
      // Save credentials
      credentialManager.saveCredentials(validCredentials);

      // Load credentials
      const loadedCredentials = credentialManager.loadCredentials();

      // Verify credentials match
      expect(loadedCredentials).toEqual(validCredentials);
    });

    test("should create encrypted file with restricted permissions", () => {
      credentialManager.saveCredentials(validCredentials);

      const credentialsPath = join(testDir, ".titan-scanner", "secrets.enc");
      expect(existsSync(credentialsPath)).toBe(true);

      // Check file permissions (on Unix systems)
      if (process.platform !== "win32") {
        const stats = require("fs").statSync(credentialsPath);
        const permissions = (stats.mode & parseInt("777", 8)).toString(8);
        expect(permissions).toBe("600"); // Read/write for owner only
      }
    });

    test("should fail to load with wrong master password", () => {
      // Save with correct password
      credentialManager.saveCredentials(validCredentials);

      // Try to load with wrong password
      credentialManager.setMasterPassword("wrong_password");
      expect(() => credentialManager.loadCredentials()).toThrow(
        "Failed to decrypt credentials",
      );
    });

    test("should throw error when loading non-existent credentials", () => {
      expect(() => credentialManager.loadCredentials()).toThrow(
        "No credentials file found",
      );
    });

    test("should handle corrupted credentials file", () => {
      // Save valid credentials first
      credentialManager.saveCredentials(validCredentials);

      // Corrupt the file
      const credentialsPath = join(testDir, ".titan-scanner", "secrets.enc");
      require("fs").writeFileSync(credentialsPath, "corrupted data");

      // Try to load corrupted file
      expect(() => credentialManager.loadCredentials()).toThrow(
        "Failed to decrypt credentials",
      );
    });
  });

  describe("File Operations", () => {
    beforeEach(() => {
      credentialManager.setMasterPassword(testPassword);
    });

    test("should check if credentials exist", () => {
      expect(credentialManager.hasCredentials()).toBe(false);

      credentialManager.saveCredentials(validCredentials);
      expect(credentialManager.hasCredentials()).toBe(true);
    });

    test("should delete credentials securely", () => {
      credentialManager.saveCredentials(validCredentials);
      expect(credentialManager.hasCredentials()).toBe(true);

      credentialManager.deleteCredentials();
      expect(credentialManager.hasCredentials()).toBe(false);
    });

    test("should get credentials file info", () => {
      // Before saving
      let info = credentialManager.getCredentialsInfo();
      expect(info.exists).toBe(false);
      expect(info.path).toContain(".titan-scanner/secrets.enc");

      // After saving
      credentialManager.saveCredentials(validCredentials);
      info = credentialManager.getCredentialsInfo();
      expect(info.exists).toBe(true);
      expect(info.size).toBeGreaterThan(0);
      expect(typeof info.modified).toBe("object");
      expect(info.modified).toBeTruthy();
    });

    test("should test credentials validity", () => {
      expect(credentialManager.testCredentials()).toBe(false);

      credentialManager.saveCredentials(validCredentials);
      expect(credentialManager.testCredentials()).toBe(true);

      // Test with wrong password
      credentialManager.setMasterPassword("wrong_password");
      expect(credentialManager.testCredentials()).toBe(false);
    });
  });

  describe("Exchange-Specific Operations", () => {
    beforeEach(() => {
      credentialManager.setMasterPassword(testPassword);
    });

    test("should update Binance credentials", () => {
      const newApiKey = "new_binance_api_key_32_characters_long";
      const newApiSecret =
        "new_binance_api_secret_64_characters_long_for_testing_purposes";

      credentialManager.updateExchangeCredentials(
        "binance",
        newApiKey,
        newApiSecret,
      );

      const credentials = credentialManager.loadCredentials();
      expect(credentials.binance.apiKey).toBe(newApiKey);
      expect(credentials.binance.apiSecret).toBe(newApiSecret);
    });

    test("should update Bybit credentials", () => {
      const newApiKey = "new_bybit_api_key_24_chars";
      const newApiSecret = "new_bybit_api_secret_48_characters_long_test";

      credentialManager.updateExchangeCredentials(
        "bybit",
        newApiKey,
        newApiSecret,
      );

      const credentials = credentialManager.loadCredentials();
      expect(credentials.bybit.apiKey).toBe(newApiKey);
      expect(credentials.bybit.apiSecret).toBe(newApiSecret);
    });

    test("should get specific exchange credentials", () => {
      credentialManager.saveCredentials(validCredentials);

      const binanceCredentials = credentialManager.getExchangeCredentials(
        "binance",
      );
      expect(binanceCredentials).toEqual(validCredentials.binance);

      const bybitCredentials = credentialManager.getExchangeCredentials(
        "bybit",
      );
      expect(bybitCredentials).toEqual(validCredentials.bybit);
    });

    test("should create new credentials when updating non-existent file", () => {
      const apiKey = "test_api_key_32_characters_long";
      const apiSecret =
        "test_api_secret_64_characters_long_for_testing_purposes";

      credentialManager.updateExchangeCredentials("binance", apiKey, apiSecret);

      const credentials = credentialManager.loadCredentials();
      expect(credentials.binance.apiKey).toBe(apiKey);
      expect(credentials.binance.apiSecret).toBe(apiSecret);
      expect(credentials.bybit.apiKey).toBe("placeholder_bybit_api_key_24");
      expect(credentials.bybit.apiSecret).toBe(
        "placeholder_bybit_api_secret_48_characters_long",
      );
    });
  });

  describe("Master Password Change", () => {
    beforeEach(() => {
      credentialManager.setMasterPassword(testPassword);
    });

    test("should change master password successfully", () => {
      credentialManager.saveCredentials(validCredentials);

      const newPassword = "new_master_password_456";
      credentialManager.changeMasterPassword(newPassword);

      // Verify credentials can be loaded with new password
      const loadedCredentials = credentialManager.loadCredentials();
      expect(loadedCredentials).toEqual(validCredentials);

      // Verify old password no longer works
      credentialManager.setMasterPassword(testPassword);
      expect(() => credentialManager.loadCredentials()).toThrow();
    });

    test("should throw error when changing password without current password set", () => {
      const newCredentialManager = new CredentialManager();
      expect(() => newCredentialManager.changeMasterPassword("new_password"))
        .toThrow(
          "Current master password not set",
        );
    });

    test("should restore old password on failure", () => {
      credentialManager.saveCredentials(validCredentials);

      // Mock writeFileSync to fail
      const originalWriteFileSync = require("fs").writeFileSync;
      jest.spyOn(require("fs"), "writeFileSync").mockImplementation(() => {
        throw new Error("Write failed");
      });

      const newPassword = "new_master_password_456";
      expect(() => credentialManager.changeMasterPassword(newPassword)).toThrow(
        "Write failed",
      );

      // Restore original function
      require("fs").writeFileSync = originalWriteFileSync;

      // Verify old password still works
      const loadedCredentials = credentialManager.loadCredentials();
      expect(loadedCredentials).toEqual(validCredentials);
    });
  });

  describe("Edge Cases", () => {
    beforeEach(() => {
      credentialManager.setMasterPassword(testPassword);
    });

    test("should handle credentials with whitespace", () => {
      const credentialsWithWhitespace = {
        binance: {
          apiKey: "  binance_test_api_key_32_characters_long  ",
          apiSecret:
            "  binance_test_api_secret_64_characters_long_for_testing_purposes  ",
        },
        bybit: {
          apiKey: "  bybit_test_api_key_24_chars  ",
          apiSecret: "  bybit_test_api_secret_48_characters_long_test  ",
        },
      };

      expect(() => credentialManager.saveCredentials(credentialsWithWhitespace))
        .not.toThrow();
    });

    test("should handle very long credentials", () => {
      const longCredentials = {
        binance: {
          apiKey: "a".repeat(100),
          apiSecret: "b".repeat(200),
        },
        bybit: {
          apiKey: "c".repeat(100),
          apiSecret: "d".repeat(200),
        },
      };

      expect(() => credentialManager.saveCredentials(longCredentials)).not
        .toThrow();

      const loadedCredentials = credentialManager.loadCredentials();
      expect(loadedCredentials).toEqual(longCredentials);
    });

    test("should handle special characters in credentials", () => {
      const specialCredentials = {
        binance: {
          apiKey: "binance_key_with_special_chars_!@#$%^&*()",
          apiSecret: "binance_secret_with_unicode_chars_αβγδε_and_emojis_🚀🌙",
        },
        bybit: {
          apiKey: "bybit_key_with_numbers_123456789",
          apiSecret: "bybit_secret_with_mixed_Case_AND_symbols_+=[]{}|;:,.<>?",
        },
      };

      expect(() => credentialManager.saveCredentials(specialCredentials)).not
        .toThrow();

      const loadedCredentials = credentialManager.loadCredentials();
      expect(loadedCredentials).toEqual(specialCredentials);
    });
  });
});
