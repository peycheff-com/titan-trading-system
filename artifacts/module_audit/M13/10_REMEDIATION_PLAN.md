# M13 — Remediation Plan

| # | Finding | Impact | Fix Policy | Proposed Change | Status | Gate |
|---|---------|--------|------------|-----------------|--------|------|
| 1 | `console.log/error` used instead of shared `Logger` | Med | F1 | Replace with `Logger.getInstance('titan-opsd')` | ✅ Done | A |
| 2 | Zero unit tests | High | F0 | Add `CommandExecutor.test.ts` | ✅ Done | A |
| 3 | `handleDeploy()` missing allowlist | High | F0 | Add same `ALLOWED` services check | ✅ Done | A |
| 4 | No graceful shutdown | Med | F1 | Add SIGTERM handler with NATS drain | ✅ Done | A |
| 5 | Hardcoded restart allowlist | Low | F2 | Future: externalize to config | Deferred | B |
| 6 | No metrics emission | Low | F2 | Future: emit `opsd_*` metrics via shared `MetricsCollector` | Deferred | B |
