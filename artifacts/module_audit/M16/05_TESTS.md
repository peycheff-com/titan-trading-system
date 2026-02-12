# M16 — Tests and Verification Harness

| Category | Exists? | Passes? | Meaningful? | Command (local) | Expected Artifacts | Runtime Budget | Evidence |
|----------|---------|---------|-------------|-----------------|-------------------|---------------|----------|
| Brain PrometheusMetrics unit | ✅ | ✅ 14/14 | ✅ | `cd services/titan-brain && npx jest --testPathPattern='PrometheusMetrics' --no-coverage` | Test report | < 2s | [test output](evidence/) |
| Scavenger PrometheusMetrics unit | ✅ | ✅ | ✅ | `cd services/titan-phase1-scavenger && npx jest --testPathPattern='PrometheusMetrics' --no-coverage` | Test report | < 2s | [test output](evidence/) |
| Config validation (prometheus.yml) | ✅ | ✅ | ✅ | `node scripts/sota/monitoring-config.test.ts` | Validation output | < 5s | [test output](evidence/) |
| Alert rules YAML parse | ✅ | ✅ | ✅ | Included in config validation | — | < 1s | — |
| Dashboard JSON parse | ✅ | ✅ | ✅ | Included in config validation | — | < 1s | — |
| Integration tests | ❌ | — | — | Requires running Docker stack | — | — | — |
| E2E (paper trading) | ❌ | — | — | Requires live stack | — | — | — |
