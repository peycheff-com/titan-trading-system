# Module: M15

## Identity
- **Name**: Backtesting Harness
- **Purpose**: Historical strategy validation, walk-forward simulation, shipping gate enforcement, and golden-path integration verification
- **Architectural plane**: Research / Verification

## Code Packages (exhaustive)
- `packages/titan-backtesting/` — BacktestEngine, ShippingGate, HistoricalDataService, types, mock exchange clients
- `packages/titan-harness/` — GoldenPath integration harness for end-to-end NATS signal verification
- `simulation/` — Deployment state and compose files for simulation environments

## File Inventory

### titan-backtesting (9 source files, 1 test file)
| File | LOC | Purpose |
|------|-----|---------|
| `src/index.ts` | 5 | Barrel re-export |
| `src/types/index.ts` | 88 | OHLCV, Trade, BacktestResult, Signal, Strategy, ValidationReport types |
| `src/engine/BacktestEngine.ts` | 155 | Core simulation engine wrapping TitanTrap with mock clients |
| `src/data/HistoricalDataService.ts` | 120 | PostgreSQL historical candle/regime loader with gap detection |
| `src/gate/ShippingGate.ts` | 78 | Pre-deployment validation gates (drawdown, Sharpe, tail risk) |
| `src/mocks/MockBinanceSpotClient.ts` | 44 | Mock Binance spot data feed for simulation |
| `src/mocks/MockBybitPerpsClient.ts` | 69 | Mock Bybit perps execution client |
| `src/mocks/MockConfigManager.ts` | 92 | Mock config manager with default TrapConfig |
| `src/mocks/MockSignalClient.ts` | 16 | Mock signal client (no-op) |
| `tests/BacktestEngine.test.ts` | 95 | Unit tests for BacktestEngine initialization and simulation |

### titan-harness (2 source files, 0 test files)
| File | LOC | Purpose |
|------|-----|---------|
| `src/index.ts` | 37 | CLI entry point for golden path verification |
| `src/GoldenPath.ts` | 257 | NATS-based integration harness: signal injection, latency tracking, rejection testing |

## Owner Surfaces
- **Human-facing**: CLI (`ts-node src/index.ts --symbol BTC/USD --side BUY`)
- **Machine-facing**: NATS subjects (`TITAN_SUBJECTS.SIGNAL.SUBMIT`, `TITAN_SUBJECTS.CMD.EXECUTION.ALL`, `TITAN_SUBJECTS.EVT.EXECUTION.REJECT`)

## Boundaries
- **Inputs**: Historical OHLCV candles (PostgreSQL), NATS signal stream, CLI arguments
- **Outputs**: `BacktestResult`, `ValidationReport`, latency statistics, rejection statistics
- **Dependencies**: `@titan/shared` (Logger, NATS client, subjects), `titan-phase1-scavenger` (TitanTrap, calculators, exchange types), `pg` (PostgreSQL)
- **Non-goals**: Live trading, real exchange connectivity, production deployment
