# M14 — Remediation Plan

| # | Finding | Impact | Fix Policy | Current Signal | Proposed Change | Tests Added | Evidence to Collect | Gate Target | Status |
|---|---------|--------|------------|----------------|-----------------|-------------|--------------------|-------------|--------|
| 1 | Zero unit tests | Low | F1 | `npm test` passes 31/31 | Added 3 test files for `risk-classifier`, `evidence`, `sota-registry` | Yes (31 tests) | Test output | A | ✅ Resolved |
| 2 | Schema `proof_method` enum mismatch | Low | F0 | Schema now matches code (`knip`, `zero_references`) | Updated `hygiene-pack.schema.json` | No | Schema diff | A | ✅ Resolved |
| 3 | `hashPack` casts `data` to `object` | Low | F0 | Type guard added: `typeof data === 'object'` check | Runtime type guard with fallback | Yes (4 tests) | `evidence.test.ts` | A | ✅ Resolved |
| 4 | `process.exit(1)` in RunCommand | Low | F1 | Replaced with `QualityGateError` + boolean return | CLI catches error and exits | No | Code review | A | ✅ Resolved |
| 5 | `console.log` instead of structured logger | Low | F0 | N/A — acceptable for CLI tool | Keep as-is — chalk output is correct UX | No | N/A | N/A | ✅ Accepted |

> **All 5 findings resolved.** Gate A requirements met.
