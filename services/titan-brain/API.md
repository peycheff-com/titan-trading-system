# Titan Brain API Documentation

Complete API reference for the Titan Brain orchestrator service.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Signal Format](#signal-format)
- [Webhook Endpoints](#webhook-endpoints)
- [Dashboard Data Format](#dashboard-data-format)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Examples](#examples)

---

## Overview

### Base URL

```
http://localhost:3100
```

### Content Type

All requests and responses use JSON:

```
Content-Type: application/json
```

### Response Format

All responses follow a consistent format:

**Success Response:**
```json
{
  "field1": "value1",
  "field2": "value2",
  "timestamp": 1702500000000
}
```

**Error Response:**
```json
{
  "error": "Error message description",
  "timestamp": 1702500000000
}
```

---

## Authentication

### HMAC Signature Verification

When `WEBHOOK_SECRET` is configured, all POST requests must include an HMAC signature.

**Header:** `x-signature`

**Algorithm:** SHA-256

**Signature Generation:**

```javascript
const crypto = require('crypto');

function generateSignature(body, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
}

// Usage
const signature = generateSignature(requestBody, process.env.WEBHOOK_SECRET);
```

**Example Request with Signature:**

```bash
curl -X POST http://localhost:3100/signal \
  -H "Content-Type: application/json" \
  -H "x-signature: a1b2c3d4e5f6..." \
  -d '{"signalId":"sig_123","phaseId":"phase1","symbol":"BTCUSDT","side":"BUY","requestedSize":1000}'
```

### Operator Authentication

Admin endpoints require operator credentials in the request body:

```json
{
  "operatorId": "admin",
  "password": "secure_password"
}
```

---

## Signal Format

### Intent Signal (Input)

The standard signal format for requesting trade permission:

```typescript
interface IntentSignal {
  /** Unique identifier for idempotency */
  signalId: string;
  
  /** Phase originating the signal */
  phaseId: 'phase1' | 'phase2' | 'phase3';
  
  /** Trading pair symbol */
  symbol: string;
  
  /** Trade direction */
  side: 'BUY' | 'SELL';
  
  /** Requested position size in USD notional */
  requestedSize: number;
  
  /** Unix timestamp in milliseconds (optional) */
  timestamp?: number;
  
  /** Requested leverage (optional) */
  leverage?: number;
}
```

**Example:**
```json
{
  "signalId": "sig_phase1_btc_1702500000000",
  "phaseId": "phase1",
  "symbol": "BTCUSDT",
  "side": "BUY",
  "requestedSize": 1000,
  "timestamp": 1702500000000,
  "leverage": 15
}
```

### Phase Signal Format (Alternative)

Phase-specific webhooks accept a slightly different format:

```typescript
interface PhaseSignal {
  /** Unique identifier */
  signal_id: string;
  
  /** Trading pair symbol */
  symbol: string;
  
  /** Trade direction */
  direction: 'LONG' | 'SHORT';
  
  /** Position size in USD (optional) */
  size?: number;
  
  /** Unix timestamp in milliseconds (optional) */
  timestamp?: number;
  
  /** Requested leverage (optional) */
  leverage?: number;
}
```

**Example:**
```json
{
  "signal_id": "trap_btc_liquidation_1702500000000",
  "symbol": "BTCUSDT",
  "direction": "LONG",
  "size": 500,
  "leverage": 20
}
```

### Brain Decision (Output)

The response format for signal processing:

```typescript
interface BrainDecision {
  /** Original signal ID */
  signalId: string;
  
  /** Whether the signal was approved */
  approved: boolean;
  
  /** Authorized position size (may be less than requested) */
  authorizedSize: number;
  
  /** Human-readable explanation */
  reason: string;
  
  /** Current allocation vector */
  allocation: AllocationVector;
  
  /** Phase performance metrics */
  performance: PhasePerformance;
  
  /** Risk assessment details */
  risk: RiskDecision;
  
  /** Decision timestamp */
  timestamp: number;
  
  /** Processing time in milliseconds */
  processingTime?: number;
}
```

**Approved Example:**
```json
{
  "signalId": "sig_phase1_btc_1702500000000",
  "approved": true,
  "authorizedSize": 800,
  "reason": "Approved with size reduction due to phase weight (80%)",
  "allocation": {
    "w1": 0.8,
    "w2": 0.2,
    "w3": 0.0,
    "timestamp": 1702500000000
  },
  "performance": {
    "phaseId": "phase1",
    "sharpeRatio": 1.5,
    "totalPnL": 250.00,
    "tradeCount": 15,
    "winRate": 0.65,
    "avgWin": 50.00,
    "avgLoss": 25.00,
    "modifier": 1.0
  },
  "risk": {
    "approved": true,
    "reason": "Within risk limits",
    "riskMetrics": {
      "currentLeverage": 5.0,
      "projectedLeverage": 8.0,
      "correlation": 0.3,
      "portfolioDelta": 500.00,
      "portfolioBeta": 0.85
    }
  },
  "timestamp": 1702500000050,
  "processingTime": 45
}
```

**Vetoed Example:**
```json
{
  "signalId": "sig_phase1_btc_1702500000000",
  "approved": false,
  "authorizedSize": 0,
  "reason": "Circuit breaker active - trading halted",
  "allocation": {
    "w1": 0.8,
    "w2": 0.2,
    "w3": 0.0,
    "timestamp": 1702500000000
  },
  "performance": {
    "phaseId": "phase1",
    "sharpeRatio": -0.5,
    "totalPnL": -100.00,
    "tradeCount": 8,
    "winRate": 0.35,
    "avgWin": 30.00,
    "avgLoss": 45.00,
    "modifier": 0.5
  },
  "risk": {
    "approved": false,
    "reason": "Circuit breaker active",
    "riskMetrics": {
      "currentLeverage": 0,
      "projectedLeverage": 0,
      "correlation": 0,
      "portfolioDelta": 0,
      "portfolioBeta": 0
    }
  },
  "timestamp": 1702500000012,
  "processingTime": 8
}
```

---

## Webhook Endpoints

### Core Signal Endpoint

#### POST /signal

Process an intent signal from any phase.

**Request:**
```bash
curl -X POST http://localhost:3100/signal \
  -H "Content-Type: application/json" \
  -d '{
    "signalId": "sig_123",
    "phaseId": "phase1",
    "symbol": "BTCUSDT",
    "side": "BUY",
    "requestedSize": 1000
  }'
```

**Response (200 OK):**
```json
{
  "signalId": "sig_123",
  "approved": true,
  "authorizedSize": 800,
  "reason": "Approved",
  "processingTime": 45
}
```

**Response (409 Conflict - Duplicate):**
```json
{
  "error": "Duplicate signal ID",
  "signalId": "sig_123",
  "timestamp": 1702500000000
}
```

---

### Phase-Specific Webhooks

#### POST /webhook/phase1 (alias: /webhook/scavenger)

Receive signals from Phase 1 (Scavenger).

**Request:**
```bash
curl -X POST http://localhost:3100/webhook/phase1 \
  -H "Content-Type: application/json" \
  -d '{
    "signal_id": "trap_btc_1702500000000",
    "symbol": "BTCUSDT",
    "direction": "LONG",
    "size": 500,
    "leverage": 20
  }'
```

**Response:**
```json
{
  "signalId": "trap_btc_1702500000000",
  "approved": true,
  "authorizedSize": 400,
  "reason": "Approved with leverage cap adjustment",
  "processingTime": 38,
  "source": "phase1"
}
```

---

#### POST /webhook/phase2 (alias: /webhook/hunter)

Receive signals from Phase 2 (Hunter).

**Request:**
```bash
curl -X POST http://localhost:3100/webhook/phase2 \
  -H "Content-Type: application/json" \
  -d '{
    "signal_id": "hologram_eth_1702500000000",
    "symbol": "ETHUSDT",
    "direction": "SHORT",
    "size": 2000,
    "leverage": 5
  }'
```

---

#### POST /webhook/phase3 (alias: /webhook/sentinel)

Receive signals from Phase 3 (Sentinel).

**Request:**
```bash
curl -X POST http://localhost:3100/webhook/phase3 \
  -H "Content-Type: application/json" \
  -d '{
    "signal_id": "basis_btc_1702500000000",
    "symbol": "BTCUSDT",
    "direction": "LONG",
    "size": 10000
  }'
```

---

### Phase Registration

#### POST /phases/register

Register a phase's webhook URL for receiving notifications.

**Request:**
```bash
curl -X POST http://localhost:3100/phases/register \
  -H "Content-Type: application/json" \
  -d '{
    "phaseId": "phase1",
    "webhookUrl": "http://localhost:3001/brain-notification"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Phase phase1 webhook registered",
  "phaseId": "phase1",
  "webhookUrl": "http://localhost:3001/brain-notification",
  "timestamp": 1702500000000
}
```

---

#### GET /phases/status

Get status of all registered phases.

**Request:**
```bash
curl http://localhost:3100/phases/status
```

**Response:**
```json
{
  "phases": {
    "phase1": {
      "registered": true,
      "webhookUrl": "http://localhost:3001/brain-notification",
      "lastSignal": 1702500000000,
      "signalCount": 150,
      "approvalRate": 0.85
    },
    "phase2": {
      "registered": true,
      "webhookUrl": "http://localhost:3002/brain-notification",
      "lastSignal": 1702499000000,
      "signalCount": 45,
      "approvalRate": 0.72
    },
    "phase3": {
      "registered": false,
      "webhookUrl": null,
      "lastSignal": null,
      "signalCount": 0,
      "approvalRate": 0
    }
  },
  "timestamp": 1702500000000
}
```

---

#### GET /phases/approval-rates

Get signal approval rates per phase.

**Request:**
```bash
curl http://localhost:3100/phases/approval-rates
```

**Response:**
```json
{
  "approvalRates": {
    "phase1": 0.85,
    "phase2": 0.72,
    "phase3": 0.90
  },
  "timestamp": 1702500000000
}
```

---

## Dashboard Data Format

### GET /dashboard

Get comprehensive dashboard data.

**Request:**
```bash
curl http://localhost:3100/dashboard
```

**Response:**
```json
{
  "nav": 1500.00,
  "allocation": {
    "w1": 0.8,
    "w2": 0.2,
    "w3": 0.0,
    "timestamp": 1702500000000
  },
  "phaseEquity": {
    "phase1": 1200.00,
    "phase2": 300.00,
    "phase3": 0.00
  },
  "riskMetrics": {
    "globalLeverage": 5.0,
    "netDelta": 500.00,
    "correlationScore": 0.3,
    "portfolioBeta": 0.85
  },
  "treasury": {
    "futuresWallet": 1500.00,
    "spotWallet": 200.00,
    "totalSwept": 200.00,
    "highWatermark": 1700.00,
    "lockedProfit": 200.00,
    "riskCapital": 1500.00
  },
  "circuitBreaker": {
    "active": false,
    "type": null,
    "reason": null,
    "triggeredAt": null,
    "dailyDrawdown": 0.05,
    "consecutiveLosses": 0,
    "equityLevel": 1500.00,
    "cooldownEndsAt": null
  },
  "recentDecisions": [
    {
      "signalId": "sig_abc123",
      "approved": true,
      "authorizedSize": 800,
      "reason": "Approved",
      "timestamp": 1702499900000
    }
  ],
  "lastUpdated": 1702500000000,
  "manualOverride": null,
  "warningBannerActive": false
}
```

### Dashboard Data Types

```typescript
interface DashboardData {
  /** Net Asset Value (total equity) */
  nav: number;
  
  /** Current allocation vector */
  allocation: AllocationVector;
  
  /** Equity allocated to each phase */
  phaseEquity: {
    phase1: number;
    phase2: number;
    phase3: number;
  };
  
  /** Current risk metrics */
  riskMetrics: {
    globalLeverage: number;
    netDelta: number;
    correlationScore: number;
    portfolioBeta: number;
  };
  
  /** Treasury status */
  treasury: TreasuryStatus;
  
  /** Circuit breaker status */
  circuitBreaker: BreakerStatus;
  
  /** Recent brain decisions */
  recentDecisions: BrainDecision[];
  
  /** Last update timestamp */
  lastUpdated: number;
  
  /** Manual override info (if active) */
  manualOverride: ManualOverride | null;
  
  /** Warning banner flag */
  warningBannerActive: boolean;
}

interface AllocationVector {
  w1: number;  // Phase 1 weight (0-1)
  w2: number;  // Phase 2 weight (0-1)
  w3: number;  // Phase 3 weight (0-1)
  timestamp: number;
}

interface TreasuryStatus {
  futuresWallet: number;
  spotWallet: number;
  totalSwept: number;
  highWatermark: number;
  lockedProfit: number;
  riskCapital: number;
}

interface BreakerStatus {
  active: boolean;
  type: 'HARD' | 'SOFT' | null;
  reason: string | null;
  triggeredAt: number | null;
  dailyDrawdown: number;
  consecutiveLosses: number;
  equityLevel: number;
  cooldownEndsAt: number | null;
}
```

---

### GET /dashboard/extended

Get extended dashboard data with additional metrics.

**Request:**
```bash
curl http://localhost:3100/dashboard/extended
```

**Response:** Same as `/dashboard` with additional fields:
- Performance metrics per phase
- Historical allocation data
- Sweep history
- Detailed risk snapshots

---

### GET /dashboard/export

Export dashboard data as a downloadable JSON file.

**Request:**
```bash
curl -O http://localhost:3100/dashboard/export
```

**Response Headers:**
```
Content-Type: application/json
Content-Disposition: attachment; filename="titan-brain-dashboard-1702500000000.json"
```

**Response Body:**
```json
{
  "version": "1.0.0",
  "exportedAt": "2024-12-14T10:30:00.000Z",
  "data": {
    "nav": 1500.00,
    "allocation": { ... },
    "phaseEquity": { ... },
    "riskMetrics": { ... },
    "treasury": { ... },
    "circuitBreaker": { ... },
    "recentDecisions": [ ... ]
  }
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid signature or credentials |
| 409 | Conflict - Duplicate signal ID |
| 500 | Internal Server Error |
| 503 | Service Unavailable - System unhealthy |

### Error Response Format

```json
{
  "error": "Human-readable error message",
  "timestamp": 1702500000000,
  "details": {
    "field": "Additional context"
  }
}
```

### Common Errors

**Invalid Signal Format:**
```json
{
  "error": "signalId is required and must be a string",
  "timestamp": 1702500000000
}
```

**Invalid Phase ID:**
```json
{
  "error": "phaseId must be one of: phase1, phase2, phase3",
  "timestamp": 1702500000000
}
```

**Invalid Side:**
```json
{
  "error": "side must be one of: BUY, SELL",
  "timestamp": 1702500000000
}
```

**Invalid Signature:**
```json
{
  "error": "Invalid signature",
  "timestamp": 1702500000000
}
```

**Duplicate Signal:**
```json
{
  "error": "Duplicate signal ID",
  "signalId": "sig_123",
  "timestamp": 1702500000000
}
```

---

## Rate Limiting

The Brain does not implement rate limiting by default. For production deployments, consider:

1. **Reverse Proxy Rate Limiting** (nginx, HAProxy)
2. **API Gateway** (Kong, AWS API Gateway)
3. **Application-Level** (custom middleware)

### Recommended Limits

| Endpoint | Recommended Limit |
|----------|-------------------|
| `/signal` | 100 req/min |
| `/webhook/*` | 100 req/min per phase |
| `/dashboard` | 60 req/min |
| `/admin/*` | 10 req/min |

---

## Examples

### Complete Signal Flow Example

```javascript
const axios = require('axios');
const crypto = require('crypto');

const BRAIN_URL = 'http://localhost:3100';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Generate unique signal ID
function generateSignalId(phase, symbol) {
  return `${phase}_${symbol}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Generate HMAC signature
function sign(body) {
  if (!WEBHOOK_SECRET) return null;
  return crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');
}

// Send signal to Brain
async function sendSignal(phase, symbol, direction, size, leverage) {
  const signal = {
    signal_id: generateSignalId(phase, symbol),
    symbol,
    direction,
    size,
    leverage,
    timestamp: Date.now()
  };

  const headers = {
    'Content-Type': 'application/json'
  };

  const signature = sign(signal);
  if (signature) {
    headers['x-signature'] = signature;
  }

  try {
    const response = await axios.post(
      `${BRAIN_URL}/webhook/${phase}`,
      signal,
      { headers }
    );

    const decision = response.data;

    if (decision.approved) {
      console.log(`✅ Signal approved: ${decision.authorizedSize} USD`);
      console.log(`   Reason: ${decision.reason}`);
      console.log(`   Processing time: ${decision.processingTime}ms`);
      return decision;
    } else {
      console.log(`❌ Signal vetoed: ${decision.reason}`);
      return null;
    }
  } catch (error) {
    if (error.response) {
      console.error(`Error: ${error.response.data.error}`);
    } else {
      console.error(`Network error: ${error.message}`);
    }
    return null;
  }
}

// Example usage
async function main() {
  // Check system status first
  const status = await axios.get(`${BRAIN_URL}/status`);
  console.log(`System status: ${status.data.status}`);
  console.log(`Current equity: $${status.data.equity}`);

  if (status.data.circuitBreaker === 'active') {
    console.log('⚠️ Circuit breaker is active - signals will be vetoed');
    return;
  }

  // Send a signal
  const decision = await sendSignal(
    'phase1',
    'BTCUSDT',
    'LONG',
    500,
    15
  );

  if (decision) {
    // Proceed with execution using authorized size
    console.log(`Executing trade with ${decision.authorizedSize} USD`);
  }
}

main();
```

### Dashboard Polling Example

```javascript
const axios = require('axios');

const BRAIN_URL = 'http://localhost:3100';
const POLL_INTERVAL = 5000; // 5 seconds

async function pollDashboard() {
  try {
    const response = await axios.get(`${BRAIN_URL}/dashboard`);
    const data = response.data;

    console.clear();
    console.log('=== TITAN BRAIN DASHBOARD ===');
    console.log(`NAV: $${data.nav.toFixed(2)}`);
    console.log(`Allocation: P1=${(data.allocation.w1 * 100).toFixed(0)}% P2=${(data.allocation.w2 * 100).toFixed(0)}% P3=${(data.allocation.w3 * 100).toFixed(0)}%`);
    console.log(`Leverage: ${data.riskMetrics.globalLeverage.toFixed(1)}x`);
    console.log(`Delta: $${data.riskMetrics.netDelta.toFixed(2)}`);
    console.log(`Circuit Breaker: ${data.circuitBreaker.active ? '🔴 ACTIVE' : '🟢 Inactive'}`);
    console.log(`High Watermark: $${data.treasury.highWatermark.toFixed(2)}`);
    console.log(`Total Swept: $${data.treasury.totalSwept.toFixed(2)}`);
    console.log(`Last Updated: ${new Date(data.lastUpdated).toISOString()}`);

  } catch (error) {
    console.error('Failed to fetch dashboard:', error.message);
  }
}

// Start polling
setInterval(pollDashboard, POLL_INTERVAL);
pollDashboard();
```

### Circuit Breaker Reset Example

```javascript
const axios = require('axios');

const BRAIN_URL = 'http://localhost:3100';

async function resetCircuitBreaker(operatorId) {
  try {
    // Check current status
    const status = await axios.get(`${BRAIN_URL}/breaker`);
    
    if (!status.data.active) {
      console.log('Circuit breaker is not active');
      return;
    }

    console.log(`Circuit breaker active: ${status.data.reason}`);
    console.log(`Triggered at: ${new Date(status.data.triggeredAt).toISOString()}`);

    // Reset the breaker
    const response = await axios.post(
      `${BRAIN_URL}/breaker/reset`,
      { operatorId },
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log(`✅ ${response.data.message}`);
    console.log(`   Operator: ${response.data.operatorId}`);

  } catch (error) {
    console.error('Failed to reset circuit breaker:', error.response?.data?.error || error.message);
  }
}

// Usage
resetCircuitBreaker('admin');
```

### Manual Override Example

```javascript
const axios = require('axios');

const BRAIN_URL = 'http://localhost:3100';

async function createOverride(operatorId, password, allocation, reason, durationHours) {
  try {
    const response = await axios.post(
      `${BRAIN_URL}/admin/override`,
      {
        operatorId,
        password,
        allocation,
        reason,
        durationHours
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log(`✅ ${response.data.message}`);
    console.log(`   New allocation: P1=${allocation.w1} P2=${allocation.w2} P3=${allocation.w3}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Duration: ${durationHours} hours`);

  } catch (error) {
    console.error('Failed to create override:', error.response?.data?.error || error.message);
  }
}

// Example: Shift allocation to Phase 2 for 24 hours
createOverride(
  'admin',
  'secure_password',
  { w1: 0.2, w2: 0.8, w3: 0.0 },
  'Market conditions favor swing trading',
  24
);
```

---

## Changelog

### v1.0.0 (December 2024)

- Initial release
- Core signal processing
- Phase webhooks
- Dashboard API
- Circuit breaker management
- Manual override support
