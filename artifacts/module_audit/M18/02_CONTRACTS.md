# M18 — Contract Inventory

> **Rule**: If an integration exists without a contract listed here, it is a production bug.

## NATS Subjects (this module)
| Subject | Direction | Schema | Signed? | Idempotency |
|---------|-----------|--------|---------|-------------|
| N/A — M18 is cron-driven, no NATS interaction | — | — | — | — |

## API Contracts
| Endpoint | Method | Auth | Rate Limit | Notes |
|----------|--------|------|------------|-------|
| N/A — No HTTP endpoints in this module | — | — | — | — |

## Exchange API Contracts (verification only)
| API | Endpoint | Rate Limit | Error Handling |
|-----|----------|-----------|----------------|
| Binance Futures | `fapi.binance.com/fapi/v2/account` | Standard | code -2015 = IP not whitelisted |
| Bybit | `api.bybit.com/v5/account/wallet-balance` | Standard | retCode 10003 = IP not whitelisted |
| MEXC | `contract.mexc.com/api/v1/private/account/assets` | Standard | success=false = check key/whitelist |

## DB Tables Owned
| Table | Partitioned? | RLS? | Owner Service |
|-------|-------------|------|---------------|
| N/A — Reads from all, writes none | — | — | — |

## Config and Environment
| Key | Type | Default | Fail-Closed? |
|-----|------|---------|--------------|
| `DO_API_TOKEN` | string | empty | Yes — JetStream snapshot skipped if empty |
| `TITAN_BACKUP_SPACE` | string | `titan-backups` | No |
| `TITAN_BACKUP_REGION` | string | `ams3` | No |
| `TITAN_JETSTREAM_VOLUME` | string | `titan-jetstream-vol` | No |
| `TITAN_DB_HOST` | string | `localhost` | No |
| `TITAN_DB_PORT` | string | `5432` | No |
| `TITAN_DB_USER` | string | `postgres` | No |
| `TITAN_DB_PASSWORD` | string | `postgres` | No |
| `TITAN_DB_NAME` | string | `titan_brain` | No |
| `REDIS_RDB_PATH` | string | `/data/redis/dump.rdb` | No |
| `TITAN_EXCHANGES` | string | `binance,bybit` | No |
| `BINANCE_API_KEY` / `BINANCE_SECRET_KEY` | string | empty | Skips auth check |
| `BYBIT_API_KEY` / `BYBIT_SECRET_KEY` | string | empty | Skips auth check |
| `MEXC_API_KEY` / `MEXC_SECRET_KEY` | string | empty | Skips auth check |

## Error Taxonomy
| Code | Retryable | Fail-closed | Financial Impact? | Description |
|------|-----------|-------------|-------------------|-------------|
| `Exit 1` (backup) | Yes (next cron) | Yes | No (ops only) | Backup failed — logged, MAILTO notified |
| `Exit 1` (whitelist) | Yes (next cron) | No | Indirect — trading may fail if IP not whitelisted | Exchange access check failed |
| `Exit 1` (verify) | Yes (next cron) | No | No (stale backup detection) | Backup verification failed |
