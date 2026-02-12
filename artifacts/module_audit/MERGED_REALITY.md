# Titan — Merged Reality Snapshots

> Consolidated from all `01_REALITY.md` files across M01–M18, M08P, and m04-sentinel.
> Generated: 2026-02-11 | Last Updated: 2026-02-11T22:59+02:00

---

## Table of Contents

- [M01 — Titan Brain (The Orchestrator)](#m01--titan-brain-the-orchestrator)
- [M02 — Titan Scavenger](#m02--titan-scavenger)
- [M03 — Titan Hunter](#m03--titan-hunter)
- [M04 — Titan Strategies](#m04--titan-strategies)
- [M04-Sentinel — Titan Sentinel (Basis Arb)](#m04-sentinel--titan-sentinel-basis-arb)
- [M05 — Execution Engine (Rust)](#m05--execution-engine-rust)
- [M06 — NATS JetStream](#m06--nats-jetstream)
- [M07 — AI Quant](#m07--ai-quant)
- [M08 — PostgreSQL](#m08--postgresql)
- [M08P — Fat Tail Statistics](#m08p--fat-tail-statistics)
- [M09 — Redis](#m09--redis)
- [M10 — Shared Library](#m10--shared-library)
- [M11 — Titan Console (UI)](#m11--titan-console-ui)
- [M12 — Titan Console API](#m12--titan-console-api)
- [M13 — Titan OpsD](#m13--titan-opsd)
- [M14 — Quality OS](#m14--quality-os)
- [M15 — Backtesting Harness](#m15--backtesting-harness)
- [M16 — Monitoring Stack](#m16--monitoring-stack)
- [M17 — Deployment & Infrastructure](#m17--deployment--infrastructure)
- [M18 — Disaster Recovery](#m18--disaster-recovery)

---

## M01 — Titan Brain (The Orchestrator)

### Identity
- **Name**: Titan Brain (The Orchestrator)
- **Purpose**: Strategy coordination, capital allocation, high-level risk management
- **Architectural plane**: Cortex (Memory/Decision)

### Code Packages (exhaustive)
- `services/titan-brain/`
- `package.json` (Dependencies: `@titan/shared`, `fastify`, `nats`, `pg`, `redis`, `ioredis`)

### Owner Surfaces
- **Human-facing**:
    - Dashboard API: `:3100/dashboard`
    - Webhook API: `:3100/signal`
    - WebSocket: `:3101/ws/console`
    - Admin API: `:3100/admin` (Guarded)
- **Machine-facing**:
    - NATS Publisher: Commands (`TITAN_CMD`), Risk State (`TITAN_EVT_RISK`)
    - NATS Consumer: Execution Reports, Market Data, Governance Proposals

### Boundaries
- **Inputs**:
    - Market Signals (Webhooks/NATS)
    - Execution Reports (NATS)
    - Operator Overrides (API/NATS)
    - Truth Snapshots (NATS)
    - Governance Proposals (NATS)
- **Outputs**:
    - Broker Intents (NATS - via Execution Engine)
    - Risk State Updates (NATS)
    - Allocations (NATS/API)
    - Notifications (Discord/Slack - via NotificationService)
- **Dependencies** (other modules):
    - `M06` (NATS), `M08` (Postgres), `M05` (Execution)
    - `M10` (Shared Types)
    - `M02` (Scavenger - via Phase Interface)
- **Non-goals**:
    - Low-latency execution (delegated to M05)
    - Exchange connectivity (delegated to M05)
    - Private Key Management (delegated to M05/Vault)

---

## M02 — Titan Scavenger

### Build Status
- [x] Transpiles Cleanly (`tsc -b`)
- [x] Unit Tests Exist (`npm test`)
- [x] CLI UI Works (`ink` based)

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|-------------------|-------------|------|
| "3-Layer Trap Architecture" | `TitanTrap` orchestrates Generator/Detector/Executor | ✅ |
| "Regime Detection" | `TrapGenerator` identifies BREAKOUT/RANGE/TREND | ✅ |
| "Micro-CVD Confirmation" | `TrapDetector` checks 100ms accumulation + CVD | ✅ |
| "Brain Integration" | `TrapExecutor` dispatches `IntentSignal` to Brain | ✅ |
| "Safety Cooldowns" | `TrapExecutor` enforces 5min cooldown per trap | ✅ |

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| Binance Spot | REST/WS | `BinanceSpotClient.ts` | ✅ |
| Bybit Perps | REST/WS | `BybitPerpsClient.ts` | ✅ |

### Logic Flow
1. **Generator**: Scans top 20 symbols every minute for structure (Support/Resistance).
2. **Detector**: Watches Binance AggTrades; accumulates volume in 100ms buckets.
3. **Trigger**: If price hits trap + Volume Spike + CVD confirms -> Wait 200ms.
4. **Executor**: If price holds, dispatch to Brain for execution.

---

## M03 — Titan Hunter

### Build Status
- [x] Transpiles cleanly (`tsc`)
- [x] Tests exist (40+ test files)
- [x] Test Execution: Per-project timeouts enforced (unit 10s, integration 30s, property 60s), `forceExit` in CI, `bail: 1` in CI. Tests split via `--selectProjects unit`.
- [x] Docker build: Standard Node.js

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Holographic Market Structure" | `HologramEngine` implements alignment logic | ✅ |
| "Session Profiling" | `SessionProfiler` tracks Asian/London/NY | ✅ |
| "Brain-Mediated Execution" | `SignalClient` sends to NATS (verified) | ✅ |

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| Binance Spot | WebSocket (AggTrade) | `BinanceSpotClient.ts` | ✅ |
| Bybit Perps | REST/WS | `BybitPerpsClient.ts` | ✅ |

### Core Logic Findings (Src/Engine)

#### `src/engine/HologramEngine.ts`
- **Architecture**: State machine uses mutable properties (`currentRegime`, `currentAlpha`) violating immutability principles.
- **Cache**: Mutable `Map` used for caching OHLCV data.
- **Deps**: Tight coupling with `BybitPerpsClient`.

#### `src/engine/HologramScanner.ts`
- **Logging**: [FIXED] Replaced `console.log/warn` with `getLogger()`.
- **State**: Mutable `scanStats` and `isScanning` flags.
- **Concurrency**: Manual batching logic implemented (good), but relies on mutable loop counters.

#### `src/engine/InefficiencyMapper.ts`
- **Safety**: High usage of `as any` casting to mutate properties on POI objects (`mitigated`, `fillPercent`, `swept`).
- **Mutation**: Direct mutation of input objects is a side-effect risk.
- **Looping**: Pervasive `functional/no-let` disables.

#### `src/engine/CVDValidator.ts`
- **Logging**: [FIXED] Replaced `console.log` with `getLogger()`.
- **State**: Mutable `tradeHistory` map.
- **Memory**: Trade history NOW BOUNDED — `MAX_TRADES_PER_SYMBOL = 50,000` + `MAX_SYMBOLS = 200` with eviction logic and warning logs.

#### `src/engine/ScoringEngine.ts`
- **Quality**: Clean code, no direct console usage.
- **State**: Uses mutable arrays for reasoning (acceptable).

#### `src/engine/SignalValidator.ts`
- **Quality**: Well-structured, implements conflict resolution logic.
- **State**: Uses mutable arrays for validation steps.

#### `src/engine/ConvictionSizingEngine.ts`
- **Logging**: [FIXED] Replaced verbose `console.log` dump with `getLogger()`.
- **Logic**: Implements multi-factor sizing as required.

#### `src/exchanges/BinanceSpotClient.ts` & `src/exchanges/BybitPerpsClient.ts`
- **Logging**: [FIXED] Replaced `console.log` with `getLogger()`.
- **Linting**: [FIXED] Resolved `any` type usage and unused variables.
- **State**: `BybitPerpsClient` uses mutable `cache` map.

#### `src/oracle/`
- **Architecture**: Good separation of concerns (Client, Mapper, Calculator, Oracle).
- **State**: `Oracle.ts` uses mutable maps for event and score caching (`eventCache`, `scoreCache`).
- **Safety**: `PolymarketClient` uses some `any` casts in request handling but generally types responses well.

---

## M04 — Titan Strategies

### Build Status
- [x] Transpiles cleanly (`tsc`)
- [x] Tests exist (20+ test files)
- [x] Test Execution: Tests run via `--selectProjects unit` for CI-fast path. Per-project timeouts enforced.
- [x] Docker build: Standard Node.js

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Market Neutral" | `RiskManager` enforces Delta limits | ✅ |
| "Polymarket Integration" | `MarketMonitor` talks to Polymarket | ✅ |
| "Vacuum Arbitrage" | `vacuum` module exists in `src/` | ✅ |

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| Binance Spot | REST (Gateway) | `BinanceGateway.ts` | ✅ |
| Bybit Perps | REST (Gateway) | `BybitGateway.ts` | ✅ |
| Polymarket | REST | `MarketMonitor.ts` | ✅ |

---

## M04-Sentinel — Titan Sentinel (Basis Arb)

### Overview
Titan Phase 3 (Sentinel) is a functioning Basis Arbitrage bot. The core logic for signal generation, risk management, and execution routing is present.

### Gaps & Findings

#### Critical
- [x] **Hardcoded Subjects**: Updated to use `TITAN_SUBJECTS` from `@titan/shared`.
- [x] **Lint Violations**: Codebase is now lint-free (0 errors).
- [x] **Mocked Components**: `PortfolioManager` now fetches real collateral via `gateway.getBalance()`.
- [x] **Mocked Execution**: Verified usage of `SignalClient` from `@titan/shared`.

#### Major
- [x] **Error Handling**: Improved error logging in `index.tsx` and `SentinelCore`.
- [x] **Logging**: Standardized on `TitanLogger` in `index.tsx` and `SentinelCore`.
- [x] **Configuration**: Risk limits are loaded from env but `SentinelConfig` interface is a bit loose. (Accepted for now)

#### Minor
- [ ] `VacuumMonitor` threshold hardcoded values.
- [ ] `PerformanceTracker` simplified PnL logic.

### Compliance Matrix
| Invariant | Status | Notes |
|-----------|--------|-------|
| CRIT-001 | ⚠️ | Hedge logic exists but relies on signalClient atomicity which is external. |
| CRIT-002 | ✅ | `RiskManager` implements this check. |
| CRIT-003 | ✅ | - [x] Zero-Equity Hard Stop: `SentinelCore` checks `equity <= 0` and calls `process.exit(1)` (Fail-Fast).
- [ ] Hedge atomicity: Relies on `ExchangeRouter` best-effort. |
| DATA-001 | ✅ | `PriceMonitor` not fully shown but `VacuumMonitor` checks specific latency. |

### Next Steps
- ~~Fix NATS wiring~~: ✅ DONE — `SentinelCore.ts` and `index.tsx` now use `TITAN_SUBJECTS` from `@titan/shared` for all publishes and subscribes.
- Connect `PortfolioManager` to real exchange intent or NATS query for balance.
- Remove mocks.

---

## M05 — Execution Engine (Rust)

### Build Status
- [x] Compiles cleanly (`cargo check` passed)
- [x] Tests pass (`cargo test`: 45 passed)
- [x] Docker verify: Added `docker build` step to `reusable-rust.yml` (CI verified).

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "HMAC Verification" | `HmacValidator` implemented and used in `nats_engine` | ✅ |
| "PowerLaw Constraints" | `ExecutionConstraints` struct and listeners exist | ✅ |
| "Lock-free optimizations" | `crossbeam` deps present in Cargo.toml | ✅ |

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Lines | Tested Live? |
|----------|----------|--------------|-------|-------------|
| Binance Futures | REST (HMAC-SHA256) | `src/exchange/binance.rs` | 425 | ⚠️ Testnet scaffold exists — not yet proven |
| Bybit Perps | REST (HMAC-SHA256) | `src/exchange/bybit.rs` | 463 | ⚠️ Testnet scaffold exists — not yet proven |
| MEXC Futures | REST (HMAC-SHA256) | `src/exchange/mexc.rs` | 285 | ⚠️ Testnet scaffold exists — not yet proven |
| (Trait) | — | `src/exchange/adapter.rs` | 67 | — |
| (Router) | — | `src/exchange/router.rs` | 486 | — |

> **1,726 total lines of exchange adapter code.** These are real HMAC-signing implementations using `reqwest`, NOT mocks or scaffolding. Tests use mocked HTTP responses but the adapters themselves are production implementations. Testnet validation scaffolds exist at `tests/testnet_validation.rs` — require `BYBIT_TESTNET_API_KEY` to run.

---

## M06 — NATS JetStream

### Build Status
- [x] Docker build: `nats:2.10.22-alpine` (Standard)
- [x] Config Valid: `nats.conf` syntax looks correct
- [ ] Live Verification: Requires running `nats-server`

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Strict ACLs" | `nats.conf` defines specific publish/subscribe lists for 8 services | ✅ |
| "JetStream Persistence" | `nats.conf` defines `store_dir: "/data/jetstream"` | ✅ |
| "Resource Limits" | `max_mem: 1G`, `max_file: 20G` defined | ✅ |

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| N/A | — | — | — |

---

## M07 — AI Quant

### Build Status
- [x] Transpiles cleanly (`tsc`)
- [x] Tests exist (17+ test files)
- [x] Docker build: Standard Node.js

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Closed-loop Optimization" | Implemented in `TitanAnalyst.ts` | ✅ |
| "Backtest Validation" | Implemented in `Backtester.ts` | ✅ |
| "Deep Think Chain" | Implemented `deepThink()` method | ✅ |
| "Latency Modeling" | `LatencyModel` usage in `Backtester` | ✅ |

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| N/A | — | — | — |

---

## M08 — PostgreSQL

### Build Status
- [ ] Docker build (Standard Postgres image)
- [x] Schema Valid: `schema.sql` syntax is valid logic
- [x] Migration Status: Idempotent runner (`run_migrations.sh`) tracks applied migrations via `_titan_migrations` table with SHA256 hashes

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Row Level Security" | `ENABLE ROW LEVEL SECURITY` on 15+ tables | ✅ |
| "Partitioning" | `fills` and `event_log` are partitioned | ✅ |
| "Vector Search" | `pgvector` extension mentioned in Docker | ✅ |

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| N/A | — | — | — |

---

## M08P — Fat Tail Statistics

### Build Status
- [x] Transpiles cleanly (`tsc`)
- [x] Tests exist (`tail-estimators.test.ts`)
- [x] Docker build: Standard Node.js

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Fat Tail Estimation" | `tail-estimators.ts` implements Hill estimator | ✅ |
| "Volatility Clustering" | `volatility-cluster.ts` exists | ✅ |
| "NATS Integration" | Listens to `market.ticker` in `service.ts` | ✅ |

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| N/A | — | — | — |

---

## M09 — Redis

### Build Status
- [x] Docker Image: `redis:7.2.4-alpine3.19`
- [x] Config: `docker-compose.yml`
- [x] Connectivity: Port 6379 exposed

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "AOF Persistence" | `--appendonly yes` | ✅ |
| "Healthcheck" | `redis-cli ping` | ✅ |
| "Password Protection" | `--requirepass ${REDIS_PASSWORD}` in `docker-compose.prod.yml` | ✅ |

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| N/A | — | — | — |

---

## M10 — Shared Library

### Build Status
- [x] Compiles cleanly (`npm run build`)
- [x] Lint passes
- [x] Tests exist (`__tests__/invariants.test.ts`, `ai/__tests__/KimiK2Provider.test.ts`)

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Centralized Schema Management" | `src/schemas/` contains comprehensive Zod definitions | ✅ |
| "Unified NATS Client" | `NatsClient` exported in `index.ts` | ✅ |
| "Risk Policy Verification" | `PolicyHandshake` exports `verifyExecutionPolicyHash` | ✅ |

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| N/A | — | — | — |

---

## M11 — Titan Console (UI)

### Build Status
- [x] Transpiles cleanly (`vite build`)
- [x] Tests exist (`vitest`)
- [x] Docker build: Standard Nginx/Vite

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Copilot Integration" | `@copilotkit/react-core` present | ✅ |
| "Modern UI" | Shadcn/Radix/Tailwind present | ✅ |

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| N/A | — | — | — |

---

## M12 — Titan Console API

### Build Status
- [x] Transpiles cleanly (`tsc`)
- [x] Tests exist (`tests/unit/health.test.ts`)
- [x] Docker build: Standard Node.js

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "BFF Pattern" | Fastify serving API | ✅ |
| "Authentication" | Used `jsonwebtoken` but validates against plain-text `TITAN_MASTER_PASSWORD` (No hashing). | ⚠️ **MVP Auth** |
| "Role-Based Access" | Hardcoded `admin`/`operator` roles in JWT payload. | ⚠️ **Static Roles** |

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| N/A | — | — | — |

---

## M13 — Titan OpsD

### Build Status
- [x] Transpiles cleanly (`tsc`)
- [x] Docker build: multi-stage, `node:22-alpine` + `docker-cli`
- [x] **Tests exist** — `tests/CommandExecutor.test.ts` (7 test cases covering allowlist, deploy, halt, evidence, failures)
- [x] **Uses shared Logger** — `Logger.getInstance('titan-opsd')` in both `index.ts` and `CommandExecutor.ts`

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Privileged Executor" | Mounts `docker.sock`, runs `docker compose` commands | ✅ |
| "Signature Verification" | Uses `verifyOpsCommand()` from `@titan/shared` with `timingSafeEqual` | ✅ |
| "Allowlist-restricted restart" | `validateTarget()` checks against `ALLOWED_SERVICES` array | ✅ |
| "Deploy safety" | `handleDeploy()` calls `validateTarget()` — service name validated against allowlist | ✅ |
| "Receipt publishing" | `OpsReceiptSchemaV1.parse()` validates before publish | ✅ |
| "Structured logging" | Uses `Logger.getInstance('titan-opsd')` from `@titan/shared` | ✅ |
| "Graceful shutdown" | `SIGTERM`/`SIGINT` handlers registered in `main()`, calls `shutdown()` | ✅ |

### Key Code Observations
1. **`index.ts`** (146 lines): Clean NATS subscriber loop. Schema validation → HMAC verification → execution → receipt. Graceful shutdown via SIGTERM/SIGINT handlers.
2. **`CommandExecutor.ts`** (127 lines): Switch-based command dispatch. `validateTarget()` enforces allowlist for both restart and deploy. `runDocker()` spawns child process, properly awaits both stdout/stderr streams.
3. **`OPS_SECRET`**: Loaded from env, fail-fast if missing (`process.exit(1)`).
4. **Allowlist**: Hardcoded (not configurable), contains 8 services. Adding a new service requires a code change + deploy.

---

## M14 — Quality OS

### Build Status
- [x] Transpiles cleanly (`tsc`)
- [x] **Invariants Verified in Code** (`cli.ts`, `sota-registry.ts`, `evidence.ts`)
- [x] All 9 TypeScript files use `readonly` types and functional patterns

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Autonomous Repair" | `FixCommand` implements F0/F1/F2 tiered fixes | ✅ |
| "Evidence Generation" | `RunCommand` produces 5 evidence packs (quality, hygiene, supply-chain, cost, SOTA) | ✅ |
| "Git Integration" | `PlanCommand` uses `git diff --name-only` for changed files | ✅ |
| "Risk Classification" | `DiffRiskClassifier` classifies into High/Medium/Low with transitive closure | ✅ |
| "SOTA Registry" | 34 checks defined in `sota-registry.ts`, tier-gated | ✅ |
| "Graph Builder" | `RepoGraphBuilder` scans `package.json` + `Cargo.toml` for dependency graph | ✅ |
| "Supply Chain Audit" | Checks GitHub Actions pinning + `npm audit` | ✅ |
| "Determinism Vectors" | SHA256 hashing via `hashPack()` in all evidence packs | ✅ |
| "QualityKernel" | Concept in CLI output, not a distinct class — CLI dispatches to commands | ℹ️ Naming only |

### Code Quality Assessment
- **Type safety**: Strong — `readonly` interfaces, typed catches, no `any`
- **Error handling**: All `execSync`/`execAsync` calls wrapped in try/catch
- **Patterns**: Functional (immutable data, `reduce`, `flatMap`), no mutation
- **Dependencies**: Minimal (commander, chalk, glob) — appropriate for CLI tool

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| N/A | — | — | — |

---

## M15 — Backtesting Harness

### Build Status
- [x] Compiles cleanly — `tsc --noEmit` passes for both `titan-backtesting` and `titan-harness`
- [x] Lint passes — no ESLint errors (eslint-disable comments present for functional/immutable-data)
- [x] Tests pass — 2/2 in `BacktestEngine.test.ts`

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| Walk-forward simulation | `BacktestEngine.runSimulation()` feeds candles sequentially through TitanTrap mock | ✅ Implemented |
| Shipping gate enforcement | `ShippingGate.evaluate()` checks maxDrawdown, Sharpe, degradation, tail risk | ✅ Implemented |
| Historical data replay | `HistoricalDataService.getCandles()` queries PostgreSQL with gap detection | ✅ Implemented |
| Sharpe/Sortino/Calmar metrics | `BacktestEngine.calculateSharpeRatio()` computes annualized Sharpe from equity curve | ✅ Implemented |
| Max drawdown calculation | Tracked in-loop: peak equity vs current equity, stored as ratio | ✅ Implemented |
| Equity curve tracking | Built in `runSimulation()` loop, records `{timestamp, equity}` per candle | ✅ Implemented |
| Golden path verification | `GoldenPath` injects signal via NATS, tracks execution latency | ✅ Implemented |
| Rejection scenario testing | `GoldenPath.runRejectionScenario()` tests policy hash mismatch | ✅ Implemented |

### Key Observations
1. **BacktestEngine metrics are real** — `maxDrawdown`, `sharpeRatio`, `winRate` all computed from simulation data. `equityCurve` populated per-candle.
2. **`as unknown as TitanDeps[...]` casts** — BacktestEngine uses typed reinterpretation casts (not `as any`) for mock injection. This is the documented backtesting adapter boundary.
3. **Uses shared Logger** — `Logger.getInstance('backtesting')` replaces previous `console.log` usage.
4. **No GoldenPath tests** — `titan-harness` has no unit tests and relies on live NATS for integration testing.

### Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| Binance (mock) | WebSocket simulation | `MockBinanceSpotClient.ts` | N/A (simulation only) |
| Bybit (mock) | REST simulation | `MockBybitPerpsClient.ts` | N/A (simulation only) |

---

## M16 — Monitoring Stack

### Build Status
- [x] Infrastructure Defined (Prometheus + Grafana in `docker-compose.yml`)
- [x] Alert Rules Defined (300 lines, 6 groups in `alert-rules.yml`)
- [x] SLOs Defined (`monitoring/slos.yaml` — availability, latency, freshness)
- [x] Grafana Dashboard (14-panel comprehensive dashboard)
- [x] Brain PrometheusMetrics (prom-client, 497 lines, 14/14 tests pass)
- [x] Scavenger PrometheusMetrics (manual export, 421 lines)
- [x] StructuredLogger wraps `@titan/shared` Logger
- [x] Tracing configured (Tempo OTLP/gRPC)
- [x] Log aggregation configured (Loki + Promtail)

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Real-time Metrics" | Brain + Scavenger expose `/metrics`; Prometheus scrapes at 5s intervals | ✅ Aligned |
| "Visual Dashboard" | Grafana service in docker-compose, comprehensive dashboard JSON exists | ✅ Aligned |
| "Alerting" | Alert rules defined (6 groups), Alertmanager config dir exists | ✅ Aligned |
| "SLOs" | `monitoring/slos.yaml` covers availability, latency, freshness | ✅ Aligned |
| "All services scraped" | `infra/monitoring/prometheus.yml` has 7 scrape jobs (brain, execution, scavenger, hunter, sentinel, console-api, self) | ✅ Aligned |
| "Dashboard from `monitoring/grafana/dashboards/`" (docs) | Actual location: `services/titan-brain/monitoring/` | ⚠️ Path mismatch in docs |

### Key Findings
1. **Prometheus config consolidated**: `infra/monitoring/prometheus.yml` is comprehensive (7 targets with relabel configs and per-job scrape intervals).
2. **Scavenger uses manual export**: Unlike Brain (prom-client), Scavenger implements Prometheus text format manually — functionally correct but divergent pattern.
3. **No scavenger PrometheusMetrics tests**: Brain has 14 tests; scavenger has 0.
4. **Grafana admin password**: ✅ FIXED — Now uses `${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD required}` (no longer hardcoded `admin`).
5. **Dashboard path**: ✅ FIXED — Docs now point to correct `services/titan-brain/monitoring/grafana-dashboard-comprehensive.json`.

---

## M17 — Deployment & Infrastructure

### Build Status
- [x] Docker Compose configs parse cleanly (all 7 files valid YAML)
- [x] Shell scripts pass `bash -n` syntax check
- [x] CI workflows are valid YAML with pinned action SHAs
- [x] `validate-configs.ts` compiles

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| Blue/green deployment | `deploy_prod.sh` does stop → migrate → start (not true blue/green) | ⚠️ Rolling, not blue/green |
| Automatic rollback on failure | `deploy_prod.sh` stops + restarts on smoke failure (automated) | ✅ Implemented |
| Docker Secrets for prod | `docker-compose.secrets.yml` overlay exists and is comprehensive | ✅ Implemented |
| NATS ACLs per service | `config/nats.conf` defines 8 service accounts with permissions | ✅ Implemented |
| Posture-based deployment | `boot_prod_like.sh` loads posture env files | ✅ Implemented |
| CI pipeline with tier detection | `ci.yml` uses `changed_paths.sh` for risk tier | ✅ Implemented |
| Signed release manifests | `deploy-prod.yml` signs digests with `provenance.ts` | ✅ Implemented |
| Nightly security scan + SBOM | `ci.yml` has `nightly-security` job with SBOM generation | ✅ Implemented |
| Health checks on all services | ✅ All services in `docker-compose.prod.yml` have healthchecks (9 entries: traefik, nats, postgres, redis, brain, execution, scavenger, hunter, sentinel) | ✅ FIXED |
| Config validation in CI | `preflight` job runs `config_validate.sh` | ✅ Implemented |

### Key Observations
1. **NATS passwords in prod**: ✅ FIXED — `docker-compose.prod.yml` now uses `nats.conf.template` with `envsubst` to inject `$NATS_*_PASSWORD` env vars at startup. Dev `nats.conf` is never mounted in prod.
2. **Deploy is stop-migrate-start, not blue/green** — `deploy_prod.sh` does sequential stop → migrate → start. Accepted trade-off with documented rollback. Rollback now automated (stop + restart on smoke failure).
3. **`smoke_prod.sh` checks Brain on port 3100** — Correct port, uses `docker compose exec` to curl health endpoints
4. **Redis with auth in prod** — `docker-compose.prod.yml` redis uses `--requirepass ${REDIS_PASSWORD}`
5. **Pre-deploy env validation** — `validate_prod_env.sh` checks 14 required vars, rejects ALL known dev defaults (including all 9 NATS service passwords), validates `docker compose config`
6. **POSTGRES_PASSWORD fail-fast** — Uses `:?` syntax to abort compose if unset
7. **Grafana password env-ified** — No longer hardcoded `admin` default
8. **Idempotent DB migrations** — `run_migrations.sh` tracks via `_titan_migrations` table with SHA256 drift detection

---

## M18 — Disaster Recovery

### Build Status
- [x] Cron defined (`titan-backups.cron`) — 5 jobs
- [x] Main backup script (`backup-production.sh`) — 221 lines, handles JetStream/Postgres/Redis/verify
- [x] Exchange whitelist check (`verify-exchange-whitelist.sh`) — Binance/Bybit/MEXC
- [x] Restore drill scripts exist (JetStream + DB)
- [x] In-app state backup (`FileSystemBackupService.ts`) — with directory traversal protection
- [x] Property tests exist (`BackupRecovery.property.test.ts`) — 1109 lines

### Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Daily Backups" (Postgres) | `0 4 * * *` via cron → `backup-production.sh postgres` | ✅ |
| "Daily Backups" (JetStream) | `0 3 * * *` via cron → `backup-production.sh jetstream` | ✅ |
| "Redis Backup" | `0 */6 * * *` via cron → `backup-production.sh redis` | ✅ |
| "Backup Verification" | `0 6 * * *` via cron → `backup-production.sh verify` | ✅ |
| "Exchange Whitelist" | `0 7 * * *` via cron → `verify-exchange-whitelist.sh` | ✅ |
| "05_backup.sh wrapper" | ✅ FIXED — Wrapper now uses correct args (`postgres`/`jetstream`/`redis`/`verify`), matching `backup-production.sh` | ✅ Fixed |
| "Evidence: verify_backup.sh" | ✅ CREATED — `infra/scripts/verify_backup.sh` validates backup integrity (gzip/tar tests, age checks, size checks) | ✅ Fixed |
| "Evidence: restore_db.sh" | ✅ CREATED — `infra/scripts/restore_db.sh` (safety confirmation, dry-run mode, post-restore validation) | ✅ Fixed |
| "3 simple backup scripts" | `backup-production.sh` now uses `set -euo pipefail` | ✅ Fixed |

### Exchange Connectivity
| Exchange | Protocol | Verification Script | Tested Live? |
|----------|----------|---------------------|-------------|
| Binance | REST (HMAC-SHA256) | `verify-exchange-whitelist.sh` L43-79 | Pre-deploy |
| Bybit | REST (HMAC-SHA256) | `verify-exchange-whitelist.sh` L82-122 | Pre-deploy |
| MEXC | REST (HMAC-SHA256) | `verify-exchange-whitelist.sh` L125-158 | Pre-deploy |
