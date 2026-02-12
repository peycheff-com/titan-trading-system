# M15 — Contract Inventory

> **Rule**: If an integration exists without a contract listed here, it is a production bug.

## NATS Subjects (this module)
| Subject | Direction | Schema | Signed? | Idempotency |
|---------|-----------|--------|---------|-------------|
| `TITAN_SUBJECTS.SIGNAL.SUBMIT` | publish (harness → Brain) | Signal payload (`signal_id`, `symbol`, `direction`, `type`, `confidence`, `size`, `phase_id`) | no | signal_id UUID |
| `TITAN_SUBJECTS.CMD.EXECUTION.ALL` | subscribe (harness ← Brain) | Execution intent payload | no | signal_id correlation |
| `TITAN_SUBJECTS.EVT.EXECUTION.REJECT` | subscribe (harness ← Execution) | `RejectionEvent` (`reason`, `expected_policy_hash`, `got_policy_hash`, `intent_id`) | no | — |

## API Contracts
| Endpoint | Method | Auth | Rate Limit | Notes |
|----------|--------|------|------------|-------|
| N/A | — | — | — | No HTTP server; CLI-only |

## Exchange API Contracts (if applicable)
| API | Endpoint | Rate Limit | Error Handling |
|-----|----------|-----------|----------------|
| N/A — mock clients only | — | — | — |

## DB Tables Owned
| Table | Partitioned? | Owner Service | Notes |
|-------|-------------|---------------|-------|
| `market_data_ohlcv` | No (read-only) | titan-brain | Queried by `HistoricalDataService.getCandles()` |
| `market_regimes` | No (read-only) | titan-brain | Queried by `HistoricalDataService.getRegimeSnapshots()` |

## Config and Environment
| Key | Type | Default | Fail-Closed? |
|-----|------|---------|--------------|
| `DATABASE_URL` | string | `postgres://postgres:postgres@localhost:5432/titan` | No — falls back to local |
| `SimulationConfig.symbol` | string | — | Required |
| `SimulationConfig.initialCapital` | number | — | Required |
| `SimulationConfig.startDate` | number | — | Required (epoch ms) |
| `SimulationConfig.endDate` | number | — | Required (epoch ms) |
| `GateConfig.maxDrawdown` | number | — | Required |
| `GateConfig.minSharpe` | number | — | Required |
| `GateConfig.minSortino` | number | — | Required |
| `GateConfig.minCalmar` | number | — | Required |
| `GateConfig.tailRiskCap` | number | optional | — |

## Error Taxonomy
| Code | Retryable | Fail-closed | Financial Impact? | Description |
|------|-----------|-------------|-------------------|-------------|
| DB connection failure | yes | yes — returns no candles | no (research) | `HistoricalDataService` PG pool connect failure |
| Data gap detected | no | no — logs warning, continues | no | Gap > 1.5× interval in candle sequence |
| ShippingGate rejection | no | yes — blocks deployment | no (gate prevents live) | Drawdown/Sharpe/tail risk exceeds threshold |
| NATS timeout | yes | yes — harness exits 1 | no | Golden path signal not answered in 5s |
