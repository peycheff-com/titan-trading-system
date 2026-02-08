/**
 * Control Deck Entry Point
 *
 * Run with: npm run deck
 * Requires BRAIN_URL and OPS_SECRET env vars.
 */
import React from 'react';
import { render } from 'ink';
import dotenv from 'dotenv';
import { ControlDeck } from './ControlDeck.js';
import { BrainApiClient } from '../api/BrainApiClient.js';

dotenv.config();

const BRAIN_URL = process.env.BRAIN_URL ?? 'http://localhost:3000';
const OPS_SECRET = process.env.OPS_SECRET;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const OPERATOR_ID = process.env.OPERATOR_ID ?? 'operator-console';
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_MS ?? '2000');

if (!OPS_SECRET) {
  console.error('[control-deck] FATAL: OPS_SECRET env var is missing.');
  process.exit(1);
}

const api = new BrainApiClient({
  brainUrl: BRAIN_URL,
  opsSecret: OPS_SECRET,
  authToken: AUTH_TOKEN,
});

console.log(`[control-deck] Connecting to Brain at ${BRAIN_URL}...`);

render(
  <ControlDeck
    api={api}
    operatorId={OPERATOR_ID}
    pollIntervalMs={POLL_INTERVAL}
  />,
);
