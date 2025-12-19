#!/usr/bin/env node
/**
 * HMAC Webhook Signing Helper
 * 
 * Usage:
 *   node sign_webhook.js '{"signal_id":"test","type":"PREPARE"}'
 * 
 * Or with environment variable:
 *   HMAC_SECRET=your_secret node sign_webhook.js '{"signal_id":"test","type":"PREPARE"}'
 */

import crypto from 'crypto';
import 'dotenv/config';

const HMAC_SECRET = process.env.HMAC_SECRET;

if (!HMAC_SECRET) {
  console.error('Error: HMAC_SECRET not found in environment');
  console.error('Set it in .env file or pass as environment variable:');
  console.error('  HMAC_SECRET=your_secret node sign_webhook.js \'{"signal_id":"test"}\'');
  process.exit(1);
}

if (process.argv.length < 3) {
  console.error('Usage: node sign_webhook.js \'{"signal_id":"test","type":"PREPARE"}\'');
  process.exit(1);
}

const payload = process.argv[2];

try {
  // Validate JSON
  JSON.parse(payload);
  
  // Generate signature
  const signature = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(payload)
    .digest('hex');
  
  console.log(signature);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
