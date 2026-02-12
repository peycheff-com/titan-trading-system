# M12 — Tests and Verification Harness

| Category | Exists? | Passes? | Meaningful? | Command (local) | Command (CI) | Expected Artifacts | Runtime Budget | Evidence |
|----------|---------|---------|-------------|-----------------|--------------|-------------------|---------------|----------|
| Unit tests | ❌ | ❌ | ❌ | — | — | — | — | `package.json` script missing |
| Integration tests | ❌ | ❌ | ❌ | — | — | — | — | — |
| HMAC signing tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Risk guard tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Circuit breaker tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Reconciliation tests | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Config validation | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <5s | <!-- --> |
| SOTA checks | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| Contract/schema drift | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |
| E2E (paper trading) | ❌ | ❌ | ❌ | <!-- --> | <!-- --> | <!-- --> | <!-- --> | <!-- --> |

> **Critical Gap**: M12 has no automated tests. Relying on manual testing via Console (M11).
