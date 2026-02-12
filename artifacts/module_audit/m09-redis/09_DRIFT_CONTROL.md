# Module M09 — Redis: Drift Control

> **Status**: **APPROVED**
> **Last Checked**: 2026-02-12

## 1. Config Management

- **Docker Compose**: Version controlled.
- **Env Vars**: Validated by `validate_prod_env.sh`.

## 2. Updates

- **Image**: Pinned to `redis:7.2.4-alpine3.19`.
- **Process**: Manual image bump + PR.

## 3. Verification

- **Script**: `infra/scripts/verify_redis.ts` (Planned).
