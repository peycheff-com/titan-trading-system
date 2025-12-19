# Credential Encryption Guide

This guide explains how to enable and use credential encryption for the Titan Execution Service.

## Overview

The Credential Manager encrypts sensitive API credentials (Bybit API keys, etc.) using AES-256-GCM encryption with a master password. This prevents credentials from being stored in plain text.

**Requirements:** 10.4-10.5 - Encrypt credentials with AES-256-GCM

## Quick Start

```bash
# 1. Set master password
export TITAN_MASTER_PASSWORD="your-strong-password-here"

# 2. Encrypt credentials
node scripts/encrypt-credentials.js

# 3. Start server (will use encrypted credentials)
npm start
```

## Security Model

### Encryption Algorithm
- **Algorithm:** AES-256-GCM (Galois/Counter Mode)
- **Key Derivation:** scrypt with salt
- **Key Size:** 256 bits (32 bytes)
- **IV Size:** 128 bits (16 bytes)
- **Auth Tag:** 128 bits (16 bytes)

### Storage Location
- **Encrypted File:** `~/.titan/credentials.enc`
- **Permissions:** 600 (read/write for owner only)
- **Format:** Binary (IV + Auth Tag + Encrypted Data)

### Master Password
- **Minimum Length:** 16 characters
- **Recommended:** 32+ characters with mixed case, numbers, symbols
- **Storage:** Environment variable `TITAN_MASTER_PASSWORD`
- **Never:** Store in code, config files, or version control

## Setup Instructions

### Step 1: Generate Strong Master Password

```bash
# Generate a random 32-character password
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# Or use a password manager to generate one
```

**Password Requirements:**
- Minimum 16 characters
- Mix of uppercase, lowercase, numbers, symbols
- Not a dictionary word
- Not reused from other services

### Step 2: Set Master Password

**Option A: Environment Variable (Recommended)**
```bash
# Add to ~/.bashrc or ~/.zshrc
export TITAN_MASTER_PASSWORD="your-strong-password-here"

# Reload shell
source ~/.bashrc  # or source ~/.zshrc
```

**Option B: .env File (Development Only)**
```bash
# Add to services/titan-execution/.env
TITAN_MASTER_PASSWORD=your-strong-password-here

# IMPORTANT: Add .env to .gitignore
echo ".env" >> .gitignore
```

**Option C: Secure Vault (Production)**
```bash
# Use AWS Secrets Manager, HashiCorp Vault, etc.
# Retrieve password at runtime
export TITAN_MASTER_PASSWORD=$(aws secretsmanager get-secret-value --secret-id titan-master-password --query SecretString --output text)
```

### Step 3: Encrypt Credentials

Create a script to encrypt your credentials:

```bash
# Create encryption script
cat > services/titan-execution/scripts/encrypt-credentials.js << 'EOF'
import { CredentialManager } from '../security/CredentialManager.js';

const masterPassword = process.env.TITAN_MASTER_PASSWORD;

if (!masterPassword) {
  console.error('❌ TITAN_MASTER_PASSWORD not set');
  process.exit(1);
}

if (masterPassword.length < 16) {
  console.error('❌ Master password must be at least 16 characters');
  process.exit(1);
}

const credentialManager = new CredentialManager({ masterPassword });

// Credentials to encrypt
const credentials = {
  bybit: {
    apiKey: process.env.BYBIT_API_KEY || '',
    apiSecret: process.env.BYBIT_API_SECRET || '',
    testnet: process.env.BYBIT_TESTNET === 'true'
  },
  // Add other credentials as needed
};

// Validate credentials
if (!credentials.bybit.apiKey || !credentials.bybit.apiSecret) {
  console.error('❌ BYBIT_API_KEY and BYBIT_API_SECRET must be set');
  process.exit(1);
}

// Encrypt and save
try {
  credentialManager.encrypt(credentials);
  console.log('✅ Credentials encrypted successfully');
  console.log('   Location: ~/.titan/credentials.enc');
  console.log('   Algorithm: AES-256-GCM');
  console.log('');
  console.log('⚠️  IMPORTANT:');
  console.log('   - Keep your master password safe');
  console.log('   - Never commit credentials.enc to version control');
  console.log('   - Back up credentials.enc securely');
} catch (error) {
  console.error('❌ Encryption failed:', error.message);
  process.exit(1);
}
EOF

# Run encryption
node services/titan-execution/scripts/encrypt-credentials.js
```

