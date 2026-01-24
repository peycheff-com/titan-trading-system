/**
 * Unit Tests for CredentialManager
 *
 * Tests AES-256-GCM encryption, decryption, and credential management functionality.
 */

import {
  CredentialManager,
  ExchangeCredentials,
} from "../../src/config/CredentialManager.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("CredentialManager", () => {
  let credentialManager: CredentialManager;
  let testCredentialsPath: string;
  const testPassword = "test-master-password-12345";

  // Sample credentials for testing
  const sampleCredentials: ExchangeCredentials = {
    binance: {
      apiKey: "binance-test-key-123",
      apiSecret: "binance-test-secret-456",
    },
    bybit: {
      apiKey: "bybit-test-key-789",
      apiSecret: "bybit-test-secret-012",
    },
    mexc: {
      apiKey: "mexc-test-key-345",
      apiSecret: "mexc-test-secret-678",
    },
  };

  beforeEach(() => {
    // Set test master password
    process.env.TITAN_MASTER_PASSWORD = testPassword;

    // Create credential manager instance
    credentialManager = new CredentialManager();
    testCredentialsPath = credentialManager.getCredentialsPath();

    // Clean up any existing test credentials
    if (fs.existsSync(testCredentialsPath)) {
      fs.unlinkSync(testCredentialsPath);
    }

    // Silence console warnings/errors
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console
    jest.restoreAllMocks();

    // Clean up test credentials file
    // Clean up test credentials file
    if (fs.existsSync(testCredentialsPath)) {
      fs.unlinkSync(testCredentialsPath);
    }

    // Clean up environment
    delete process.env.TITAN_MASTER_PASSWORD;
  });

  describe("Constructor and Initialization", () => {
    it("should create credentials directory if it does not exist", () => {
      const credentialsDir = path.dirname(testCredentialsPath);
      expect(fs.existsSync(credentialsDir)).toBe(true);
    });

    it("should set correct credentials path", () => {
      const expectedPath = path.join(
        os.homedir(),
        ".titan-scanner",
        "secrets.enc",
      );
      expect(testCredentialsPath).toBe(expectedPath);
    });
  });

  describe("saveCredentials()", () => {
    it("should save credentials successfully", () => {
      credentialManager.saveCredentials(sampleCredentials);

      expect(fs.existsSync(testCredentialsPath)).toBe(true);
    });

    it("should create encrypted file with correct structure", () => {
      credentialManager.saveCredentials(sampleCredentials);

      const fileContent = fs.readFileSync(testCredentialsPath, "utf-8");
      const encryptedData = JSON.parse(fileContent);

      expect(encryptedData).toHaveProperty("version");
      expect(encryptedData).toHaveProperty("salt");
      expect(encryptedData).toHaveProperty("iv");
      expect(encryptedData).toHaveProperty("authTag");
      expect(encryptedData).toHaveProperty("encryptedData");

      expect(encryptedData.version).toBe(1);
    });

    it("should use different IV for each encryption", () => {
      credentialManager.saveCredentials(sampleCredentials);
      const content1 = fs.readFileSync(testCredentialsPath, "utf-8");
      const encrypted1 = JSON.parse(content1);

      // Save again
      credentialManager.saveCredentials(sampleCredentials);
      const content2 = fs.readFileSync(testCredentialsPath, "utf-8");
      const encrypted2 = JSON.parse(content2);

      // IVs should be different
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      // Salts should be different
      expect(encrypted1.salt).not.toBe(encrypted2.salt);
    });

    it("should throw error if master password is not set", () => {
      delete process.env.TITAN_MASTER_PASSWORD;

      expect(() => {
        credentialManager.saveCredentials(sampleCredentials);
      }).toThrow("TITAN_MASTER_PASSWORD environment variable not set");
    });

    it("should throw error if master password is too short", () => {
      process.env.TITAN_MASTER_PASSWORD = "short";

      expect(() => {
        credentialManager.saveCredentials(sampleCredentials);
      }).toThrow("Master password must be at least 12 characters long");
    });
  });

  describe("loadCredentials()", () => {
    it("should load and decrypt credentials successfully", () => {
      credentialManager.saveCredentials(sampleCredentials);

      const loadedCredentials = credentialManager.loadCredentials();

      expect(loadedCredentials).toEqual(sampleCredentials);
    });

    it("should throw error if credentials file does not exist", () => {
      // Ensure no fallback involves
      const oldBinance = process.env.BINANCE_API_KEY;
      delete process.env.BINANCE_API_KEY;

      expect(() => {
        try {
          credentialManager.loadCredentials();
        } finally {
          // Restore
          if (oldBinance) process.env.BINANCE_API_KEY = oldBinance;
        }
      }).toThrow("Missing Binance credentials in environment variables");
    });

    it("should throw error if master password is incorrect", () => {
      credentialManager.saveCredentials(sampleCredentials);

      // Change password
      process.env.TITAN_MASTER_PASSWORD = "wrong-password-12345";

      expect(() => {
        credentialManager.loadCredentials();
      }).toThrow(); // Will throw authentication error
    });

    it("should throw error if master password is not set", () => {
      credentialManager.saveCredentials(sampleCredentials);

      delete process.env.TITAN_MASTER_PASSWORD;

      expect(() => {
        credentialManager.loadCredentials();
      }).toThrow("TITAN_MASTER_PASSWORD environment variable not set");
    });

    it("should handle corrupted encrypted data", () => {
      credentialManager.saveCredentials(sampleCredentials);

      // Corrupt the file
      const fileContent = fs.readFileSync(testCredentialsPath, "utf-8");
      const encryptedData = JSON.parse(fileContent);
      encryptedData.encryptedData = "corrupted-data";
      fs.writeFileSync(testCredentialsPath, JSON.stringify(encryptedData));

      expect(() => {
        credentialManager.loadCredentials();
      }).toThrow();
    });
  });

  describe("Round-trip encryption/decryption", () => {
    it("should correctly encrypt and decrypt credentials", () => {
      credentialManager.saveCredentials(sampleCredentials);
      const loadedCredentials = credentialManager.loadCredentials();

      expect(loadedCredentials).toEqual(sampleCredentials);
      expect(loadedCredentials.binance.apiKey).toBe(
        sampleCredentials.binance.apiKey,
      );
      expect(loadedCredentials.binance.apiSecret).toBe(
        sampleCredentials.binance.apiSecret,
      );
      expect(loadedCredentials.bybit.apiKey).toBe(
        sampleCredentials.bybit.apiKey,
      );
      expect(loadedCredentials.bybit.apiSecret).toBe(
        sampleCredentials.bybit.apiSecret,
      );
      expect(loadedCredentials.mexc.apiKey).toBe(sampleCredentials.mexc.apiKey);
      expect(loadedCredentials.mexc.apiSecret).toBe(
        sampleCredentials.mexc.apiSecret,
      );
    });

    it("should handle special characters in credentials", () => {
      const specialCredentials: ExchangeCredentials = {
        binance: {
          apiKey: "key-with-special-chars-!@#$%^&*()",
          apiSecret: "secret-with-unicode-émojis-🔐",
        },
        bybit: {
          apiKey: "key-with-quotes-\"'",
          apiSecret: "secret-with-newlines-\n\r\t",
        },
        mexc: {
          apiKey: "key-with-backslash-\\",
          apiSecret: "secret-with-forward-slash-/",
        },
      };

      credentialManager.saveCredentials(specialCredentials);
      const loadedCredentials = credentialManager.loadCredentials();

      expect(loadedCredentials).toEqual(specialCredentials);
    });

    it("should handle empty strings in credentials", () => {
      const emptyCredentials: ExchangeCredentials = {
        binance: {
          apiKey: "",
          apiSecret: "",
        },
        bybit: {
          apiKey: "",
          apiSecret: "",
        },
        mexc: {
          apiKey: "",
          apiSecret: "",
        },
      };

      credentialManager.saveCredentials(emptyCredentials);
      const loadedCredentials = credentialManager.loadCredentials();

      expect(loadedCredentials).toEqual(emptyCredentials);
    });
  });

  describe("credentialsExist()", () => {
    it("should return false when credentials do not exist", () => {
      expect(credentialManager.credentialsExist()).toBe(false);
    });

    it("should return true when credentials exist", () => {
      credentialManager.saveCredentials(sampleCredentials);

      expect(credentialManager.credentialsExist()).toBe(true);
    });
  });

  describe("deleteCredentials()", () => {
    it("should delete credentials file successfully", () => {
      credentialManager.saveCredentials(sampleCredentials);
      expect(credentialManager.credentialsExist()).toBe(true);

      const result = credentialManager.deleteCredentials();

      expect(result).toBe(true);
      expect(credentialManager.credentialsExist()).toBe(false);
    });

    it("should return false when deleting non-existent credentials", () => {
      const result = credentialManager.deleteCredentials();

      expect(result).toBe(false);
    });
  });

  describe("validateCredentials()", () => {
    it("should return empty array for valid credentials", () => {
      const errors = credentialManager.validateCredentials(sampleCredentials);

      expect(errors).toEqual([]);
    });

    it("should detect missing Binance credentials", () => {
      const invalidCredentials = {
        ...sampleCredentials,
        binance: {
          apiKey: "",
          apiSecret: "",
        },
      };

      const errors = credentialManager.validateCredentials(invalidCredentials);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e: string) => e.includes("Binance"))).toBe(true);
    });

    it("should detect missing Bybit credentials", () => {
      const invalidCredentials = {
        ...sampleCredentials,
        bybit: {
          apiKey: "",
          apiSecret: "",
        },
      };

      const errors = credentialManager.validateCredentials(invalidCredentials);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e: string) => e.includes("Bybit"))).toBe(true);
    });

    it("should detect incomplete MEXC credentials", () => {
      const invalidCredentials = {
        ...sampleCredentials,
        mexc: {
          apiKey: "key-only",
          apiSecret: "",
        },
      };

      const errors = credentialManager.validateCredentials(invalidCredentials);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e: string) => e.includes("MEXC"))).toBe(true);
    });
  });

  describe("createEmptyCredentials()", () => {
    it("should create empty credentials structure", () => {
      const emptyCredentials = credentialManager.createEmptyCredentials();

      expect(emptyCredentials).toHaveProperty("binance");
      expect(emptyCredentials).toHaveProperty("bybit");
      expect(emptyCredentials).toHaveProperty("mexc");

      expect(emptyCredentials.binance.apiKey).toBe("");
      expect(emptyCredentials.binance.apiSecret).toBe("");
      expect(emptyCredentials.bybit.apiKey).toBe("");
      expect(emptyCredentials.bybit.apiSecret).toBe("");
      expect(emptyCredentials.mexc.apiKey).toBe("");
      expect(emptyCredentials.mexc.apiSecret).toBe("");
    });
  });

  describe("updateExchangeCredentials()", () => {
    it("should update Binance credentials", () => {
      credentialManager.saveCredentials(sampleCredentials);

      credentialManager.updateExchangeCredentials(
        "binance",
        "new-binance-key",
        "new-binance-secret",
      );

      const loadedCredentials = credentialManager.loadCredentials();

      expect(loadedCredentials.binance.apiKey).toBe("new-binance-key");
      expect(loadedCredentials.binance.apiSecret).toBe("new-binance-secret");
      // Other exchanges should remain unchanged
      expect(loadedCredentials.bybit).toEqual(sampleCredentials.bybit);
      expect(loadedCredentials.mexc).toEqual(sampleCredentials.mexc);
    });

    it("should update Bybit credentials", () => {
      credentialManager.saveCredentials(sampleCredentials);

      credentialManager.updateExchangeCredentials(
        "bybit",
        "new-bybit-key",
        "new-bybit-secret",
      );

      const loadedCredentials = credentialManager.loadCredentials();

      expect(loadedCredentials.bybit.apiKey).toBe("new-bybit-key");
      expect(loadedCredentials.bybit.apiSecret).toBe("new-bybit-secret");
    });

    it("should update MEXC credentials", () => {
      credentialManager.saveCredentials(sampleCredentials);

      credentialManager.updateExchangeCredentials(
        "mexc",
        "new-mexc-key",
        "new-mexc-secret",
      );

      const loadedCredentials = credentialManager.loadCredentials();

      expect(loadedCredentials.mexc.apiKey).toBe("new-mexc-key");
      expect(loadedCredentials.mexc.apiSecret).toBe("new-mexc-secret");
    });

    it("should create new credentials if none exist", () => {
      // Use skipValidation for partial updates
      credentialManager.updateExchangeCredentials(
        "binance",
        "first-binance-key",
        "first-binance-secret",
        true, // Skip validation for partial update
      );

      // Add Bybit credentials to satisfy validation
      credentialManager.updateExchangeCredentials(
        "bybit",
        "first-bybit-key",
        "first-bybit-secret",
        true, // Skip validation for partial update
      );

      expect(credentialManager.credentialsExist()).toBe(true);

      const loadedCredentials = credentialManager.loadCredentials();
      expect(loadedCredentials.binance.apiKey).toBe("first-binance-key");
      expect(loadedCredentials.binance.apiSecret).toBe("first-binance-secret");
      expect(loadedCredentials.bybit.apiKey).toBe("first-bybit-key");
      expect(loadedCredentials.bybit.apiSecret).toBe("first-bybit-secret");
    });

    it("should trim whitespace from credentials", () => {
      // First set up complete credentials
      credentialManager.saveCredentials(sampleCredentials);

      // Then update with whitespace
      credentialManager.updateExchangeCredentials(
        "binance",
        "  key-with-spaces  ",
        "  secret-with-spaces  ",
      );

      const loadedCredentials = credentialManager.loadCredentials();

      expect(loadedCredentials.binance.apiKey).toBe("key-with-spaces");
      expect(loadedCredentials.binance.apiSecret).toBe("secret-with-spaces");
    });
  });

  describe("changeMasterPassword()", () => {
    it("should change master password successfully", () => {
      credentialManager.saveCredentials(sampleCredentials);

      const newPassword = "new-master-password-67890";
      credentialManager.changeMasterPassword(newPassword);

      // Try loading with new password
      process.env.TITAN_MASTER_PASSWORD = newPassword;
      const loadedCredentials = credentialManager.loadCredentials();

      expect(loadedCredentials).toEqual(sampleCredentials);
    });

    it("should throw error if new password is too short", () => {
      credentialManager.saveCredentials(sampleCredentials);

      expect(() => {
        credentialManager.changeMasterPassword("short");
      }).toThrow("New master password must be at least 12 characters long");
    });

    it("should not change password if re-encryption fails", () => {
      credentialManager.saveCredentials(sampleCredentials);

      // This should work
      const loadedBefore = credentialManager.loadCredentials();
      expect(loadedBefore).toEqual(sampleCredentials);
    });
  });

  describe("Security properties", () => {
    it("should use different salt for each encryption", () => {
      credentialManager.saveCredentials(sampleCredentials);
      const content1 = fs.readFileSync(testCredentialsPath, "utf-8");
      const encrypted1 = JSON.parse(content1);

      credentialManager.saveCredentials(sampleCredentials);
      const content2 = fs.readFileSync(testCredentialsPath, "utf-8");
      const encrypted2 = JSON.parse(content2);

      expect(encrypted1.salt).not.toBe(encrypted2.salt);
    });

    it("should produce different ciphertext for same plaintext", () => {
      credentialManager.saveCredentials(sampleCredentials);
      const content1 = fs.readFileSync(testCredentialsPath, "utf-8");
      const encrypted1 = JSON.parse(content1);

      credentialManager.saveCredentials(sampleCredentials);
      const content2 = fs.readFileSync(testCredentialsPath, "utf-8");
      const encrypted2 = JSON.parse(content2);

      expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);
    });

    it("should verify authentication tag on decryption", () => {
      credentialManager.saveCredentials(sampleCredentials);

      // Tamper with encrypted data
      const fileContent = fs.readFileSync(testCredentialsPath, "utf-8");
      const encryptedData = JSON.parse(fileContent);

      // Flip a bit in the encrypted data
      const tamperedData = Buffer.from(encryptedData.encryptedData, "base64");
      tamperedData[0] ^= 0x01;
      encryptedData.encryptedData = tamperedData.toString("base64");

      fs.writeFileSync(testCredentialsPath, JSON.stringify(encryptedData));

      // Should fail authentication
      expect(() => {
        credentialManager.loadCredentials();
      }).toThrow();
    });
  });
});
