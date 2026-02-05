# Titan Environment Variable Inventory

**Generated**: 2026-02-05  
**Source**: `.env.example` + `process.env` grep across services

## 1. System-Wide Settings

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `NODE_ENV` | Yes | production | All | Environment mode (development/production/test) | No |
| `LOG_LEVEL` | No | info | All | Log verbosity (fatal/error/warn/info/debug/trace) | No |
| `TZ` | No | UTC | All | Timezone | No |
| `PRODUCTION_MODE` | No | true | All | Production safety flag | No |

## 2. Security & Authentication

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `TITAN_MASTER_PASSWORD` | Yes | - | Brain | Master operator password | Yes |
| `HMAC_SECRET` | Yes | - | Brain, Execution | Command signature secret | Yes |
| `WEBHOOK_SECRET` | No | - | Brain | Webhook validation | Yes |
| `SAFETY_SECRET` | No | dev-secret-do-not-use-in-prod | Brain | Safety session signing | Yes |
| `GOVERNANCE_KEYS` | No | - | Brain | Authorized governance keys | Yes |

## 3. Exchange API Credentials

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `BINANCE_API_KEY` | Cond | - | Execution | Binance API key | Yes |
| `BINANCE_API_SECRET` | Cond | - | Execution | Binance API secret | Yes |
| `BYBIT_API_KEY` | Yes | - | Execution | Bybit API key | Yes |
| `BYBIT_API_SECRET` | Yes | - | Execution | Bybit API secret | Yes |
| `BYBIT_TESTNET` | No | false | Execution | Use testnet | No |
| `BYBIT_CATEGORY` | No | linear | Execution | Contract type | No |
| `BYBIT_RATE_LIMIT_RPS` | No | 10 | Execution | Rate limit | No |
| `BYBIT_MAX_RETRIES` | No | 3 | Execution | Max retries | No |
| `BYBIT_ACCOUNT_CACHE_TTL` | No | 5000 | Execution | Account cache TTL ms | No |
| `BROKER_API_KEY` | No | - | Legacy | Legacy broker key | Yes |
| `BROKER_API_SECRET` | No | - | Legacy | Legacy broker secret | Yes |

## 4. Trading & Risk Parameters

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `INITIAL_EQUITY` | No | 20 | Brain | Starting equity | No |
| `USE_MOCK_BROKER` | No | false | Execution | Mock mode | No |
| `MAX_RISK_PCT` | No | 0.03 | Brain | Max risk per trade | No |
| `PHASE_1_RISK_PCT` | No | 0.03 | Brain | Phase 1 risk | No |
| `PHASE_2_RISK_PCT` | No | 0.024 | Brain | Phase 2 risk | No |
| `MAKER_FEE_PCT` | No | 0.0002 | Brain | Maker fee % | No |
| `TAKER_FEE_PCT` | No | 0.0006 | Brain | Taker fee % | No |
| `MAX_POSITION_SIZE_PCT` | No | 0.1 | Brain | Max position % | No |
| `MAX_TOTAL_LEVERAGE` | No | 20 | Brain | Max leverage | No |

## 5. Circuit Breaker & Safety

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `MAX_DAILY_DRAWDOWN_PCT` | No | 0.07 | Brain | Daily loss limit | No |
| `MAX_WEEKLY_DRAWDOWN_PCT` | No | 0.105 | Brain | Weekly loss limit | No |
| `BREAKER_MAX_DAILY_DRAWDOWN` | No | 0.07 | Brain | Breaker trigger | No |
| `BREAKER_MIN_EQUITY` | No | 16.0 | Brain | Min equity threshold | No |
| `CAPITAL_RESERVE_LIMIT` | No | 200 | Brain | Reserve limit | No |
| `MAX_CONSECUTIVE_LOSSES` | No | 2 | Brain | Loss streak limit | No |
| `BREAKER_CONSECUTIVE_LOSS_LIMIT` | No | 2 | Brain | Breaker loss limit | No |
| `BREAKER_CONSECUTIVE_LOSS_WINDOW` | No | 3600000 | Brain | Window ms | No |
| `CIRCUIT_BREAKER_COOLDOWN_HOURS` | No | 4 | Brain | Cooldown hours | No |
| `ZSCORE_SAFETY_THRESHOLD` | No | -2.0 | Brain | Z-score threshold | No |
| `DRAWDOWN_VELOCITY_THRESHOLD` | No | 0.02 | Brain | DD velocity | No |
| `EMERGENCY_STOP_LOSS_PCT` | No | 0.1 | Brain | Emergency SL | No |
| `MIN_TRADE_INTERVAL_MS` | No | 30000 | Brain | Min trade gap | No |
| `MAX_TRADES_PER_HOUR` | No | 10 | Brain | Hourly limit | No |
| `MAX_TRADES_PER_DAY` | No | 50 | Brain | Daily limit | No |
| `HEARTBEAT_TIMEOUT_MS` | No | 300000 | Brain | HB timeout | No |

## 6. Database Configuration

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `DATABASE_TYPE` | No | postgres | Brain | DB type | No |
| `DATABASE_URL` | Yes | - | Brain | Full connection URL | Yes |
| `DB_HOST` | No | localhost | Brain | DB host | No |
| `DB_PORT` | No | 5432 | Brain | DB port | No |
| `DB_NAME` | No | titan_brain_production | Brain | DB name | No |
| `DB_USER` | No | postgres | Brain | DB user | No |
| `DB_PASSWORD` | No | - | Brain | DB password | Yes |
| `DB_SSL` | No | false | Brain | SSL enabled | No |
| `DB_MAX_CONNECTIONS` | No | 20 | Brain | Pool size | No |
| `DB_IDLE_TIMEOUT` | No | 30000 | Brain | Idle timeout | No |
| `SQLITE_DB_PATH` | No | ./titan_brain.db | Brain | SQLite path | No |