### Step 4: Verify Encryption

```bash
# Check encrypted file exists
ls -lh ~/.titan/credentials.enc

# Verify permissions (should be 600)
stat -f "%A %N" ~/.titan/credentials.enc  # macOS
# or
stat -c "%a %n" ~/.titan/credentials.enc  # Linux

# Test decryption
node -e "
import { CredentialManager } from './services/titan-execution/security/CredentialManager.js';
const cm = new CredentialManager({ masterPassword: process.env.TITAN_MASTER_PASSWORD });
const creds = cm.decrypt();
console.log('✅ Decryption successful');
console.log('Bybit API Key:', creds.bybit.apiKey.substring(0, 8) + '...');
"
```

### Step 5: Update Server to Use Encrypted Credentials

The server will automatically use encrypted credentials if they exist:

```javascript
// In server-production.js (already implemented)
import { CredentialManager } from './security/CredentialManager.js';

// Check if master password is set
const masterPassword = process.env.TITAN_MASTER_PASSWORD;

if (masterPassword) {
  try {
    const credentialManager = new CredentialManager({ masterPassword });
    const credentials = credentialManager.decrypt();
    
    // Use encrypted credentials
    const bybitApiKey = credentials.bybit.apiKey;
    const bybitApiSecret = credentials.bybit.apiSecret;
    
    fastify.log.info('✅ Using encrypted credentials');
  } catch (error) {
    fastify.log.error('❌ Failed to decrypt credentials:', error.message);
    process.exit(1);
  }
} else {
  // Fall back to environment variables
  const bybitApiKey = process.env.BYBIT_API_KEY;
  const bybitApiSecret = process.env.BYBIT_API_SECRET;
  
  fastify.log.warn('⚠️  Using unencrypted credentials from environment');
}
```

## Usage

### Starting Server with Encrypted Credentials

```bash
# Set master password
export TITAN_MASTER_PASSWORD="your-strong-password-here"

# Start server
npm start

# Server will automatically decrypt and use credentials
```

### Rotating Credentials

```bash
# 1. Update credentials in environment
export BYBIT_API_KEY="new-api-key"
export BYBIT_API_SECRET="new-api-secret"

# 2. Re-encrypt
node scripts/encrypt-credentials.js

# 3. Restart server
npm restart
```

### Backing Up Encrypted Credentials

```bash
# Create backup
cp ~/.titan/credentials.enc ~/.titan/credentials.enc.backup

# Or backup to secure location
cp ~/.titan/credentials.enc /path/to/secure/backup/

# IMPORTANT: Also back up your master password securely
```

### Restoring from Backup

```bash
# Restore encrypted file
cp /path/to/backup/credentials.enc ~/.titan/credentials.enc

# Set master password
export TITAN_MASTER_PASSWORD="your-master-password"

# Start server
npm start
```

## Security Best Practices

### 1. Master Password Management

**DO:**
- Use a password manager to generate and store master password
- Use different master passwords for dev/staging/production
- Rotate master password every 90 days
- Store master password in secure vault (AWS Secrets Manager, etc.)

**DON'T:**
- Store master password in code or config files
- Commit master password to version control
- Share master password via email or chat
- Use weak or dictionary passwords

### 2. Credential File Protection

**DO:**
- Set file permissions to 600 (owner read/write only)
- Store in user home directory (~/.titan/)
- Back up encrypted file securely
- Monitor file access logs

