# CredentialManager - Secure Credential Storage

## Overview

The `CredentialManager` provides secure storage and retrieval of exchange API credentials using **AES-256-GCM** authenticated encryption. All credentials are encrypted with a master password and stored in `~/.titan-scanner/secrets.enc`.

## Security Features

- **AES-256-GCM**: Authenticated encryption with 256-bit keys
- **PBKDF2 Key Derivation**: 100,000 iterations (OWASP recommended minimum)
- **Random IV**: New initialization vector for each encryption
- **Random Salt**: New salt for each key derivation
- **Authentication Tag**: Prevents tampering with encrypted data
- **Secure File Permissions**: Credentials file is readable/writable by owner only (0600)

## Setup

### 1. Set Master Password

The master password must be set as an environment variable:

```bash
export TITAN_MASTER_PASSWORD="your-secure-password-here"
```

**Requirements:**
- Minimum 12 characters
- Should be strong and unique
- Never commit to version control

### 2. Add to .env File (Recommended)

Create a `.env` file in your project root:

```bash
# .env
TITAN_MASTER_PASSWORD=your-secure-password-here
```

Then load it in your application:

```typescript
import * as dotenv from 'dotenv';
dotenv.config();
```

**IMPORTANT:** Add `.env` to your `.gitignore` file!

## Usage

### Basic Usage

```typescript
import { CredentialManager } from './config/CredentialManager';

// Create instance
const credManager = new CredentialManager();

// Save credentials
const credentials = {
  binance: {
    apiKey: 'your-binance-api-key',
    apiSecret: 'your-binance-api-secret',
  },
  bybit: {
    apiKey: 'your-bybit-api-key',
    apiSecret: 'your-bybit-api-secret',
  },
  mexc: {
    apiKey: 'your-mexc-api-key',
    apiSecret: 'your-mexc-api-secret',
  },
};

credManager.saveCredentials(credentials);

// Load credentials
const loadedCreds = credManager.loadCredentials();
console.log(loadedCreds.binance.apiKey);
```

### Update Single Exchange

```typescript
// Update Binance credentials
credManager.updateExchangeCredentials(
  'binance',
  'new-api-key',
  'new-api-secret'
);

// Update with skipValidation for partial updates
credManager.updateExchangeCredentials(
  'mexc',
  'mexc-key',
  'mexc-secret',
  true  // Skip validation
);
```

### Check if Credentials Exist

```typescript
if (credManager.credentialsExist()) {
  const creds = credManager.loadCredentials();
  // Use credentials
} else {
  console.log('No credentials found. Please set up credentials first.');
}
```

### Delete Credentials

```typescript
credManager.deleteCredentials();
```

### Change Master Password

```typescript
// Re-encrypts credentials with new password
credManager.changeMasterPassword('new-secure-password-12345');
```

### Validate Credentials

```typescript
const errors = credManager.validateCredentials(credentials);

if (errors.length > 0) {
  console.error('Validation errors:', errors);
} else {
  console.log('Credentials are valid');
}
```

## File Structure

### Encrypted File Format

The encrypted credentials file (`~/.titan-scanner/secrets.enc`) contains:

```json
{
  "version": 1,
  "salt": "base64-encoded-salt",
  "iv": "base64-encoded-iv",
  "authTag": "base64-encoded-auth-tag",
  "encryptedData": "base64-encoded-encrypted-credentials"
}
```

### Credentials Structure

```typescript
interface ExchangeCredentials {
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
```

## Validation Rules

The `validateCredentials()` method enforces:

1. **Binance credentials are required** (always enabled for signal validation)
2. **Bybit credentials are required** (primary execution exchange)
3. **MEXC credentials are optional** but if provided, both key and secret must be present
4. **No empty strings** for required fields

## Security Best Practices

### DO:
✅ Use a strong master password (12+ characters)
✅ Store master password in environment variable
✅ Add `.env` to `.gitignore`
✅ Use different passwords for different environments
✅ Rotate API keys regularly
✅ Use read-only API keys when possible