## 7. Redis Configuration

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `REDIS_URL` | Yes | - | Brain | Redis URL | No |
| `REDIS_REQUIRED` | No | true | Brain | Strict mode | No |
| `REDIS_DISABLED` | No | false | Brain | Disable Redis | No |
| `REDIS_MAX_RETRIES` | No | 3 | Brain | Max retries | No |
| `REDIS_RETRY_DELAY` | No | 1000 | Brain | Retry delay | No |
| `IDEMPOTENCY_TTL` | No | 300 | Brain | TTL seconds | No |

## 8. Server Ports & Networking

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `TITAN_BRAIN_PORT` | No | 3100 | Brain | Brain HTTP | No |
| `TITAN_EXECUTION_PORT` | No | 3002 | Execution | Exec HTTP | No |
| `TITAN_CONSOLE_PORT` | No | 3001 | Console | Console HTTP | No |
| `TITAN_SCAVENGER_PORT` | No | 8081 | Scavenger | Phase 1 port | No |
| `SERVER_HOST` | No | 0.0.0.0 | All | Bind host | No |
| `SERVER_PORT` | No | 3100 | Brain | Server port | No |
| `PORT` | No | 3002 | Execution | Exec port | No |
| `WS_PORT` | No | 3101 | Brain | WebSocket port | No |
| `CORS_ORIGINS` | No | localhost | Brain | CORS origins | No |
| `RATE_LIMIT_PER_SEC` | No | 12 | Brain | API rate limit | No |

## 9. NATS Configuration

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `NATS_URL` | Yes | nats://localhost:4222 | All | NATS server URL | No |
| `NATS_USER` | Yes | - | All | NATS username | No |
| `NATS_PASS` | Yes | - | All | NATS password | Yes |
| `NATS_SYS_PASSWORD` | Prod | - | NATS | System account | Yes |

## 10. Integration URLs

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `EXECUTION_ENGINE_URL` | No | http://localhost:3002 | Brain | Exec URL | No |
| `CONSOLE_URL` | No | http://localhost:3002 | Brain | Console URL | No |
| `NEXT_PUBLIC_EXECUTION_URL` | No | http://localhost:3002 | Console | Public exec | No |
| `NEXT_PUBLIC_BRAIN_URL` | No | http://localhost:3100 | Console | Public brain | No |

## 11. Funding/Sentiment Thresholds

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `FUNDING_GREED_THRESHOLD` | No | 100 | Brain | Greed level | No |
| `FUNDING_HIGH_GREED_THRESHOLD` | No | 50 | Brain | High greed | No |
| `FUNDING_FEAR_THRESHOLD` | No | -50 | Brain | Fear level | No |

## 12. Brain Service Configuration

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `BRAIN_SIGNAL_TIMEOUT` | No | 100 | Brain | Signal timeout | No |
| `BRAIN_METRIC_UPDATE_INTERVAL` | No | 60000 | Brain | Metric interval | No |
| `BRAIN_DASHBOARD_CACHE_TTL` | No | 5000 | Brain | Dashboard cache | No |
| `BRAIN_MAX_QUEUE_SIZE` | No | 100 | Brain | Queue size | No |
| `CAPITAL_SWEEP_THRESHOLD` | No | 1.2 | Brain | Sweep threshold | No |
| `CAPITAL_SWEEP_SCHEDULE` | No | 0 0 * * * | Brain | Cron schedule | No |
| `CAPITAL_MAX_RETRIES` | No | 3 | Brain | Retry count | No |
| `CAPITAL_RETRY_BASE_DELAY` | No | 1000 | Brain | Retry delay | No |

## 13. Execution Service Configuration

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `WS_ORDERBOOK_URL` | No | wss://stream.bybit.com/v5/public/linear | Execution | WS URL | No |
| `WS_CACHE_MAX_AGE_MS` | No | 100 | Execution | Cache age | No |
| `MIN_STRUCTURE_THRESHOLD` | No | 60 | Execution | Structure min | No |
| `MAX_SPREAD_PCT` | No | 0.001 | Execution | Max spread | No |
| `MAX_SLIPPAGE_PCT` | No | 0.002 | Execution | Max slippage | No |
| `MAX_TIMESTAMP_DRIFT_MS` | No | 5000 | Execution | TS drift | No |
| `SIGNAL_CACHE_TTL_MS` | No | 300000 | Execution | Signal cache | No |

## 14. Notifications

| Variable | Required | Default | Services | Purpose | Secret |
|----------|----------|---------|----------|---------|--------|
| `TELEGRAM_BOT_TOKEN` | No | - | Brain | Telegram bot | Yes |
| `TELEGRAM_CHAT_ID` | No | - | Brain | Telegram chat | No |

---

## Summary

| Category | Count |
|----------|-------|
| System-Wide | 4 |
| Security | 5 |
| Exchange Credentials | 11 |
| Trading/Risk | 9 |
| Circuit Breaker | 15 |
| Database | 11 |
| Redis | 6 |
| Networking | 11 |
| NATS | 4 |
| Integration URLs | 4 |
| Funding | 3 |
| Brain Config | 8 |
| Execution Config | 7 |
| Notifications | 2 |
| **Total** | **100** |

**Secret Variables**: 18 (require secure handling)
