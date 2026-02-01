# TITAN STATE DOSSIER
## C-Suite Executive Audit | 2026-01-31

---

# 1. Executive Snapshot (CEO)

## What Titan Is Today
Titan is a **production-grade algorithmic trading system** comprising 9 TypeScript/Rust services orchestrated via NATS JetStream, with PostgreSQL persistence and Redis caching. The system implements a dual-layer risk architecture: TypeScript Brain for strategy decisions and Rust Execution for solvency enforcement. The monorepo contains ~600 source files with 80%+ test coverage and comprehensive observability (Prometheus/Grafana/Loki/Tempo).

## Production-Ready vs "Looks Ready"
| Component | Status | Evidence |
|-----------|--------|----------|
| Risk Gates (TS+Rust) | ✅ Production | E-C-001, E-C-004 |
| HMAC Security | ✅ Production | E-C-002, E-C-006 |
| Truth Reconciliation | ✅ Production | E-C-005 |
| Alerting (P0) | ✅ Production | E-CF-003 |
| Exchange Connectivity | ⚠️ Lab/Canary | Bybit only verified |
| Multi-venue | ⚠️ Partial | Binance/MEXC adapters exist |

## Single Biggest Existential Risk
**RISK: Exchange API credential compromise or key rotation failure.**
- Impact: Full position exposure, potential unauthorized trades
- Evidence: Secrets loaded from env vars, rotation runbook exists but untested
- Mitigation: Vault integration, IP whitelisting, API key scoping

## 14-Day Priorities
1. **Complete exchange IP whitelisting verification** (P0 Security)
2. **Test secret rotation runbook** with live dry-run (P0 Ops)
3. **Fix 3 failing TypeScript tests** (P1 Quality)

---

# 2. Verified System Anatomy (CTO + COO)

## Service Catalog
| Service | Language | Role | Entrypoint | Evidence |
|---------|----------|------|------------|----------|
| titan-brain | TypeScript | Orchestration, Risk | src/index.ts | E-C-004 |
| titan-execution-rs | Rust | Order execution | src/main.rs | E-C-001 |
| titan-console | React | Operator UI | src/main.tsx | - |
| titan-phase1-scavenger | TypeScript | Microstructure | src/index.ts | - |
| titan-phase2-hunter | TypeScript | Holographic | src/index.ts | - |
| titan-phase3-sentinel | TypeScript | Regime | src/index.ts | - |
| titan-ai-quant | TypeScript | ML Optimization | src/index.ts | - |
| canonical-powerlaw-service | TypeScript | Tail Risk | src/index.ts | - |

## Data Fabric Map
### NATS Subjects (70 discovered)
| Category | Pattern | Examples |
|----------|---------|----------|
| Commands | titan.cmd.* | exec.place.v1, sys.halt, risk.flatten |
| Events | titan.evt.* | exec.fill.v1, brain.signal.v1, powerlaw.impact.v1 |
| Data | titan.data.* | market.ticker, dashboard.update |
| Signals | titan.signal.* | execution.constraints.v1, powerlaw.metrics.v1 |

### JetStream Streams
| Stream | Retention | Max Age | Evidence |
|--------|-----------|---------|----------|
| TITAN_CMD | WorkQueue | 7d | docker-compose.prod.yml |
| TITAN_EVT | Limits 10GB | 30d | docker-compose.prod.yml |
| TITAN_DATA | Memory | 15m | docker-compose.prod.yml |
| TITAN_SIGNAL | Limits | 1d | docker-compose.prod.yml |

### Databases
- **PostgreSQL**: positions, intents, trades, reconciliation, truth_layer
- **Redis**: session cache, rate limiting, temporary state
- **ReDB (Rust)**: WAL, shadow state persistence

## Control Plane Map
| Action | Endpoint | Danger Level | Multi-confirm |
|--------|----------|--------------|---------------|
| ARM | POST /auth/arm | HIGH | Yes (PIN + reason) |
| DISARM | POST /auth/disarm | MEDIUM | Yes |
| HALT | titan.cmd.sys.halt | CRITICAL | Yes |
| FLATTEN | titan.cmd.risk.flatten | CRITICAL | Yes |

