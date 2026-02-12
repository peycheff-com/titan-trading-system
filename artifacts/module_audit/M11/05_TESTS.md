# M11 — Tests and Verification Harness

| Category | Exists? | Passes? | Meaningful? | Command (local) | Command (CI) | Expected Artifacts | Runtime Budget | Evidence |
|----------|---------|---------|-------------|-----------------|--------------|-------------------|---------------|----------|
| Unit tests (Vitest) | ✅ | ✅ | ✅ | `npm test` | CI | — | <30s | `src/**/*.test.tsx` |
| Integration tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| HMAC signing tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Risk guard tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Circuit breaker tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Reconciliation tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Config validation | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <5s | <!-- --> |
| SOTA checks | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Contract/schema drift | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| E2E Tests | ✅ | ❓ | ✅ | `playwright` | CI | — | — | `e2e/` |