**DON'T:**
- Commit credentials.enc to version control
- Store in publicly accessible directory
- Share encrypted file without secure channel
- Leave unencrypted backups

### 3. Production Deployment

**DO:**
- Use environment-specific master passwords
- Retrieve master password from secure vault at runtime
- Rotate credentials regularly
- Monitor for unauthorized access attempts
- Use hardware security modules (HSM) for key storage

**DON'T:**
- Use same master password across environments
- Store master password in deployment scripts
- Skip credential rotation
- Ignore security alerts

## Troubleshooting

### Error: "TITAN_MASTER_PASSWORD not set"

**Solution:**
```bash
# Set master password
export TITAN_MASTER_PASSWORD="your-password"

# Verify it's set
echo $TITAN_MASTER_PASSWORD
```

### Error: "Failed to decrypt credentials"

**Possible causes:**
1. Wrong master password
2. Corrupted credentials.enc file
3. File permissions issue

**Solution:**
```bash
# 1. Verify master password is correct
echo $TITAN_MASTER_PASSWORD

# 2. Check file exists and is readable
ls -lh ~/.titan/credentials.enc

# 3. Re-encrypt with correct password
node scripts/encrypt-credentials.js
```

### Error: "Master password must be at least 16 characters"

**Solution:**
```bash
# Generate stronger password
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# Set new password
export TITAN_MASTER_PASSWORD="<generated-password>"

# Re-encrypt
node scripts/encrypt-credentials.js
```

### Error: "BYBIT_API_KEY and BYBIT_API_SECRET must be set"

**Solution:**
```bash
# Set API credentials
export BYBIT_API_KEY="your-api-key"
export BYBIT_API_SECRET="your-api-secret"

# Encrypt
node scripts/encrypt-credentials.js
```

## Migration Guide

### From Unencrypted to Encrypted

```bash
# 1. Verify current credentials work
npm start
# (Ctrl+C to stop)

# 2. Set master password
export TITAN_MASTER_PASSWORD="your-strong-password"

# 3. Encrypt credentials
node scripts/encrypt-credentials.js

# 4. Remove plain text credentials from .env (optional)
# Keep them as backup until you verify encryption works

# 5. Start server with encrypted credentials
npm start

# 6. Verify server starts successfully

# 7. Remove plain text credentials from .env
# Edit .env and remove BYBIT_API_KEY and BYBIT_API_SECRET
```

### From Old Encryption to New

```bash
# 1. Decrypt with old master password
export TITAN_MASTER_PASSWORD="old-password"
node -e "
import { CredentialManager } from './services/titan-execution/security/CredentialManager.js';
const cm = new CredentialManager({ masterPassword: process.env.TITAN_MASTER_PASSWORD });
const creds = cm.decrypt();
console.log(JSON.stringify(creds, null, 2));
" > /tmp/credentials.json

# 2. Set new master password
export TITAN_MASTER_PASSWORD="new-password"

# 3. Re-encrypt with new password
# (Update script to read from /tmp/credentials.json)
node scripts/encrypt-credentials.js

# 4. Verify new encryption works
npm start

# 5. Delete temporary file
rm /tmp/credentials.json
```

## API Reference

### CredentialManager

```javascript
import { CredentialManager } from './security/CredentialManager.js';

// Initialize
const cm = new CredentialManager({
  masterPassword: 'your-password',
  credentialsPath: '~/.titan/credentials.enc'  // optional
});

// Encrypt credentials
cm.encrypt({
  bybit: {
    apiKey: 'key',
    apiSecret: 'secret'
  }
});

// Decrypt credentials
const credentials = cm.decrypt();
console.log(credentials.bybit.apiKey);
```

## Resources

- [AES-256-GCM Specification](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [Node.js Crypto Module](https://nodejs.org/api/crypto.html)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

## Support

For issues or questions:
1. Check this guide's Troubleshooting section
2. Verify master password is set correctly
3. Check file permissions on credentials.enc
4. Review server logs for error messages
