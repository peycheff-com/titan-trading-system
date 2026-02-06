# Phase 0: Reality Scan - Repository Inventory
**Date:** 2026-02-06
**Commit:** 95a81430e347311e40e6e52c06d327e84884a6b3 (Baseline)

## 1. Component Inventory

### 1.1 Services (`services/`)
| Service | Language | Description | Ports | Status |
| :--- | :--- | :--- | :--- | :--- |
| `titan-brain` | TypeScript | Master Orchestrator & Risk Guardian. Active Inference. | 3100 | 🟢 Prod |
| `titan-execution-rs` | Rust | High-performance Order Engine. Actix, Redb. | 3002 | 🟢 Prod |
| `titan-phase1-scavenger` | TypeScript | Phase 1 Strategy (Trap/Scalp). | 8081 | 🟢 Prod |
| `titan-phase2-hunter` | TypeScript | Phase 2 Strategy (Holographic). | 8083 | 🟢 Prod |
| `titan-phase3-sentinel` | TypeScript | Phase 3 Strategy (Basis Arb). | 8084 | 🟢 Prod |
| `titan-ai-quant` | TypeScript | AI Parameter Refinement (Gemini). | 8082 | 🟢 Prod |
| `titan-powerlaw-lab` | TypeScript | Power Law research and offline analysis. | - | 🟡 Beta |
| `titan-console-api` | TypeScript | BFF for Console. | - | 🟢 Prod |
| `titan-opsd` | TypeScript | Operations Daemon. | - | 🟢 Prod |
| `canonical-powerlaw-service` | TypeScript | Legacy? Detailed check needed. | - | 🔴 Legacy |

### 1.2 Apps (`apps/`)
| App | Stack | Description | Status |
| :--- | :--- | :--- | :--- |
| `titan-console` | React/Vite | Operator Control Plane Dashboard. | 🟢 Prod |
| `titan-docs` | MkDocs | Documentation Site (implied by mkdocs.yml). | 🟢 Prod |

### 1.3 Shared Packages (`packages/`)
| Package | Description | Key Modules |
| :--- | :--- | :--- |
| `shared` | Core library (`@titan/shared`). | Schemas, Messaging, Config, Security. |
| `titan-backtesting` | Simulation engine. | Backtest loop, Exchange mocks. |
| `titan-harness` | Testing harness. | Integration tests. |

### 1.4 Infrastructure
- **Orchestration**: Docker Compose
  - `docker-compose.prod.yml` (Production)
  - `docker-compose.dev.yml` (Development)
  - `docker-compose.yml` (Base/Legacy)
- **Event Bus**: NATS JetStream (Ports 4222, 8222)
- **Database**: PostgreSQL 16 (Port 5432)
- **Cache**: Redis (Port 6379)
- **Proxy**: Traefik v3 (Ports 80, 443)
- **Observability**: Prometheus (9090), Grafana (3000), Tempo (3200)

## 2. Documentation Inventory

### 2.1 Core Documentation (`docs/`)
| Category | File | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Canonical** | `docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md` | ✅ High | The Gold Standard. Very robust. |
| **Entry** | `docs/START_HERE.md` | ✅ High | Good navigation hub. |
| **Root** | `README.md` | ✅ High | Excellent overview. |
| **Architecture** | `docs/ARCHITECTURE.md` | ⚠️ Incomplete | Present but needs expansion/validation. |
| **Ops** | `docs/DEPLOYMENT.md` | ⚠️ Overlap | Overlaps with `ops/` docs. |
| **Ops** | `docs/OPERATIONS.md` | ⚠️ Overlap | Overlaps with `ops/` docs. |
| **Ops** | `docs/runbooks/*.md` | ⚠️ Partial | Incident response exists. |
| **Reference** | `docs/reference/*.md` | ⚠️ Partial | Schema catalog exists. |

### 2.2 Coverage Map (Initial Assessment)

| Domain | Exists? | Quality | Critical Gaps |
| :--- | :--- | :--- | :--- |
| **Architecture** | ✅ | Medium | Needs granular service boundary docs. |
| **Dev Onboarding** | ✅ | Medium | scattered across `START_HERE` and `how-to`. |
| **Ops / Runbooks** | ✅ | Medium | Good `incident_response`, mostly manual. |
| **Security** | ⚠️ | Low | `SECURITY.md` is generic. Need specific Threat Model. |
| **Interfaces** | ⚠️ | Low | Schemas exist, but API/NATS catalogs are partial. |
| **Risk Policy** | ✅ | High | Well documented in canonical & code. |
| **Research** | ⚠️ | Medium | Workflow exists, but reproducibility checks need solidifying. |

## 3. Next Steps (Phase 1)
- Perform deep gap analysis per domain.
- Resolve "Dual Truth" issues (e.g. `DEPLOYMENT.md` vs `ops/*.md`).
- Identify missing specific operational runbooks.
