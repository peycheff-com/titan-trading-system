# M13 — Tests and Verification Harness

| Category | Exists? | Passes? | Meaningful? | Command (local) | Runtime Budget | Evidence |
|----------|---------|---------|-------------|-----------------|---------------|----------|
| Unit tests — CommandExecutor | ✅ | ✅ | ✅ | `npm test` | <5s | `tests/CommandExecutor.test.ts` |
| Unit tests — Allowlist | ✅ | ✅ | ✅ | `npm test` | <5s | Tested in CommandExecutor suite |
| HMAC signing tests | ✅ | ✅ | ✅ | In `@titan/shared` | <5s | `packages/shared` test suite |
| Integration tests | ❌ | — | — | — | — | Requires live NATS + Docker |
| Config validation | ✅ | ✅ | ✅ | `npm test` | <5s | `OPS_SECRET` fail-fast tested |
| E2E (paper trading) | N/A | — | — | — | — | OpsD does not trade |

## Test Gaps Remediated
- Added `CommandExecutor.test.ts` with tests for restart allowlist, halt, deploy, export evidence, and unknown command types.
