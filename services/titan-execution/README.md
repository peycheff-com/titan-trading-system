# Titan Execution Microservice

Webhook receiver with Shadow State, L2 validation, and Client-Side Triggering for the Titan Regime Engine.

## Overview

This microservice receives alerts from TradingView Pine Script indicators/strategies and executes trades with:

- **HMAC Authentication**: Secure webhook verification (Requirements 20.2, 20.4)
- **Idempotency**: Duplicate signal prevention via Redis (Requirements 21.1-21.4)
- **Shadow State**: Position tracking as Master of Truth (Requirements 31.1-31.6)
- **L2 Validation**: Order book analysis with WebSocket cache (Requirements 22.1-22.9)
- **Client-Side Triggering**: Local execution bypassing TradingView latency (Requirements 72.1-72.6)

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# - Set HMAC_SECRET for webhook authentication
# - Set REDIS_URL for idempotency storage
# - Set BROKER_API_KEY for order execution

# Start the server
npm start

# Or in development mode with auto-reload
npm run dev
```

## Configuration

See `.env.example` for all configuration options. Key settings:

| Variable | Description | Required |
|----------|-------------|----------|
| `HMAC_SECRET` | Secret for webhook signature verification | Yes |
| `REDIS_URL` | Redis connection for idempotency | Yes (prod) |
| `BROKER_API_KEY` | Broker API credentials | Yes |
| `WS_ORDERBOOK_URL` | Exchange WebSocket for L2 data | Yes |
| `DATABASE_URL` | Database connection string | Yes |
| `DATABASE_TYPE` | Database type: `postgres` or `sqlite` | Yes |

## Exchange Adapters

The microservice supports multiple cryptocurrency exchanges through a unified adapter interface. Each adapter implements the `BrokerAdapter` interface for order execution, position management, and account queries.

### Supported Exchanges

#### MEXC

**Features:**
- USDT Perpetual Futures
- Spot Trading
- Rate Limit: 15 req/sec (system uses 80% = 12 req/sec)
- Post-Only (Maker) orders supported
- Reduce-Only orders supported

**Configuration:**
```bash
BROKER_EXCHANGE=mexc
MEXC_API_KEY=your_api_key
MEXC_API_SECRET=your_api_secret
MEXC_TESTNET=false  # Set to true for testnet
```

**Usage:**
```javascript
import { MexcAdapter } from './adapters/MexcAdapter.js';

const adapter = new MexcAdapter({
  apiKey: process.env.MEXC_API_KEY,
  apiSecret: process.env.MEXC_API_SECRET,
  testnet: false,
  logger: console,
});

// Use with BrokerGateway
const brokerGateway = new BrokerGateway({
  adapter,
  logger: console,
});
```

#### Bybit

**Features:**
- USDT Perpetual Futures (Unified Trading Account)
- Inverse Perpetual
- Spot Trading
- Post-Only (Maker) orders supported
- Reduce-Only orders supported

**Configuration:**
```bash
BROKER_EXCHANGE=bybit
BYBIT_API_KEY=your_api_key
BYBIT_API_SECRET=your_api_secret
BYBIT_TESTNET=false  # Set to true for testnet
BYBIT_CATEGORY=linear  # linear (USDT), inverse, or spot
```

**Usage:**
```javascript
import { BybitAdapter } from './adapters/BybitAdapter.js';

const adapter = new BybitAdapter({
  apiKey: process.env.BYBIT_API_KEY,
  apiSecret: process.env.BYBIT_API_SECRET,
  testnet: false,
  category: 'linear', // USDT perpetual
  logger: console,
});

// Use with BrokerGateway
const brokerGateway = new BrokerGateway({
  adapter,
  logger: console,
});
```

### Adapter Interface

All adapters implement the following methods:

```javascript
/**
 * Send order to exchange
 * @param {Object} orderParams - Order parameters
 * @returns {Promise<Object>} Order result
 */
async sendOrder(orderParams)

/**
 * Get account information
 * @returns {Promise<Object>} Account info with balance
 */
async getAccount()

/**
 * Get current positions
 * @returns {Promise<Array>} Array of positions
 */
async getPositions()

/**
 * Close a specific position
 * @param {string} symbol - Trading symbol
 * @returns {Promise<Object>} Close result
 */
