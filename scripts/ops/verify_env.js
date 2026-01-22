#!/usr/bin/env node
/* eslint-disable */

/**
 * Script to verify that the target environment has all keys defined in .env.example
 * Usage: node verify_env.js <path_to_env_example> <path_to_env>
 */

const fs = require('fs');
const path = require('path');

const examplePath = process.argv[2] || '.env.example';
const targetPath = process.argv[3] || '.env';

if (!fs.existsSync(examplePath)) {
    console.error(`❌ .env.example not found at ${examplePath}`);
    process.exit(1);
}

if (!fs.existsSync(targetPath)) {
    console.error(`❌ Target .env not found at ${targetPath}`);
    process.exit(1);
}

function parseEnv(content) {
    return content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => line.split('=')[0]);
}

const exampleKeys = parseEnv(fs.readFileSync(examplePath, 'utf8'));
const targetKeys = new Set(parseEnv(fs.readFileSync(targetPath, 'utf8')));

const missingKeys = exampleKeys.filter(key => !targetKeys.has(key));

if (missingKeys.length > 0) {
    console.error('❌ Config Drift Detected! The following keys are missing in .env:');
    missingKeys.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
}

console.log('✅ Configuration Verified. No drift detected.');
process.exit(0);