### DON'T:
❌ Commit master password to version control
❌ Share master password via insecure channels
❌ Use weak or common passwords
❌ Store credentials in plain text
❌ Reuse passwords across systems

## Error Handling

### Common Errors

**Master password not set:**
```
Error: TITAN_MASTER_PASSWORD environment variable not set
```
**Solution:** Set the environment variable

**Master password too short:**
```
Error: Master password must be at least 12 characters long
```
**Solution:** Use a longer password

**Incorrect master password:**
```
Error: Failed to decrypt credentials
```
**Solution:** Verify the master password is correct

**Credentials file not found:**
```
Error: Credentials file not found: ~/.titan-scanner/secrets.enc
```
**Solution:** Save credentials first using `saveCredentials()`

**Validation failed:**
```
Error: Credential validation failed:
Binance API key is required
Bybit API secret is required
```
**Solution:** Provide all required credentials

## Integration Example

### Complete Setup Flow

```typescript
import { CredentialManager } from './config/CredentialManager';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create credential manager
const credManager = new CredentialManager();

// Check if credentials exist
if (!credManager.credentialsExist()) {
  console.log('Setting up credentials for the first time...');
  
  // Create credentials
  const credentials = {
    binance: {
      apiKey: process.env.BINANCE_API_KEY || '',
      apiSecret: process.env.BINANCE_API_SECRET || '',
    },
    bybit: {
      apiKey: process.env.BYBIT_API_KEY || '',
      apiSecret: process.env.BYBIT_API_SECRET || '',
    },
    mexc: {
      apiKey: process.env.MEXC_API_KEY || '',
      apiSecret: process.env.MEXC_API_SECRET || '',
    },
  };
  
  // Validate
  const errors = credManager.validateCredentials(credentials);
  if (errors.length > 0) {
    console.error('Credential validation failed:', errors);
    process.exit(1);
  }
  
  // Save
  credManager.saveCredentials(credentials);
  console.log('✅ Credentials saved successfully');
}

// Load credentials for use
const creds = credManager.loadCredentials();

// Use credentials with exchange clients
const binanceClient = new BinanceClient(creds.binance.apiKey, creds.binance.apiSecret);
const bybitClient = new BybitClient(creds.bybit.apiKey, creds.bybit.apiSecret);
```

## Testing

Run the test suite:

```bash
npm test -- CredentialManager.test.ts
```

The test suite covers:
- Encryption/decryption round-trips
- Master password validation
- File operations
- Error handling
- Security properties (IV randomness, authentication)
- Credential validation
- Update operations

## Technical Details

### Encryption Algorithm

**AES-256-GCM** (Galois/Counter Mode):
- **Key Size:** 256 bits (32 bytes)
- **IV Size:** 128 bits (16 bytes)
- **Authentication Tag:** 128 bits (16 bytes)
- **Mode:** Authenticated encryption with associated data (AEAD)

### Key Derivation

**PBKDF2** (Password-Based Key Derivation Function 2):
- **Hash Function:** SHA-256
- **Iterations:** 100,000 (OWASP recommended minimum)
- **Salt Size:** 256 bits (32 bytes)
- **Output Key Size:** 256 bits (32 bytes)

### Why AES-256-GCM?

1. **Authenticated Encryption:** Provides both confidentiality and authenticity
2. **Tamper Detection:** Authentication tag prevents modification of ciphertext
3. **Industry Standard:** Widely used and well-tested
4. **Performance:** Hardware acceleration available on modern CPUs
5. **NIST Approved:** Recommended by NIST for sensitive data

### Why PBKDF2?

1. **Brute Force Resistance:** High iteration count slows down password cracking
2. **Salt:** Prevents rainbow table attacks
3. **Standardized:** NIST SP 800-132 compliant
4. **Widely Supported:** Available in Node.js crypto module