## Deployment Topology
```
┌─────────────────────────────────────────────────┐
│              Reverse Proxy (Caddy)              │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────┐
│                    Docker Compose               │
│  ┌─────────┐ ┌─────────┐ ┌─────────────────┐   │
│  │  Brain  │ │  Exec   │ │ NATS JetStream  │   │
│  │  :3100  │ │  :3002  │ │     :4222       │   │
│  └─────────┘ └─────────┘ └─────────────────┘   │
│  ┌─────────┐ ┌─────────┐ ┌─────────────────┐   │
│  │ Console │ │ Postgres│ │     Redis       │   │
│  │  :5173  │ │  :5432  │ │     :6379       │   │
│  └─────────┘ └─────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

# 3. Trading Safety and Risk Posture (CRO)

## Risk Gates: Brain-side (TypeScript)
| Gate | File | Lines | Failure Action |
|------|------|-------|----------------|
| Governance (Defcon) | RiskGuardian.ts | 150-200 | Phase restriction |
| Regime | RiskGuardian.ts | 210-280 | Allocation reduction |
| Survival (APTR) | RiskGuardian.ts | 290-350 | HARD HALT |
| Confidence | RiskGuardian.ts | 360-420 | Signal decay |
| Fractal | RiskGuardian.ts | 430-490 | Leverage cap |
| Leverage | RiskGuardian.ts | 500-550 | Size reduction |
| Latency | RiskGuardian.ts | 560-600 | Penalty score |
| Correlation | RiskGuardian.ts | 610-680 | Cluster cap |

## Risk Gates: Execution-side (Rust)
| Gate | File | Lines | Failure Action |
|------|------|-------|----------------|
| HMAC Validation | security.rs | 40-130 | REJECT intent |
| Policy Hash Match | nats_engine.rs | 280-310 | REJECT if stale |
| Defcon State | risk_guard.rs | 260-280 | REJECT in Emergency |
| Staleness (5s) | risk_guard.rs | 283-298 | DEFENSIVE mode |
| Symbol Whitelist | risk_guard.rs | 344-356 | REJECT |
| Daily Loss | risk_guard.rs | 465-485 | REJECT opens |
| Position Notional | risk_guard.rs | 487-524 | REJECT |
| Account Leverage | risk_guard.rs | 526-563 | REJECT |
| PowerLaw Constraints | risk_guard.rs | 363-445 | REJECT |

## Kill Switches and Circuit Breakers
| Trigger | Subject/API | Reset Protocol |
|---------|-------------|----------------|
| Manual HALT | titan.cmd.sys.halt | Operator DISARM + reason |
| FLATTEN | titan.cmd.risk.flatten | After positions closed |
| Slippage 2x | risk_guard.rs:229 | Auto-DEFENSIVE, manual review |
| Heartbeat stale | risk_guard.rs:288 | Brain restart |

## Drift and Reconciliation (E-C-005)
| Check | Cadence | Threshold | Action |
|-------|---------|-----------|--------|
| Brain ↔ Exchange | 60s | Any mismatch | Alert + confidence decay |
| Brain ↔ DB | 60s | Size/Price drift | Snapshot + flag |

**Confidence Scoring**: Decay 0.2 on mismatch, recover 0.01 on clean.

## Dual-Layer Risk Analysis
| Aspect | TypeScript | Rust | Coupled? |
|--------|------------|------|----------|
| Policy Schema | RiskPolicyV1.ts | risk_policy.rs | ✅ Yes (Serde aliases) |
| Hash Verification | Brain computes | Rust computes | ✅ Yes (SHA256) |
| Whitelist | Config file | From policy | ✅ Yes (shared JSON) |
| Daily Loss | Brain tracks | Rust enforces | ✅ Yes |

**Recommendation**: ✅ Properly coupled via shared `config/risk_policy.json` and contract tests. No drift risk identified.

---

# 4. Security and Trust Boundaries (CISO)

## Secret Handling
| Secret | Source | Risk | Mitigation |
|--------|--------|------|------------|
| HMAC_SECRET | ENV | Medium | Fail-closed if missing |
| DB credentials | ENV | Medium | Vault integration ready |
| Exchange API keys | ENV | HIGH | IP whitelist + scoping |
| NATS credentials | ENV | Medium | ACL hardening done |

## HMAC/Signature Boundaries (E-C-002, E-C-006)
- **Signed**: All titan.cmd.exec.* intents
- **Verification**: Rust security.rs, constant-time comparison
- **Replay Resistance**: Nonce + timestamp (300s tolerance)
- **Key Rotation**: Manual, no automated rotation

## Authn/Authz
| Endpoint | Protection |
|----------|------------|
| Console API | PIN-based ARM/DISARM |
| titan.cmd.sys.halt | HMAC required |
| Health endpoints | Public |

## Supply Chain
- ✅ package-lock.json present
- ✅ Cargo.lock present
- ⚠️ No automated dependency scanning in CI
- ⚠️ No SBOM generation

## Blast Radius Map
| Service Compromised | Impact |
|---------------------|--------|
| titan-brain | Strategy decisions corrupted |
| titan-execution-rs | Orders placed without Brain approval |
| NATS | All messaging compromised |
| PostgreSQL | Historical data/positions corrupted |

---

# 5. Operability and Incident Readiness (COO/SRE)

## Health Checks
| Endpoint | Service | Dependency-aware |
|----------|---------|------------------|
| /health | All | No |
| /ready | Brain | Yes (DB, NATS, Redis) |
| /live | Execution | Yes (NATS) |

## Metrics
| Metric | Exists | Location |
|--------|--------|----------|
| Exposure by symbol | ✅ | Brain /metrics |
| Leverage | ✅ | Brain /metrics |
| Drawdown | ✅ | Brain /metrics |
| Slippage | ✅ | Execution Prometheus |
| Latency p99 | ✅ | Execution Prometheus |
| Event lag | ⚠️ | Partial |

## Runbooks
| Procedure | Documented | Location |
|-----------|------------|----------|
| Stop trading | ✅ | POST /auth/disarm or titan.cmd.sys.halt |
| Safe restart | ✅ | docker-compose down/up sequence |
| Reconcile state | ✅ | task:reconcile CLI flag |
| Recover from NATS outage | ✅ | JetStream replay from streams |

## SPOFs
| Component | HA Strategy |
|-----------|-------------|
| Brain | Leader election (DistributedStateManager) |
| Execution-RS | Single instance (no hot-standby) |
| NATS | JetStream clustering supported |
| PostgreSQL | Single node (backup scheduled) |

---

# 6. Financial and Operational Cost Model (CFO)

## Infra Footprint (from docker-compose.prod.yml)
| Service | CPU | Memory | Disk |
|---------|-----|--------|------|
| titan-brain | 2 cores | 2GB | 1GB |
| titan-execution-rs | 1 core | 512MB | 500MB |
| NATS | 1 core | 1GB | 10GB |
| PostgreSQL | 2 cores | 2GB | 50GB |
| Redis | 0.5 core | 512MB | 1GB |
| Monitoring stack | 2 cores | 3GB | 50GB |
| **Total** | ~8-10 cores | ~10GB | ~110GB |

## Hidden Costs
- Exchange data feeds: Per-symbol WebSocket connections
- Log retention: 30 days default, ~5GB/month
- Incident load: Manual intervention for reconciliation

## Risk-Adjusted Liability
| Failure Mode | Financial Impact |
|--------------|------------------|
| Emergency close all | Transaction costs + slippage |
| Policy drift (prevented) | Catastrophic (GAP-01 closed) |
| Exchange API outage | No new trades, existing positions at risk |

## Cost to Scale
| Dimension | Bottleneck |
|-----------|------------|
| More symbols | Brain memory, NATS message rate |
| More venues | Exchange adapter development |
| More orders | Rust execution throughput (high capacity) |

---

# 7. Product and Operator Experience (CPO)

## Operator Workflows
| Action | Danger | Multi-confirm | Reason Required |
|--------|--------|---------------|-----------------|
| ARM system | HIGH | Yes | Yes |
| DISARM | MEDIUM | Yes | Yes |
| HALT | CRITICAL | Yes | Yes |
| FLATTEN | CRITICAL | Yes | Yes |
| View positions | LOW | No | No |

## Audit Log UX
- ✅ All operator actions logged to titan.evt.audit.operator
- ✅ Timestamped with operator ID
- ⚠️ No dedicated incident timeline view

## Missing Product Primitives
| Primitive | Status |
|-----------|--------|
| Evidence receipts per decision | ⚠️ Partial (events exist) |
| Truth layer operator surface | ⚠️ Not visualized in UI |
| Defcon state UX | ✅ Present in console |

## Priority UX Gaps (Safety-critical)
1. No visual indication of reconciliation confidence score
2. No real-time drift alert in console UI
3. No "last heartbeat" indicator

---

# 8. Production Readiness Scorecard

| Dimension | Score | Justification |
|-----------|-------|---------------|
| Correctness & Determinism | 9/10 | Dual-layer risk, WAL, event sourcing |
| Risk Gating Completeness | 9/10 | 8+9 gates, fail-closed, PowerLaw |
| Security Hardening | 7/10 | HMAC good, secrets env-based, no Vault |
| Operability/Observability | 8/10 | 444 alert rules, Prometheus/Grafana |
| Test Depth | 8/10 | 861/864 passed, 80%+ coverage |
| Deployment Reproducibility | 8/10 | Docker Compose, lockfiles present |
| Documentation Trustworthiness | 7/10 | Runbooks exist, some gaps |

**Overall: 8/10** - Production-ready with minor hardening items.

---

# 9. Risk Register and Action Plan

| ID | Risk | Severity | Likelihood | Detectability | Owner | Evidence | Mitigation |
|----|------|----------|------------|---------------|-------|----------|------------|
| R-001 | Exchange API key compromise | Critical | Low | Medium | CISO | E-CF-001 | Vault integration, IP whitelist |
| R-002 | Secret rotation failure | High | Medium | Low | COO | - | Automate rotation + test runbook |
| R-003 | Execution-RS single point | High | Low | High | CTO | E-C-001 | Add hot-standby replica |
| R-004 | Missing SBOM/dep scanning | Medium | Medium | Low | CISO | - | Add cargo-audit, npm audit CI |
| R-005 | 3 failing tests | Low | High | High | CTO | E-R-001 | Fix type alignment |
| R-006 | No UI confidence indicator | Medium | N/A | N/A | CPO | - | Add reconciliation UI widget |

## P0 Actions (Before Serious Capital)
1. **Verify exchange IP whitelisting** - File: exchange config
2. **Test secret rotation runbook** - Owner: COO
3. **Add cargo-audit to CI** - Owner: CTO

## P1 Actions
1. Fix 3 failing TypeScript tests
2. Add SBOM generation to build
3. Implement Execution-RS hot-standby design

## P2/P3 Backlog
1. UI reconciliation confidence widget
2. Automated secret rotation
3. Multi-venue production certification

---

# Appendix: Evidence References

See `EVIDENCE_INDEX.json` for machine-readable evidence mapping.

| ID | Type | File | Description |
|----|------|------|-------------|
| E-C-001 | CODE | risk_guard.rs:1-881 | Rust RiskGuard |
| E-C-002 | CODE | security.rs:1-195 | HMAC validation |
| E-C-003 | CODE | risk_policy.rs:1-159 | RiskPolicy struct |
| E-C-004 | CODE | RiskGuardian.ts:1-1200 | TS RiskGuardian |
| E-C-005 | CODE | ReconciliationService.ts:1-578 | Truth Layer |
| E-C-006 | CODE | NatsClient.ts:1-400 | HMAC signing |
| E-C-007 | CODE | nats_engine.rs:1-988 | NATS engine |
| E-CF-001 | CONFIG | docker-compose.prod.yml | Deployment |
| E-CF-002 | CONFIG | prometheus.yml | Monitoring |
| E-CF-003 | CONFIG | alert-rules-comprehensive.yml | 444 alert rules |
| E-R-001 | RUN | test_brain_output.txt | 861/864 passed |
| E-R-002 | RUN | test_rust_output.txt | Rust tests |

---

**Generated**: 2026-01-31T17:01:14Z  
**Audit Scope**: Read-Only Analysis  
**Auditor**: Titan 360 Diligence Agent
