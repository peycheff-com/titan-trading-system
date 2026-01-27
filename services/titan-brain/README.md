# Titan Brain - Phase 5 Orchestrator

The Brain is the master control system that orchestrates capital allocation, risk management, and strategy coordination across all Titan phases. It transforms Titan from a set of disjointed trading strategies into a coherent quantitative fund.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Signal Processing](#signal-processing)
- [Components](#components)
- [Integration](#integration)
- [Monitoring](#monitoring)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Titan Brain implements a hierarchical decision-making architecture where phases generate **Intent Signals**, and the Brain grants or denies **Permission** based on:

- **Portfolio-level risk metrics** - Leverage, correlation, delta exposure
- **PowerLaw Lab Metrics** - Tail risk (Hill Alpha) and Volatility Clustering
- **Performance data** - Rolling Sharpe ratios with malus/bonus modifiers
- **Equity tier rules** - Dynamic allocation based on account size
- **Correlation guards** - Prevent concentrated risk across phases
- **Circuit breakers** - Emergency halt on extreme conditions

### Core Directive

**Maximize Geometric Growth** (compounding) while ensuring **Ruin Probability < 0.1%**

### Key Features

| Feature | Description |
|---------|-------------|
| Dynamic Allocation | Sigmoid transitions between phases based on equity |
| Performance Throttling | Sharpe-based weight adjustments (0.5x malus to 1.2x bonus) |
| Correlation Guard | Veto or reduce correlated positions |
| Profit Sweeper | Automatic profit locking to spot wallet |
| Circuit Breaker | Emergency halt on drawdown or consecutive losses |
| Manual Steerability | Operator control via `/trade/manual` and emergency stop |
| Dynamic Risk Config | Runtime adjustment of risk parameters via `/risk/config` |
| Prometheus Metrics | Native observability via `/metrics` endpoint |
| Signal Queue | Priority-based processing with idempotency |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TITAN BRAIN                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Allocation Engine (Sigmoid Transitions)        │ │
│  │  - Equity tier classification (MICRO → INSTITUTIONAL)  │ │
│  │  - Dynamic phase weight calculation                    │ │
│  │  - Leverage cap enforcement                            │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │      PowerLaw Integration (Regime Adaptation)          │ │
│  │  - Real-time Tail Risk (Hill Alpha) monitoring         │ │
│  │  - Volatility Clustering (Expanding/Stable)            │ │
│  │  - Dynamic Leverage Scaling based on Alpha             │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │      Performance Tracker (Rolling Sharpe Ratios)       │ │
│  │  - 7-day rolling Sharpe calculation                    │ │
│  │  - Malus penalty (Sharpe < 0) / Bonus (Sharpe > 2.0)   │ │
│  │  - Per-phase PnL tracking                              │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Risk Guardian (Correlation & Leverage)         │ │
│  │  - Portfolio beta calculation                          │ │
│  │  - Combined leverage monitoring                        │ │
│  │  - Correlation matrix (5-min updates)                  │ │
│  │  - Extreme Tail Risk Gating (Alpha < 2.0 veto)         │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          Capital Flow Manager (Profit Sweeper)         │ │
│  │  - High watermark tracking                             │ │
│  │  - 20% excess triggers sweep                           │ │
│  │  - $200 reserve limit protection                       │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           Circuit Breaker (Emergency Halt)             │ │
│  │  - 15% daily drawdown → HARD trigger                   │ │
│  │  - Equity < $150 → HARD trigger                        │ │
│  │  - 3 consecutive losses → SOFT pause (30 min)          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
           ▲                                    │
           │ Intent Signals                     │ Authorized Signals
           │                                    ▼
┌──────────┴──────────┐              ┌─────────────────────┐
│  Phase 1: Scavenger │              │  Execution Engine   │
│  Phase 2: Hunter    │              │  (Order Placement)  │
│  Phase 3: Sentinel  │              └─────────────────────┘
│  Manual: Override   │
└─────────────────────┘
```

### Signal Flow

```
1. Phase generates Intent Signal
   ↓
2. Brain receives signal via webhook
   ↓
3. Idempotency check (duplicate detection)
   ↓
4. Allocation Engine determines phase weight
   ↓
5. Performance Tracker applies modifiers
   ↓
6. Risk Guardian checks correlation & leverage
   ↓
7. Circuit Breaker validates system state
   ↓
8. Brain calculates authorized position size
   ↓
9. Signal forwarded to Execution Engine (or vetoed)
   ↓
10. Decision logged to database
```

---

## Quick Start

### Full System (Recommended)

For running the complete Titan system (Brain, Execution, Console, DB), use the root Docker Compose:

```bash
cd ../..
docker compose -f docker-compose.dev.yml up -d
```

### Local Development (Service Only)

To run **Titan Brain** in isolation (e.g. for debugging logic):

```bash
# 1. Install dependencies
npm install

# 2. Start Support Services (DB/Redis) via Docker
docker compose up -d postgres redis

# 3. Configure
cp .env.example .env

# 4. Run Migrations
npm run migrate

# 5. Start in Dev Mode
npm run dev
```

The Brain will start on port **3100**.


---

## Installation

### Prerequisites

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 18.x | 20.x |
| PostgreSQL | 14+ | 15+ |
| Redis | 7+ | 7+ (optional) |
| RAM | 512 MB | 2 GB |

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Database Setup

```bash
# Run migrations
npm run migrate
```

Or manually apply the schema:

```bash
psql -h localhost -U postgres -d titan_brain -f src/db/schema.sql
```

---

## Configuration

The Brain uses a Zod-validated configuration system that supports defaults, environment variables, and external JSON files.

### Configuration Loading

Configuration is loaded in the following order:

1.  **Defaults**: Hardcoded safe defaults (valid for development).
2.  **Environment Variables**: `TITAN_*` and standard env vars override defaults.
3.  **JSON Config**: `CONFIG_FILE=path/to/config.json` overrides everything.

The configuration is strictly validated against a Schema on startup.

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

#### Essential Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `INITIAL_EQUITY` | Starting capital (USD) | `200` |
| `LOG_LEVEL` | Logging level | `info` |
| `SERVER_PORT` | Webhook server port | `3100` |
| `MAX_STARTUP_TIME` | Milliseconds to wait for dependencies | `300000` (5 min) |

#### Database Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `titan_brain` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | `postgres` |

#### Allocation Engine

| Variable | Description | Default |
|----------|-------------|---------|
| `ALLOCATION_START_P2` | Equity where Phase 2 starts | `1500` |
| `ALLOCATION_FULL_P2` | Equity where Phase 2 is fully allocated | `5000` |
| `ALLOCATION_START_P3` | Equity where Phase 3 starts | `25000` |
| `LEVERAGE_CAP_MICRO` | Max leverage for <$1,500 | `20` |
| `LEVERAGE_CAP_SMALL` | Max leverage for $1,500-$5,000 | `10` |
| `LEVERAGE_CAP_MEDIUM` | Max leverage for $5,000-$25,000 | `5` |

#### Circuit Breaker

| Variable | Description | Default |
|----------|-------------|---------|
| `BREAKER_MAX_DAILY_DRAWDOWN` | Max daily drawdown (0-1) | `0.15` |
| `BREAKER_MIN_EQUITY` | Min equity before trigger | `150` |
| `BREAKER_CONSECUTIVE_LOSS_LIMIT` | Losses before soft pause | `3` |
| `BREAKER_COOLDOWN_MINUTES` | Cooldown after soft pause | `30` |

See `.env.example` for the complete list of configuration options.

### JSON Configuration File

For complex configurations, use a JSON file:

```bash
cp config.example.json config.json
CONFIG_FILE=./config.json npm start
```

See `config.example.json` for a complete example with all options.

---

## API Reference

### Base URL

```
http://localhost:3100
```

### Authentication

HMAC signature verification can be enabled for webhook security:

```bash
WEBHOOK_SECRET=your_secret_here
```

When enabled, include the signature in the `x-signature` header:

```javascript
const crypto = require('crypto');
const signature = crypto
  .createHmac('sha256', 'your_secret_here')
  .update(JSON.stringify(body))
  .digest('hex');
```

---

### Core Endpoints

#### GET /status

Health check and system status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1702500000000,
  "components": {
    "database": true,
    "redis": true,
    "executionEngine": true,
    "phases": {
      "phase1": true,
      "phase2": true,
      "phase3": false
    }
  },
  "errors": [],
  "equity": 1500.00,
  "circuitBreaker": "inactive"
}
```

---

#### POST /signal

Submit an intent signal for processing.

**Request Body:**
```json
{
  "signalId": "sig_abc123",
  "phaseId": "phase1",
  "symbol": "BTCUSDT",
  "side": "BUY",
  "requestedSize": 1000,
  "timestamp": 1702500000000,
  "leverage": 10
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signalId` | string | Yes | Unique signal identifier |
| `phaseId` | string | Yes | `phase1`, `phase2`, or `phase3` |
| `symbol` | string | Yes | Trading pair (e.g., `BTCUSDT`) |
| `side` | string | Yes | `BUY` or `SELL` |
| `requestedSize` | number | Yes | Position size in USD notional |
| `timestamp` | number | No | Unix timestamp (ms) |
| `leverage` | number | No | Requested leverage |

**Response (Approved):**
```json
{
  "signalId": "sig_abc123",
  "approved": true,
  "authorizedSize": 800,
  "reason": "Approved with size reduction due to phase weight",
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
  "timestamp": 1702500000000,
  "processingTime": 45
}
```

**Response (Vetoed):**
```json
{
  "signalId": "sig_abc123",
  "approved": false,
  "authorizedSize": 0,
  "reason": "Circuit breaker active",
  "timestamp": 1702500000000,
  "processingTime": 12
}
```

---

#### GET /dashboard

Get dashboard data for UI display.

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
    "dailyDrawdown": 0.05,
    "consecutiveLosses": 0,
    "equityLevel": 1500.00
  },
  "recentDecisions": [],
  "lastUpdated": 1702500000000
}
```

---

#### GET /dashboard/export

Export dashboard data as a downloadable JSON file.

**Response:** JSON file download with timestamp and version metadata.

---

#### GET /allocation

Get current allocation vector.

**Response:**
```json
{
  "allocation": {
    "w1": 0.8,
    "w2": 0.2,
    "w3": 0.0,
    "timestamp": 1702500000000
  },
  "equity": 1500.00,
  "phaseEquity": {
    "phase1": 1200.00,
    "phase2": 300.00,
    "phase3": 0.00
  },
  "timestamp": 1702500000000
}
```

---

#### GET /treasury

Get treasury status including sweep information.

**Response:**
```json
{
  "futuresWallet": 1500.00,
  "spotWallet": 200.00,
  "totalSwept": 200.00,
  "highWatermark": 1700.00,
  "lockedProfit": 200.00,
  "riskCapital": 1500.00,
  "nextSweepTriggerLevel": 1800.00,
  "timestamp": 1702500000000
}
```

---

#### GET /breaker

Get circuit breaker status.

**Response:**
```json
{
  "active": false,
  "type": null,
  "reason": null,
  "triggeredAt": null,
  "dailyDrawdown": 0.05,
  "consecutiveLosses": 0,
  "equityLevel": 1500.00,
  "cooldownEndsAt": null
}
```

---

#### POST /breaker/reset

Reset the circuit breaker (requires operator authentication).

**Request Body:**
```json
{
  "operatorId": "admin"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Circuit breaker reset",
  "operatorId": "admin",
  "timestamp": 1702500000000
}
```

---

#### GET /decisions

Get recent brain decisions.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 20 | Max decisions to return (max 100) |

**Response:**
```json
{
  "decisions": [
    {
      "signalId": "sig_abc123",
      "approved": true,
      "authorizedSize": 800,
      "reason": "Approved",
      "timestamp": 1702500000000
    }
  ],
  "count": 1,
  "timestamp": 1702500000000
}
```

---

### Phase Integration Endpoints

#### POST /webhook/phase1, /webhook/phase2, /webhook/phase3

Phase-specific signal endpoints (aliases: `/webhook/scavenger`, `/webhook/hunter`, `/webhook/sentinel`).

**Request Body:**
```json
{
  "signal_id": "sig_abc123",
  "symbol": "BTCUSDT",
  "direction": "LONG",
  "size": 1000,
  "timestamp": 1702500000000,
  "leverage": 10
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signal_id` | string | Yes | Unique signal identifier |
| `symbol` | string | Yes | Trading pair |
| `direction` | string | Yes | `LONG` or `SHORT` |
| `size` | number | No | Position size in USD |
| `timestamp` | number | No | Unix timestamp (ms) |
| `leverage` | number | No | Requested leverage |

---

#### POST /phases/register

Register a phase webhook URL for notifications.

**Request Body:**
```json
{
  "phaseId": "phase1",
  "webhookUrl": "http://localhost:3001/brain-notification"
}
```

---

#### GET /phases/status

Get status of all registered phases.

---

#### GET /phases/approval-rates

Get signal approval rates per phase.

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

### Admin Endpoints

#### POST /admin/override

Create a manual allocation override.

**Request Body:**
```json
{
  "operatorId": "admin",
  "password": "secure_password",
  "allocation": {
    "w1": 0.5,
    "w2": 0.5,
    "w3": 0.0
  },
  "reason": "Manual rebalancing for market conditions",
  "durationHours": 24
}
```

**Response:**
```json
{
  "success": true,
  "message": "Manual override created successfully",
  "allocation": {
    "w1": 0.5,
    "w2": 0.5,
    "w3": 0.0,
    "timestamp": 1702500000000
  },
  "operatorId": "admin",
  "reason": "Manual rebalancing for market conditions",
  "timestamp": 1702500000000
}
```

---

#### DELETE /admin/override

Deactivate the current manual override.

**Request Body:**
```json
{
  "operatorId": "admin",
  "password": "secure_password"
}
```

---

#### GET /admin/override

Get current manual override status.

**Response:**
```json
{
  "override": {
    "active": true,
    "operatorId": "admin",
    "reason": "Manual rebalancing",
    "allocation": {
      "w1": 0.5,
      "w2": 0.5,
      "w3": 0.0
    },
    "expiresAt": 1702586400000
  },
  "warningBannerActive": true,
  "timestamp": 1702500000000
}
```

---

#### GET /admin/override/history

Get manual override history.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `operatorId` | string | - | Filter by operator |
| `limit` | number | 50 | Max records to return |

---

#### POST /trade/manual

Execute a manual trade.

**Request Body:**
```json
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "size": 500,
  "leverage": 5,
  "exchange": "bybit"
}
```

---

#### DELETE /trade/cancel-all

Emergency position flattening.

---

#### PATCH /risk/config

Runtime risk configuration update.

**Request Body:**
```json
{
  "maxDrawdown": 0.15,
  "leverageCaps": { "MICRO": 20 }
}
```

---


## Signal Processing

### Intent Signal Format

Phases send intent signals to the Brain requesting permission to execute trades:

```typescript
interface IntentSignal {
  signalId: string;      // Unique identifier (for idempotency)
  phaseId: PhaseId;      // 'phase1' | 'phase2' | 'phase3'
  symbol: string;        // Trading pair (e.g., 'BTCUSDT')
  side: 'BUY' | 'SELL';  // Trade direction
  requestedSize: number; // Position size in USD notional
  timestamp: number;     // Unix timestamp (ms)
  leverage?: number;     // Optional: requested leverage
}
```

### Decision Response Format

The Brain responds with a decision:

```typescript
interface BrainDecision {
  signalId: string;
  approved: boolean;
  authorizedSize: number;  // May be less than requested
  reason: string;          // Human-readable explanation
  allocation: AllocationVector;
  performance: PhasePerformance;
  risk: RiskDecision;
  timestamp: number;
}
```

### Processing Pipeline

1. **Idempotency Check** - Duplicate signals are rejected (HTTP 409)
2. **Validation** - Signal format and required fields
3. **Circuit Breaker Check** - Reject if breaker is active
4. **Allocation Calculation** - Determine phase weight based on equity
5. **Performance Modifier** - Apply Sharpe-based adjustments
6. **Risk Validation** - Check leverage and correlation limits
7. **Size Authorization** - Calculate final authorized size
8. **Decision Logging** - Persist to database

### Veto Reasons

| Reason | Description |
|--------|-------------|
| `Circuit breaker active` | System is in emergency halt |
| `Leverage cap exceeded` | Would exceed tier leverage limit |
| `TAIL_RISK_VETO` | Extreme tail risk (Alpha < 2.0) detected |
| `REGIME_VETO` | Volatility regime (Expanding) unsafe for strategy |
| `High correlation` | Position too correlated with existing |
| `Phase weight zero` | Phase has no allocation at current equity |
| `Insufficient equity` | Not enough capital for position |

---

## Components

### AllocationEngine

Calculates base allocation weights using sigmoid transition functions.

**Equity Tiers:**

| Tier | Equity Range | Phase 1 | Phase 2 | Phase 3 | Max Leverage |
|------|--------------|---------|---------|---------|--------------|
| MICRO | < $1,500 | 100% | 0% | 0% | 20x |
| SMALL | $1,500 - $5,000 | 80% → 20% | 20% → 80% | 0% | 10x |
| MEDIUM | $5,000 - $25,000 | 20% | 80% | 0% | 5x |
| LARGE | $25,000 - $50,000 | 20% | 60% → 40% | 20% → 40% | 3x |
| INSTITUTIONAL | > $50,000 | 10% | 40% | 50% | 2x |

### PerformanceTracker

Tracks PnL and calculates rolling Sharpe Ratios for performance-based throttling.

**Modifiers:**

| Sharpe Ratio | Modifier | Effect |
|--------------|----------|--------|
| < 0 | 0.5x | Malus penalty (halve allocation) |
| 0 - 2.0 | 1.0x | No adjustment |
| > 2.0 | 1.2x | Bonus multiplier |

**Requirements:**
- Minimum 10 trades before modifiers apply
- 7-day rolling window for Sharpe calculation
- Recalculated every 24 hours

### RiskGuardian

Monitors portfolio-level risk metrics and enforces limits.

**Checks:**
- Combined leverage vs tier cap
- Correlation between positions (> 0.8 triggers 50% size reduction)
- Portfolio delta (net directional exposure)
- Portfolio beta (correlation to BTC)

**Special Rules:**
- Phase 3 hedge positions that reduce delta are auto-approved
- High correlation same-direction positions are flagged

### CapitalFlowManager

Manages profit sweeping from futures to spot wallet.

**Sweep Logic:**
- Trigger: Futures balance exceeds target by 20%
- Reserve: $200 minimum always maintained
- Schedule: Daily at 00:00 UTC or after 10%+ equity increase
- Retry: Up to 3 attempts with exponential backoff

### CircuitBreaker

Emergency halt system with two trigger types.

**HARD Trigger (immediate halt + close all):**
- Daily drawdown > 15%
- Equity < $150

**SOFT Trigger (30-minute cooldown):**
- 3 consecutive losses within 1 hour

**Reset:**
- Requires operator authentication
- Logged with operator ID

---

## Integration

### Execution Engine

Configure the Execution Engine URL for signal forwarding:

```bash
EXECUTION_ENGINE_URL=http://localhost:3000
```

The Brain forwards approved signals with HMAC authentication.

### Phase Services

Configure phase webhook URLs for notifications:

```bash
PHASE1_WEBHOOK_URL=http://localhost:3001
PHASE2_WEBHOOK_URL=http://localhost:3002
PHASE3_WEBHOOK_URL=http://localhost:3003
```

Phases receive notifications for:
- Signal vetoes with reasons
- Allocation changes
- Circuit breaker events

### Example: Sending a Signal from Phase 1

```javascript
const axios = require('axios');
const crypto = require('crypto');

const signal = {
  signal_id: `sig_${Date.now()}`,
  symbol: 'BTCUSDT',
  direction: 'LONG',
  size: 500,
  leverage: 15
};

// Optional: HMAC signature
const signature = crypto
  .createHmac('sha256', process.env.WEBHOOK_SECRET)
  .update(JSON.stringify(signal))
  .digest('hex');

const response = await axios.post(
  'http://localhost:3100/webhook/phase1',
  signal,
  {
    headers: {
      'Content-Type': 'application/json',
      'x-signature': signature
    }
  }
);

if (response.data.approved) {
  console.log(`Approved: ${response.data.authorizedSize} USD`);
} else {
  console.log(`Vetoed: ${response.data.reason}`);
}
```

---

## Monitoring

### Prometheus Metrics

Available at `/metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `titan_brain_signals_total` | Counter | Total signals processed |
| `titan_brain_signals_approved` | Counter | Approved signals |
| `titan_brain_signals_vetoed` | Counter | Vetoed signals |
| `titan_brain_signal_latency_ms` | Histogram | Processing latency |
| `titan_brain_equity_usd` | Gauge | Current equity |
| `titan_brain_allocation_w1` | Gauge | Phase 1 weight |
| `titan_brain_allocation_w2` | Gauge | Phase 2 weight |
| `titan_brain_allocation_w3` | Gauge | Phase 3 weight |
| `titan_brain_circuit_breaker_active` | Gauge | Breaker status |

### Structured Logging

Logs are output in JSON format:

```json
{
  "level": "info",
  "timestamp": "2024-12-14T10:30:00.000Z",
  "component": "RiskGuardian",
  "message": "Signal approved with size reduction",
  "signalId": "sig_abc123",
  "originalSize": 1000,
  "authorizedSize": 800,
  "reason": "High correlation penalty"
}
```

### Health Checks

The `/status` endpoint returns component health:

```bash
curl http://localhost:3100/status | jq '.components'
```

---

## Development

### Build

```bash
npm run build
```

### Run Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Lint

```bash
npm run lint
npm run lint:fix
```

### Development Mode

```bash
npm run dev
```

### Project Structure

```
services/titan-brain/
├── src/
│   ├── cache/           # Caching layer
│   ├── config/          # Configuration loader
│   ├── db/              # Database layer
│   │   ├── migrations/  # Schema migrations
│   │   └── repositories/ # Data access
│   ├── engine/          # Core components
│   │   ├── AllocationEngine.ts
│   │   ├── PerformanceTracker.ts
│   │   ├── RiskGuardian.ts
│   │   ├── CapitalFlowManager.ts
│   │   ├── CircuitBreaker.ts
│   │   └── TitanBrain.ts
│   ├── monitoring/      # Metrics & logging
│   ├── server/          # HTTP server
│   └── types/           # TypeScript types
├── tests/
│   ├── unit/            # Unit tests
│   └── property/        # Property-based tests
├── config.example.json
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs titan-brain

# Common issues:
# 1. Database not ready - wait for postgres healthcheck
# 2. Port already in use - change SERVER_PORT
# 3. Missing environment variables - check .env file
```

### Database Connection Failed

```bash
# Test connection
docker-compose exec titan-brain sh -c 'nc -zv postgres 5432'

# Check PostgreSQL logs
docker-compose logs postgres
```

### Signal Processing Slow

```bash
# Check metrics
curl http://localhost:3100/metrics | grep latency

# Target: < 100ms processing time
```

### Circuit Breaker Triggered

```bash
# Check status
curl http://localhost:3100/breaker | jq

# View trigger history
curl http://localhost:3100/decisions?limit=10 | jq

# Manual reset (requires operator)
curl -X POST http://localhost:3100/breaker/reset \
  -H "Content-Type: application/json" \
  -d '{"operatorId": "admin"}'
```

### High Memory Usage

```bash
# Check container stats
docker stats titan-brain

# Review cache settings in config
```

---

## License

ISC

---

## Related Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Detailed deployment guide
- [config.example.json](./config.example.json) - Full configuration reference
- [.env.example](./.env.example) - Environment variable reference
