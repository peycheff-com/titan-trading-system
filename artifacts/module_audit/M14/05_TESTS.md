# M14 — Tests and Verification Harness

| Category | Exists? | Passes? | Meaningful? | Command (local) | Command (CI) | Expected Artifacts | Runtime Budget | Evidence |
|----------|---------|---------|-------------|-----------------|--------------|-------------------|---------------|----------|
| Unit Tests | ✅ | ✅ (31/31) | ✅ | `npm test` | CI | — | <2s | `tests/unit/*.test.ts` |
| CLI Verification | ✅ | ✅ | ✅ | `npm run quality:plan` | Manual | `plan.json` | <30s | `cli.ts:38` |
| Fix Dry-Run | ✅ | ✅ | ✅ | `npm run quality:fix -- --dry-run` | Manual | `fix-report.json` | <10s | `fix.ts:128` |
| TypeScript Build | ✅ | ✅ | ✅ | `npm run build` | CI | `dist/` | <10s | `package.json` |
| Lint | ✅ | ✅ | ✅ | `npm run lint` | CI | — | <5s | `package.json` |

## Test Coverage

| Test File | Tests | Covers |
|-----------|-------|--------|
| `risk-classifier.test.ts` | 8 | Risk tier classification, transitive impacts, edge cases |
| `evidence.test.ts` | 12 | `hashPack` determinism + type guards, `QualityPack` generation, `CostPack` generation |
| `sota-registry.test.ts` | 11 | Registry completeness, tier monotonicity, category grouping, uniqueness |
