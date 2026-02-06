# Phase 1: Documentation Gap Analysis
**Date:** 2026-02-06

## 1. Executive Summary
The repository has a strong "Canonical Source of Truth" (`docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md`), but lacks a coherent middle layer of documentation. Operator runbooks are scattered and duplicative ("Dual Truth"). High-level architecture docs are skeletal. Interface contracts (NATS/HTTP) are implicit in code rather than explicit in docs.

## 2. Domain Analysis

### A. Architecture
| File | Status | Gap / Issue |
| :--- | :--- | :--- |
| `docs/ARCHITECTURE.md` | ❌ Stub (12 lines) | Needs full narrative: boundaries, data flow, ports, constraints. |
| `SYSTEM_SOURCE_OF_TRUTH.md` | ✅ Robust | Contains topology, but in tabular/reference format, not narrative. |
| **Missing** | `docs/canonical/ARCHITECTURE.md` | Essential for onboarding and explaining *why* things are this way. |

### B. Operations (High Friction)
| File | Status | Gap / Issue |
| :--- | :--- | :--- |
| `docs/DEPLOYMENT.md` | ⚠️ Duplicate | Content overlaps with `ops/DIGITALOCEAN_PRODUCTION_RUNBOOK.md`. |
| `docs/ops/DIGITALOCEAN_PRODUCTION_RUNBOOK.md`| ✅ Good | Best source, should be canonicalized to `ops/production_deploy.md`. |
| `docs/OPERATIONS.md` | ⚠️ Duplicate | Partial overlaps with `ops/PRODUCTION_ENV.md`. |
| **Missing** | `ops/backup_restore_dr.md` | Mentioned in checklists but no dedicated procedure. |
| **Missing** | `ops/observability.md` | Defining alerts and metrics thresholds. |

### C. Security
| File | Status | Gap / Issue |
| :--- | :--- | :--- |
| `SECURITY.md` | ⚠️ Generic | Standard GitHub security policy. Needs Titan-specific details. |
| **Missing** | `security/threat_model.md` | Explicit attack surfaces, mitigations, HMACS, ACLs. |
| **Missing** | `security/secrets_and_rotation.md` | Unified guide for Vault/Env/Mounts rotation. |

### D. Interfaces (The "Hidden" Truth)
| File | Status | Gap / Issue |
| :--- | :--- | :--- |
| `docs/contracts/nats-intent.md` | ⚠️ Theoretical | Needs to map to reality of `titan.cmd.*` subjects. |
| **Missing** | `reference/nats_subjects.md` | Catalog of all subjects, payloads, producers, consumers. |
| **Missing** | `reference/http_endpoints.md` | Catalog of all REST ports, auth methods, and paths. |
| **Missing** | `reference/database.md` | Schema overview, critical tables, retention policies. |

### E. Risk & Strategy
| File | Status | Gap / Issue |
| :--- | :--- | :--- |
| `packages/shared/risk_policy.json` | ✅ Code Truth | Excellent. |
| **Missing** | `risk/risk_policy.md` | Human-readable explanation of the policy logic. |
| **Missing** | `organism/phases.md` | Contracts for Phase 1/2/3 behavior and kill switches. |

## 3. The "Dual Truth" Problem (Immediate Fixes)
1. **Deployment**: `docs/DEPLOYMENT.md` vs `docs/ops/DIGITALOCEAN_PRODUCTION_RUNBOOK.md`.
   - **Resolution**: Merge into `docs/ops/production_deploy.md`. Redirect others.
2. **Operations**: `docs/OPERATIONS.md` vs `docs/ops/PRODUCTION_ENV.md`.
   - **Resolution**: Merge into `docs/ops/operations_runbook.md` and `docs/dev/configuration.md`.
3. **Reference**: `docs/contracts/` vs code schemas.
   - **Resolution**: Centralize in `docs/reference/`.

## 4. Prioritized Action Plan (Phase 2 & 3)
1. **Canonicalize**: Create `docs/canonical/` structure.
2. **Consolidate Ops**: Merge deployment/ops docs into single authoritative runbooks.
3. **Draft Architecture**: Write the narrative architecture doc.
4. **Catalog Interfaces**: Generate/Write the NATS and HTTP catalogs.
