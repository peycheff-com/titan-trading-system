#!/usr/bin/env node

/**
 * Generate Self-Signed SSL Certificate for Development
 * 
 * This script generates a self-signed SSL certificate for local development
 * and testing. For production, use certificates from a trusted CA like
 * Let's Encrypt.
 * 
 * Usage:
 *   node scripts/generate-ssl-cert.js
 *   node scripts/generate-ssl-cert.js --output ./certs
 *   node scripts/generate-ssl-cert.js --days 365 --cn localhost
 * 
 * Requirements: 10.7 - Enable HTTPS for production
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
};

const outputDir = getArg('output', path.join(__dirname, '..', 'certs'));
const days = getArg('days', '365');
const commonName = getArg('cn', 'localhost');
const organization = getArg('org', 'Titan Trading System');

const keyPath = path.join(outputDir, 'titan.key');
const certPath = path.join(outputDir, 'titan.crt');

console.log('🔐 Generating Self-Signed SSL Certificate for Titan');
console.log('');
console.log('Configuration:');
console.log(`  Output directory: ${outputDir}`);
console.log(`  Validity: ${days} days`);
console.log(`  Common Name (CN): ${commonName}`);
console.log(`  Organization: ${organization}`);
console.log('');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`✅ Created directory: ${outputDir}`);
}

// Check if openssl is available
try {
  execSync('openssl version', { stdio: 'pipe' });
} catch (error) {
  console.error('❌ OpenSSL is not installed or not in PATH');
  console.error('');
  console.error('Install OpenSSL:');
  console.error('  macOS: brew install openssl');
  console.error('  Ubuntu: sudo apt-get install openssl');
  console.error('  Windows: Download from https://slproweb.com/products/Win32OpenSSL.html');
  process.exit(1);
}

// Generate private key and self-signed certificate
const opensslCmd = `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -sha256 -days ${days} -nodes -subj "/CN=${commonName}/O=${organization}" -addext "subjectAltName=DNS:${commonName},DNS:*.${commonName},IP:127.0.0.1"`;

try {
  console.log('Generating certificate...');
  execSync(opensslCmd, { stdio: 'pipe' });
  
  console.log('');
  console.log('✅ SSL certificate generated successfully!');
  console.log('');
  console.log('Files created:');
  console.log(`  Private Key: ${keyPath}`);
  console.log(`  Certificate: ${certPath}`);
  console.log('');
  console.log('To enable HTTPS, add these to your .env file:');
  console.log('');
  console.log('  HTTPS_ENABLED=true');
  console.log(`  SSL_KEY_PATH=${keyPath}`);
  console.log(`  SSL_CERT_PATH=${certPath}`);
  console.log('  HTTPS_PORT=443');
  console.log('  HTTPS_REDIRECT=true');
  console.log('');
  console.log('⚠️  Note: Self-signed certificates will show browser warnings.');
  console.log('   For production, use certificates from Let\'s Encrypt or another CA.');
  console.log('');
  console.log('To trust this certificate on macOS:');
  console.log(`  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`);
  console.log('');
  
  // Create .gitignore in certs directory
  const gitignorePath = path.join(outputDir, '.gitignore');
  fs.writeFileSync(gitignorePath, '# Ignore SSL certificates\n*.key\n*.crt\n*.pem\n');
  console.log(`✅ Created ${gitignorePath} to prevent committing certificates`);
  
} catch (error) {
  console.error('❌ Failed to generate certificate:', error.message);
  process.exit(1);
}