async closePosition(symbol)

/**
 * Close all positions (emergency flatten)
 * @returns {Promise<Object>} Close result
 */
async closeAllPositions()

/**
 * Cancel an order
 * @param {string} orderId - Order ID to cancel
 * @returns {Promise<Object>} Cancel result
 */
async cancelOrder(orderId)

/**
 * Test connection to exchange
 * @param {string} [apiKey] - API key to test
 * @param {string} [apiSecret] - API secret to test
 * @returns {Promise<Object>} Test result
 */
async testConnection(apiKey, apiSecret)
```

### Adding New Exchanges

To add support for a new exchange:

1. **Create Adapter File**: `adapters/YourExchangeAdapter.js`
2. **Implement Interface**: Implement all methods from `BrokerAdapter` interface
3. **Handle Authentication**: Implement exchange-specific signature generation
4. **Map Order Types**: Convert system order types to exchange-specific formats
5. **Export Adapter**: Add to `adapters/index.js`
6. **Test**: Create unit tests and integration tests

**Example Template:**
```javascript
export class YourExchangeAdapter {
  constructor(options) {
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.logger = options.logger || console;
  }

  async sendOrder(orderParams) {
    // Implement order execution
  }

  async getAccount() {
    // Implement account query
  }

  async getPositions() {
    // Implement position query
  }

  async closePosition(symbol) {
    // Implement position close
  }

  async closeAllPositions() {
    // Implement emergency flatten
  }

  async cancelOrder(orderId) {
    // Implement order cancellation
  }

  async testConnection(apiKey, apiSecret) {
    // Implement connection test
  }
}
```

### Rate Limiting

The `GlobalRateLimiter` component automatically manages API rate limits:

- **MEXC**: 12 req/sec (80% of 15 req/sec limit)
- **Bybit**: Configurable per endpoint
- **Token Bucket Algorithm**: Prevents ban from excessive requests
- **Automatic Fallback**: Switches to Market orders when limit approached

### Error Handling

All adapters implement consistent error handling:

- **Retryable Errors**: Timeout, connection reset, rate limit (exponential backoff)
- **Non-Retryable Errors**: Invalid parameters, insufficient balance, position not found
- **Logging**: All errors logged with context (symbol, order ID, error message)
- **Graceful Degradation**: Failed operations return error objects, don't throw

## Database Setup

The microservice uses SQL databases for permanent audit trail and crash recovery. Two database types are supported:

### PostgreSQL (Production)

**Connection String Format:**
```bash
DATABASE_URL=postgresql://username:password@host:port/database
DATABASE_TYPE=postgres
```

**Example:**
```bash
DATABASE_URL=postgresql://titan_user:secure_password@localhost:5432/titan_execution
DATABASE_TYPE=postgres
```

**Setup Steps:**

1. **Install PostgreSQL** (if not already installed):
   ```bash
   # macOS
   brew install postgresql
   brew services start postgresql
   
   # Ubuntu/Debian
   sudo apt-get install postgresql postgresql-contrib
   sudo systemctl start postgresql
   ```

2. **Create Database and User:**
   ```bash
   # Connect to PostgreSQL
   psql postgres
   
   # Create user
   CREATE USER titan_user WITH PASSWORD 'secure_password';
   
   # Create database
   CREATE DATABASE titan_execution OWNER titan_user;
   
   # Grant privileges
   GRANT ALL PRIVILEGES ON DATABASE titan_execution TO titan_user;
   
   # Exit
   \q
   ```

3. **Run Migrations:**
   ```bash
   npm run migrate:latest
   ```

### SQLite (Development)

**Connection String Format:**
```bash
DATABASE_URL=./titan_execution.db
DATABASE_TYPE=sqlite
```

**Example:**
```bash
DATABASE_URL=./data/titan_execution.db
DATABASE_TYPE=sqlite
```

**Setup Steps:**

1. **No Installation Required** - SQLite is embedded

2. **Create Directory** (if using custom path):
   ```bash
   mkdir -p data
   ```

3. **Run Migrations:**
   ```bash
   npm run migrate:latest
   ```

### Database Schema

The database stores:

- **trades** - Complete trade execution log with slippage, latency, regime state
- **positions** - Current and historical position state with PnL tracking
- **regime_snapshots** - Periodic regime state snapshots (every 5 minutes)
- **system_events** - Critical system events (emergency flatten, mismatches, etc.)

### Migration Commands

```bash
# Run all pending migrations
npm run migrate:latest