## File Locations

- **Credentials File:** `~/.titan-scanner/secrets.enc`
- **Config Directory:** `~/.titan-scanner/`
- **File Permissions:** `0600` (read/write for owner only)

## API Reference

### Constructor

```typescript
new CredentialManager()
```

Creates a new instance and ensures the credentials directory exists.

### Methods

#### `saveCredentials(credentials: ExchangeCredentials): void`

Encrypts and saves credentials to file.

**Throws:** Error if master password is not set or too short

#### `loadCredentials(): ExchangeCredentials`

Loads and decrypts credentials from file.

**Returns:** Decrypted credentials
**Throws:** Error if file doesn't exist or decryption fails

#### `credentialsExist(): boolean`

Checks if credentials file exists.

**Returns:** `true` if file exists, `false` otherwise

#### `deleteCredentials(): boolean`

Deletes the credentials file.

**Returns:** `true` if file was deleted, `false` if it didn't exist

#### `updateExchangeCredentials(exchange, apiKey, apiSecret, skipValidation?): void`

Updates credentials for a specific exchange.

**Parameters:**
- `exchange`: 'binance' | 'bybit' | 'mexc'
- `apiKey`: API key string
- `apiSecret`: API secret string
- `skipValidation`: Optional boolean to skip validation (default: false)

#### `validateCredentials(credentials: ExchangeCredentials): string[]`

Validates credential structure and completeness.

**Returns:** Array of validation error messages (empty if valid)

#### `createEmptyCredentials(): ExchangeCredentials`

Creates an empty credentials structure.

**Returns:** Empty credentials object

#### `changeMasterPassword(newPassword: string): void`

Changes the master password and re-encrypts credentials.

**Parameters:**
- `newPassword`: New master password (minimum 12 characters)

**Throws:** Error if new password is too short

#### `getCredentialsPath(): string`

Gets the path to the encrypted credentials file.

**Returns:** Full path to credentials file

## Troubleshooting

### Issue: "TITAN_MASTER_PASSWORD environment variable not set"

**Solution:**
```bash
export TITAN_MASTER_PASSWORD="your-password"
```

Or add to `.env` file and load with `dotenv`.

### Issue: "Failed to decrypt credentials"

**Possible causes:**
1. Wrong master password
2. Corrupted credentials file
3. File was tampered with

**Solution:**
1. Verify master password is correct
2. If file is corrupted, delete and recreate credentials
3. Check file permissions

### Issue: "Credential validation failed"

**Solution:**
Ensure all required fields are provided:
- Binance API key and secret (required)
- Bybit API key and secret (required)
- MEXC credentials (optional, but both key and secret if provided)

### Issue: Permission denied when accessing credentials file

**Solution:**
```bash
chmod 600 ~/.titan-scanner/secrets.enc
```

## Migration Guide

### From Plain Text Credentials

If you're migrating from plain text credentials:

```typescript
// Old way (INSECURE)
const apiKey = 'plain-text-key';
const apiSecret = 'plain-text-secret';

// New way (SECURE)
const credManager = new CredentialManager();
credManager.saveCredentials({
  binance: { apiKey: 'key', apiSecret: 'secret' },
  bybit: { apiKey: 'key', apiSecret: 'secret' },
  mexc: { apiKey: '', apiSecret: '' },
});

// Load when needed
const creds = credManager.loadCredentials();
```

### Changing Master Password

```typescript
// 1. Load with old password
process.env.TITAN_MASTER_PASSWORD = 'old-password';
const credManager = new CredentialManager();

// 2. Change to new password
credManager.changeMasterPassword('new-password-12345');

// 3. Update environment variable
process.env.TITAN_MASTER_PASSWORD = 'new-password-12345';
```

## Support

For issues or questions:
1. Check this documentation
2. Review test cases in `tests/unit/CredentialManager.test.ts`
3. Check error messages for specific guidance
4. Verify environment variables are set correctly
