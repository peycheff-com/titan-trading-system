# Database Migrations

This directory contains Knex migration files for the Titan Execution Microservice database schema.

## Requirements

Implements Requirements 97.1-97.2:
- Auto-create database schema on first run
- Support both PostgreSQL (production) and SQLite (development)
- Provide migration rollback capability

## Migration Files

### 001_initial_schema.sql
Raw SQL version of the initial schema (for reference).

### 002_add_indexes.sql
Raw SQL version of index creation (for reference).

### 20250101000001_initial_schema.js
Knex migration that creates the initial database schema:
- `trades` table: Audit trail for all trade executions
- `positions` table: Track open and closed positions
- `regime_snapshots` table: Periodic regime state snapshots
- `system_events` table: Critical system events and alerts

### 20250101000002_add_indexes.js
Knex migration that adds performance indexes:
- `trades.timestamp`, `trades.symbol`, `trades.signal_id`
- `positions.symbol`, `positions.opened_at`
- `regime_snapshots.timestamp`
- `system_events.timestamp`, `system_events.event_type`

## Usage

### Run Migrations

```bash
# Run all pending migrations
npm run migrate

# Check migration status
npm run migrate:status

# Rollback last migration batch
npm run migrate:rollback
```

### Create New Migration

```bash
# Create a new migration file
npm run migrate:make migration_name
```

This will create a new timestamped migration file in the `migrations/` directory.

## Migration Workflow

1. **Development**: Migrations run automatically when `DatabaseManager.initDatabase()` is called
2. **Production**: Run `npm run migrate` before starting the server
3. **Testing**: Migrations run automatically in test environment (in-memory SQLite)

## Database Schema

### trades
- `trade_id` (PK): Auto-incrementing trade identifier
- `signal_id`: Unique signal identifier from Pine Script
- `symbol`: Trading pair (e.g., BTCUSDT)
- `side`: BUY or SELL
- `size`: Position size in units
- `entry_price`: Intended entry price
- `stop_price`: Stop loss price
- `tp_price`: Take profit price
- `fill_price`: Actual fill price
- `slippage_pct`: Slippage percentage
- `execution_latency_ms`: Time from signal to execution
- `regime_state`: Regime at execution (-1, 0, 1)
- `phase`: Trading phase (1 or 2)
- `timestamp`: Execution timestamp

### positions
- `position_id` (PK): Auto-incrementing position identifier
- `symbol`: Trading pair
- `side`: LONG or SHORT
- `size`: Position size
- `avg_entry`: Average entry price
- `current_stop`: Current stop loss
- `current_tp`: Current take profit
- `unrealized_pnl`: Unrealized profit/loss
- `regime_at_entry`: Regime when opened
- `phase_at_entry`: Phase when opened
- `opened_at`: Position open timestamp
- `updated_at`: Last update timestamp
- `closed_at`: Position close timestamp (NULL if open)
- `close_price`: Close price
- `realized_pnl`: Realized profit/loss
- `close_reason`: Reason for close (regime_kill, stop_hit, etc.)

### regime_snapshots
- `snapshot_id` (PK): Auto-incrementing snapshot identifier
- `timestamp`: Snapshot timestamp
- `symbol`: Trading pair
- `regime_state`: Overall regime (-1, 0, 1)
- `trend_state`: Trend component (-1, 0, 1)
- `vol_state`: Volatility component (0, 1, 2)
- `market_structure_score`: SMC score (0-100)
- `model_recommendation`: TREND_FOLLOW, MEAN_REVERT, NO_TRADE

### system_events
- `event_id` (PK): Auto-incrementing event identifier
- `event_type`: Event type (emergency_flatten, heartbeat_timeout, etc.)
- `severity`: ERROR, WARNING, INFO
- `description`: Human-readable description
- `context_json`: Additional context as JSON string
- `timestamp`: Event timestamp

## Environment Variables

```bash
# PostgreSQL (Production)
DATABASE_TYPE=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/titan_execution

# Or individual connection parameters
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=titan_execution

# SQLite (Development)
DATABASE_TYPE=sqlite
DATABASE_URL=./titan_execution.db
```

## Crash Recovery

On startup, `DatabaseManager` queries the `positions` table to restore Shadow State:

```javascript
const activePositions = await dbManager.getActivePositions();
// Restore positions to Shadow State
```

This enables seamless recovery from crashes mid-trade.

## API Endpoints

The database supports the following query endpoints:

- `GET /api/trades?start_date&end_date&symbol&phase` - Trade history
- `GET /api/positions/active` - Current open positions
- `GET /api/positions/history?limit&offset` - Historical positions
- `GET /api/performance/summary` - Aggregate metrics

## Notes

- Migrations are idempotent (safe to run multiple times)
- Indexes are created separately for better control
- SQLite uses TEXT for JSON columns (PostgreSQL uses JSONB)
- All timestamps are stored in UTC
- Fire-and-forget writes prevent blocking order execution
- Retry queue handles transient database failures
