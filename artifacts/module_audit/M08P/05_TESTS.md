# M08P — Tests and Verification Harness

| Category | Exists? | Passes? | Meaningful? | Command (local) | Command (CI) | Expected Artifacts | Runtime Budget | Evidence |
|----------|---------|---------|-------------|-----------------|--------------|-------------------|---------------|----------|
| Unit tests (Jest) | ✅ | ✅ | ✅ | `npm test` | CI | — | <10s | `tests/tail-estimators.test.ts` |
| Math Validation | ✅ | ❓ | ✅ | `npm test` | CI | — | — | `tail-estimators.test.ts` |
| Integration tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| HMAC signing tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Risk guard tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Circuit breaker tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Reconciliation tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Config validation | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <5s | <!-- --> |
| SOTA checks | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Contract/schema drift | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| E2E (paper trading) | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
