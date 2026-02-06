# Repo Hygiene Purge Ledger

**Date**: 2026-02-06  
**Baseline Commit**: `5bf765c247f33309b51b3e6323c263237a0357e8`

## Commits

1. `e9682ada` - chore(hygiene): remove dead code and empty directories
2. `23bec705` - test(hygiene): fix flaky HologramScanner timing test
3. `654b786c` - docs(hygiene): update purge ledger with test verification
4. `449b0179` - chore(deps): remove unused csv-parse dependency

| Category | Count | Evidence |
|----------|-------|----------|
| Empty directories removed | 50+ | `find -empty -delete` |
| .DS_Store files removed | All | `find -name ".DS_Store" -delete` |
| Dead code files removed | 7 | Knip analysis |
| Simulation releases cleaned | 1 dir | Old release artifacts |

## Dead Code Files Removed

All files verified unreferenced by Knip static analysis:

| File | Reason |
|------|--------|
| `services/titan-phase1-scavenger/src/exchanges/MexcSpotClient.ts` | Unused exchange client |
| `services/titan-console-api/src/routes/auth.ts` | Unused auth route |
| `services/titan-brain/src/engine/ChangePointDetector.ts` | Unused analysis module |
| `services/titan-phase2-hunter/src/telemetry/MarketTradePublisher.ts` | Unused publisher |
| `services/titan-phase2-hunter/src/telemetry/VenueStatusPublisher.ts` | Unused publisher |
| `services/titan-phase2-hunter/src/telemetry/index.ts` | Empty barrel |
| `apps/titan-console/src/hooks/useVenues.ts` | Unused React hook |

## Empty Directories Removed

Categories:
- `.genkit/` cache directories (traces, runtimes, servers)
- `evidence/titan-360-*/` empty placeholders
- `simulation/titan/releases/` old artifacts
- `services/*/dist_tests/` empty build outputs
- `packages/shared/logs/` variants
- `docs/adr/` empty ADR folder

## Verification Gates

| Gate | Status |
|------|--------|
| `npm run build` | ✅ Pass (13 tasks, 1m22s) |
| `npm run lint:all` | ✅ Pass (0 errors, 896 warnings) |
| `npm run test:all` | ✅ Pass (656 passed) |
| Imports intact | ✅ No missing module errors |

## Items NOT Removed (Verified Live)

All 9 production services verified against canonical spec:
- titan-brain, titan-execution-rs, titan-console, titan-console-api
- titan-opsd, titan-scavenger, titan-hunter, titan-sentinel
- titan-ai-quant, titan-powerlaw-lab

## Deferred Items

| Item | Reason |
|------|--------|
| 45 TODO/FIXME markers | Require individual review |
| 896 prettier warnings | Non-blocking, cosmetic |
| Unused exports (220) | Require detailed analysis |
