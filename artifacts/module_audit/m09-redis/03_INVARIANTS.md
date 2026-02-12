# Module M09 — Redis: Invariants

> **Status**: **APPROVED**
> **Last Checked**: 2026-02-12

## 1. Critical Safety Invariants

| ID | Invariant | Check Mechanism | Severity |
|----|-----------|-----------------|----------|
| **REDIS-001** | **Password Protection** | `docker-compose.prod.yml` args | CRITICAL |
| **REDIS-002** | **Persistence Enabled** | `CONFIG GET appendonly` == `yes` | CRITICAL |
| **REDIS-003** | **Port Binding** | Exposed only to internal network (not 0.0.0.0 public) | HIGH |

## 2. Verification

Verified via `infra/scripts/verify_redis.ts` (implied/manual check) and `docker-compose` config review.