# Rollback last migration
npm run migrate:rollback

# Check migration status
npm run migrate:status

# Create new migration
npm run migrate:make <migration_name>
```

### Crash Recovery

On startup, the microservice:
1. Queries `positions` table for active positions
2. Restores Shadow State from database
3. Reconciles with broker to confirm positions still exist
4. Enables seamless recovery from crashes mid-trade

## API Endpoints

### Webhook Endpoints

#### `POST /webhook`

Receives TradingView alerts.

**Headers:**
- `x-signature`: HMAC-SHA256 signature of body
- `x-source`: Must be `titan_dashboard`

**Body:**
```json
{
  "signal_id": "titan_BTCUSDT_12345_15",
  "type": "PREPARE|CONFIRM|ABORT",
  "symbol": "BTCUSDT",
  "direction": 1,
  "entry_zone": [50100, 50050, 50000],
  "stop_loss": 49500,
  "take_profits": [50500, 51000, 52000],
  "regime_vector": { ... }
}
```

### Health & Status Endpoints

#### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-05T10:30:00Z",
  "database": "connected",
  "redis": "connected"
}
```

### Trade History Endpoints

#### `GET /api/trades`

Retrieve trade execution history with filtering and pagination.

**Query Parameters:**
- `start_date` (optional) - ISO 8601 date string (e.g., `2025-01-01`)
- `end_date` (optional) - ISO 8601 date string (e.g., `2025-12-31`)
- `symbol` (optional) - Filter by trading symbol (e.g., `BTCUSDT`)
- `phase` (optional) - Filter by phase (1 or 2)
- `regime_state` (optional) - Filter by regime state (-1, 0, 1)
- `limit` (optional) - Number of records per page (default: 100, max: 1000)
- `offset` (optional) - Pagination offset (default: 0)

**Example Request:**
```bash
GET /api/trades?start_date=2025-12-01&end_date=2025-12-05&symbol=BTCUSDT&limit=50
```

