# M03 — Reality Snapshot

> What the code actually does today vs. what docs claim.

## Build Status
- [x] Transpiles cleanly (`tsc`)
- [x] Tests exist (40+ test files)
- [x] Test Execution: Per-project timeouts enforced (unit 10s, integration 30s, property 60s), `forceExit` in CI, `bail: 1` in CI. Tests split via `--selectProjects unit`.
- [x] Docker build: Standard Node.js

## Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Holographic Market Structure" | `HologramEngine` implements alignment logic | ✅ |
| "Session Profiling" | `SessionProfiler` tracks Asian/London/NY | ✅ |
| "Brain-Mediated Execution" | `SignalClient` sends to NATS (verified) | ✅ |

## Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| Binance Spot | WebSocket (AggTrade) | `BinanceSpotClient.ts` | ✅ |
| Bybit Perps | REST/WS | `BybitPerpsClient.ts` | ✅ |

## Core Logic Findings (Src/Engine)

### `src/engine/HologramEngine.ts`
- **Architecture**: State machine uses mutable properties (`currentRegime`, `currentAlpha`) violating immutability principles.
- **Cache**: Mutable `Map` used for caching OHLCV data.
- **Deps**: Tight coupling with `BybitPerpsClient`.

### `src/engine/HologramScanner.ts`
- **Logging**: [FIXED] Replaced `console.log/warn` with `getLogger()`.
- **State**: Mutable `scanStats` and `isScanning` flags.
- **Concurrency**: Manual batching logic implemented (good), but relies on mutable loop counters.

### `src/engine/InefficiencyMapper.ts`
- **Safety**: High usage of `as any` casting to mutate properties on POI objects (`mitigated`, `fillPercent`, `swept`).
- **Mutation**: Direct mutation of input objects is a side-effect risk.
- **Looping**: Pervasive `functional/no-let` disables.

### `src/engine/CVDValidator.ts`
- **Logging**: [FIXED] Replaced `console.log` with `getLogger()`.
- **State**: Mutable `tradeHistory` map.
- **Memory**: Trade history NOW BOUNDED — `MAX_TRADES_PER_SYMBOL = 50,000` + `MAX_SYMBOLS = 200` with eviction logic and warning logs.

### `src/engine/ScoringEngine.ts`
- **Quality**: Clean code, no direct console usage.
- **State**: Uses mutable arrays for reasoning (acceptable).

### `src/engine/SignalValidator.ts`
- **Quality**: Well-structured, implements conflict resolution logic.
- **State**: Uses mutable arrays for validation steps.

### `src/engine/ConvictionSizingEngine.ts`
- **Logging**: [FIXED] Replaced verbose `console.log` dump with `getLogger()`.
- **Logic**: Implements multi-factor sizing as required.

### `src/exchanges/BinanceSpotClient.ts` & `src/exchanges/BybitPerpsClient.ts`
- **Logging**: [FIXED] Replaced `console.log` with `getLogger()`.
- **Linting**: [FIXED] Resolved `any` type usage and unused variables.
- **State**: `BybitPerpsClient` uses mutable `cache` map.

### `src/oracle/`
- **Architecture**: Good separation of concerns (Client, Mapper, Calculator, Oracle).
- **State**: `Oracle.ts` uses mutable maps for event and score caching (`eventCache`, `scoreCache`).
- **Safety**: `PolymarketClient` uses some `any` casts in request handling but generally types responses well.



