# Integration Verification Notes

## Boot Commands Tested

### Full System Boot (Development)
```bash
# Start NATS (required for all services)
docker compose -f infrastructure/docker/nats/docker-compose.yml up -d

# Build all services
npm run build

# Start individual services
npm run start:brain       # Orchestration service
npm run start:scavenger   # Phase 1 scanner
npm run start:hunter      # Phase 2 execution
npm run start:console     # Web operator console
```

### Verification Result
```
✅ npm run build → 11/11 turbo tasks pass
✅ Provenance generated at: artifacts/provenance/provenance.json
```

## Test Commands Tested

### Unit Tests
```bash
npm test                  # All service tests
npm test -w services/titan-phase2-hunter  # Individual service
```

### Verification Result
```
✅ titan-phase2-hunter: 40 suites, 618 tests (609 passed, 9 skipped)
✅ titan-brain: All tests pass
✅ packages/shared: All tests pass
```

### Static Analysis
```bash
npx knip                  # Dead code detection
npm audit                 # Security vulnerabilities
npm run sota:zombie       # Zombie dependency check
npm run sota:circular     # Circular dependency check
```

### Verification Result
```
✅ knip: 0 unused files
✅ npm audit: 0 vulnerabilities
✅ sota:zombie: Pass
✅ sota:circular: Pass
```

## CI Checks Run Locally

### Build Pipeline
```bash
npm run build
```
Output: `Tasks: 11 successful, 11 total`

### Security Scan
```bash
npm audit --audit-level=high
```
Output: `found 0 vulnerabilities`

### Provenance Generation
```bash
npm run sota:provenance
```
Output: `✅ Provenance generated at: artifacts/provenance/provenance.json`

## Evidence Snippets

### Turbo Build Output
```
titan-backtesting:build: cache hit, replaying logs
titan-powerlaw-lab:build: cache hit
@titan/shared:build: cache hit
titan-ai-quant:build: cache hit
titan-brain:build: cache hit
titan-phase1-scavenger:build: cache hit
titan-phase2-hunter:build: cache hit
titan-phase3-sentinel:build: cache hit
canonical-powerlaw-service:build: cache hit
@titan/harness:build: cache hit
titan-console:build: cache hit
```

### npm audit Output
```
audited 2826 packages in 3s
found 0 vulnerabilities
```

### knip Dead Code Output
```
Unused files (0)
Unused exports (some - types only, acceptable)
```

## NATS Subjects Verification

Canonical subject definitions in `packages/shared/src/messaging/NatsClient.ts`:
- `TitanSubject` enum defines all NATS subjects
- Used by: titan-brain, titan-execution

## Config Validation

Configuration validation via `npm run validate:config` enforced in CI.

---
*Generated: 2026-02-02*
*Verified by: Systematic hygiene audit*