**Response:**
```json
{
  "trades": [
    {
      "trade_id": 1,
      "signal_id": "titan_BTCUSDT_12345_15",
      "symbol": "BTCUSDT",
      "side": "LONG",
      "size": 0.5,
      "entry_price": 50100.00,
      "stop_price": 49500.00,
      "tp_price": 50500.00,
      "fill_price": 50102.50,
      "slippage_pct": 0.005,
      "execution_latency_ms": 45,
      "regime_state": 1,
      "phase": 1,
      "timestamp": "2025-12-05T10:30:00Z"
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

#### `GET /api/positions/active`

Retrieve currently open positions.

**Response:**
```json
{
  "positions": [
    {
      "position_id": 1,
      "symbol": "BTCUSDT",
      "side": "LONG",
      "size": 0.5,
      "avg_entry": 50100.00,
      "current_stop": 49500.00,
      "current_tp": 50500.00,
      "unrealized_pnl": 125.50,
      "regime_at_entry": 1,
      "phase_at_entry": 1,
      "opened_at": "2025-12-05T10:30:00Z",
      "updated_at": "2025-12-05T10:35:00Z"
    }
  ],
  "total_unrealized_pnl": 125.50
}
```

#### `GET /api/positions/history`

Retrieve historical closed positions with pagination.

**Query Parameters:**
- `start_date` (optional) - ISO 8601 date string
- `end_date` (optional) - ISO 8601 date string
- `symbol` (optional) - Filter by trading symbol
- `limit` (optional) - Number of records per page (default: 100, max: 1000)
- `offset` (optional) - Pagination offset (default: 0)

**Example Request:**
```bash
GET /api/positions/history?start_date=2025-12-01&symbol=BTCUSDT&limit=20
```

**Response:**
```json
{
  "positions": [
    {
      "position_id": 1,
      "symbol": "BTCUSDT",
      "side": "LONG",
      "size": 0.5,
      "avg_entry": 50100.00,
      "opened_at": "2025-12-05T10:30:00Z",
      "closed_at": "2025-12-05T11:45:00Z",
      "close_price": 50550.00,
      "realized_pnl": 225.00,
      "close_reason": "take_profit",
      "regime_at_entry": 1,
      "phase_at_entry": 1
    }
  ],
  "total": 45,
  "limit": 20,
  "offset": 0
}
```

#### `GET /api/performance/summary`

Retrieve aggregate performance metrics.

**Query Parameters:**
- `start_date` (optional) - ISO 8601 date string
- `end_date` (optional) - ISO 8601 date string
- `symbol` (optional) - Filter by trading symbol

**Example Request:**
```bash
GET /api/performance/summary?start_date=2025-12-01&end_date=2025-12-05
```

**Response:**
```json
{
  "period": {
    "start_date": "2025-12-01",
    "end_date": "2025-12-05"
  },
  "metrics": {
    "total_trades": 150,
    "winning_trades": 95,
    "losing_trades": 55,
    "win_rate": 0.633,
    "total_pnl": 12500.50,
    "avg_win": 185.25,
    "avg_loss": -95.50,
    "payoff_ratio": 1.94,
    "sharpe_ratio": 2.15,
    "max_drawdown": -850.00,
    "max_drawdown_pct": 0.034,
    "avg_execution_latency_ms": 42
  },
  "by_regime": {
    "risk_on": {
      "trades": 100,
      "win_rate": 0.68,
      "total_pnl": 10200.00
    },
    "neutral": {
      "trades": 30,
      "win_rate": 0.50,
      "total_pnl": 1500.50
    },
    "risk_off": {
      "trades": 20,
      "win_rate": 0.40,
      "total_pnl": 800.00
    }
  }
}
```

#### `GET /api/regime/snapshots`

Retrieve regime state snapshots for analysis.

**Query Parameters:**
- `start_date` (optional) - ISO 8601 date string
- `end_date` (optional) - ISO 8601 date string
- `symbol` (optional) - Filter by trading symbol
- `limit` (optional) - Number of records per page (default: 100, max: 1000)
- `offset` (optional) - Pagination offset (default: 0)

**Example Request:**
```bash
GET /api/regime/snapshots?start_date=2025-12-05&symbol=BTCUSDT&limit=50
```

**Response:**
```json
{
  "snapshots": [
    {
      "snapshot_id": 1,
      "timestamp": "2025-12-05T10:30:00Z",
      "symbol": "BTCUSDT",
      "regime_state": 1,
      "trend_state": 1,
      "vol_state": 1,
      "market_structure_score": 85.5,
      "model_recommendation": "TREND_FOLLOW"
    }
  ],
  "total": 288,
  "limit": 50,
  "offset": 0
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Titan Execution Microservice                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Fastify   │    │ Shadow State│    │ L2 Validator│         │
│  │   Server    │───▶│   Tracker   │───▶│ (WebSocket) │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                  │                  │                 │
│         ▼                  ▼                  ▼                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   HMAC      │    │Reconciliation│   │ Limit Chaser│         │
│  │ Middleware  │    │    Loop     │    │  Algorithm  │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                            │                  │                 │
│                            ▼                  ▼                 │
│                     ┌─────────────┐    ┌─────────────┐         │
│                     │  Heartbeat  │    │   Broker    │         │
│                     │ Dead Man SW │    │   Gateway   │         │
│                     └─────────────┘    └─────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

## Components (To Be Implemented)

- **ShadowState.js** - Position state tracker (Task 41)
- **Reconciliation.js** - Broker state sync (Task 42)
- **Heartbeat.js** - Dead man's switch (Task 43)
- **ZScoreDrift.js** - Performance drift detection (Task 44)
- **WebSocketCache.js** - L2 order book cache (Task 46)
- **L2Validator.js** - Order book validation (Task 46.2)
- **BrokerGateway.js** - Order execution (Task 47)
- **ReplayGuard.js** - Replay attack prevention (Task 48.1)

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Security

- All webhooks require HMAC-SHA256 signature verification
- Timing-safe comparison prevents timing attacks
- Replay guard prevents duplicate signal attacks
- Redis TTL ensures idempotency keys expire

## License

MIT
