# M15 — Drift Control and Upgrade Strategy

## Doc-to-Code Sync
- **Enforcement**: Manual review — no automated doc-to-code sync for research modules
- **Audit artifacts**: Updated in `artifacts/module_audit/2026-02-11/modules/M15/`

## Mock-to-Real Client Parity
- **Source (real)**: `titan-phase1-scavenger/src/exchanges/BinanceSpotClient.ts`, `BybitPerpsClient.ts`
- **Copy (mock)**: `packages/titan-backtesting/src/mocks/MockBinanceSpotClient.ts`, `MockBybitPerpsClient.ts`
- **Enforcement**: Loose — mocks are cast `as any` at injection. No compile-time interface contract enforced.
- **Risk**: If real client adds new methods or changes signatures, mocks silently miss them.
- **Mitigation**: Mocks imported types from real client (`Trade`, `OrderParams`, `OrderResult`) — structural alignment maintained through shared types.

## Type Import Dependencies
| Mock File | Imports From | Types Used |
|-----------|-------------|------------|
| `MockBinanceSpotClient.ts` | `titan-phase1-scavenger/dist/exchanges/BinanceSpotClient.js` | `Trade` |
| `MockBybitPerpsClient.ts` | `titan-phase1-scavenger/dist/types/index.js` | `OHLCV`, `OrderParams`, `OrderResult` |
| `MockConfigManager.ts` | `titan-phase1-scavenger/dist/config/ConfigManager.js` | `MergedConfig`, `TrapConfig` |

## NATS Subject Canonicalization
- Source: `@titan/shared` → `TITAN_SUBJECTS`
- Enforcement: GoldenPath uses canonical subject constants from shared, no hardcoded subject strings
- Evidence: `GoldenPath.ts` lines 58, 65, 130 reference `TITAN_SUBJECTS.*`

## Schema Drift Detection
- DB tables (`market_data_ohlcv`, `market_regimes`) are read-only — owned by titan-brain
- No schema migrations in M15

## Upgrade Playbook
- Research module — no production deployment
- Upgrade process: `npm run build` in both packages, re-run backtest/harness
- Breaking changes to TitanTrap interface require mock updates
