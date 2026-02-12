# M03 — Tests and Verification Harness

| Category | Exists? | Passes? | Meaningful? | Command (local) | Command (CI) | Expected Artifacts | Runtime Budget | Evidence |
|----------|---------|---------|-------------|-----------------|--------------|-------------------|---------------|----------|
| Unit tests (Jest) | ✅ | ❓ | ✅ | `npm run test:unit` | CI | — | <30s | `tests/unit/*.test.ts` |
| Hologram Logic | ✅ | ❓ | ✅ | `npm run test:unit` | CI | — | — | `HologramEngine.test.ts` |
| Risk Management | ✅ | ❓ | ✅ | `npm run test:unit` | CI | — | — | `RiskManager.test.ts` |
| Integration tests | ✅ | ❓ | ✅ | `npm run test:integration` | CI | — | — | `EndToEnd.integration.test.ts` |
