# M13 — Definition of Done

## Gate Achieved: **A**
## Justification: All critical findings remediated, tests added and passing, build clean, lint clean.

## Checklist
- [x] All invariants enforced with tests (11 tests, allowlist for both restart + deploy)
- [x] HMAC signature verification tested (via `@titan/shared` test suite)
- [x] Allowlist validation — restart and deploy both enforce service allowlist
- [x] Graceful shutdown handler (SIGTERM/SIGINT)
- [x] Structured logging via shared `Logger` (no raw `console.log`)
- [x] Schema validation on input (`OpsCommandSchemaV1.safeParse`) and output (`OpsReceiptSchemaV1.parse`)
- [x] No known critical gaps remain
- [x] Audit artifacts complete (00-10)

## Evidence Links
- Tests: `services/titan-opsd/tests/CommandExecutor.test.ts` — 11 tests, all passing
- Build: `tsc --noEmit` clean
- Lint: `eslint src/**/*.ts` clean (0 errors)

## Deferred to Gate B
- Externalize allowlist to config (currently hardcoded)
- Emit `opsd_*` metrics via shared `MetricsCollector`
