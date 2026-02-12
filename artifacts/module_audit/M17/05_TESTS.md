# M17 — Tests and Verification Harness

| Category | Exists? | Passes? | Meaningful? | Command (local) | Command (CI) | Expected Artifacts | Runtime Budget | Evidence |
|----------|---------|---------|-------------|-----------------|--------------|-------------------|---------------|----------|
| Config validation | ✅ | ✅ | ✅ | `npx tsx scripts/validate-configs.ts` | `scripts/ci/config_validate.sh` | Pass/fail output | <5s | CI logs |
| Compose syntax (base) | ✅ | ✅ | ✅ | `docker compose -f docker-compose.yml config` | N/A | Valid YAML | <2s | Manual |
| Compose syntax (prod) | ✅ | ✅ | ✅ | `docker compose -f docker-compose.prod.yml config` | N/A | Valid YAML | <2s | Manual |
| Compose syntax (dev) | ✅ | ✅ | ✅ | `docker compose -f docker-compose.dev.yml config` | N/A | Valid YAML | <2s | Manual |
| Shell script syntax | ✅ | ✅ | ✅ | `bash -n scripts/deploy_prod.sh` | N/A | No output = pass | <1s | Manual |
| CI workflow lint | ✅ | ✅ | ✅ | `actionlint` (if installed) | N/A | Lint pass | <5s | Manual |
| Smoke test | ✅ | N/A | ✅ | `scripts/smoke_prod.sh` | Deploy pipeline | Container + health checks | <30s | Deploy logs |
| Adversarial drills | ✅ | N/A | ✅ | `scripts/adversarial_drills.sh` | `chaos.yml` | Drill evidence | Variable | CI artifacts |
| Install security scan | ✅ | ✅ | ✅ | `npm audit` / `cargo audit` | `ci.yml` → `security-scan` | Audit JSON | <30s | CI artifacts |
| SBOM generation | ✅ | ✅ | ✅ | N/A | `ci.yml` → `nightly-security` | `sbom.cdx.json` | <60s | CI artifacts |
| Quality gate | ✅ | ✅ | ✅ | `npx tsx packages/quality-os/src/cli.ts plan` | `quality-gate.yml` | Quality plan + evidence | <30s | CI artifacts |

## Test Gaps (none blocking Gate A)
- No automated compose-level integration test (start stack, verify networking)
- Smoke test only runs post-deploy on VPS (not in CI)
- No unit tests for shell scripts (acceptable for infrastructure module)
