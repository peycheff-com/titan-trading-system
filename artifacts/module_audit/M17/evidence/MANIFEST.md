# Evidence Manifest - M17 Deployment & Infrastructure

> Verification of SOTA compliance via code and configuration audit.

## 1. CI/CD Pipeline
- **Invariant**: Deploy triggers on CI pass for main branch
- **Evidence Type**: Workflow Reference
- **Location**: `.github/workflows/deploy-prod.yml`
- **Snippet**:
```yaml
on:
  workflow_run:
    workflows: ['Titan Monorepo CI']
    types: [completed]
    branches: [main]
```
- **Status**: ✅ Verified

## 2. Release Signing
- **Invariant**: Release digests are signed before deploy
- **Evidence Type**: Workflow Step
- **Location**: `.github/workflows/deploy-prod.yml` → `Sign Release Manifest`
- **Status**: ✅ Verified

## 3. NATS ACL Isolation
- **Invariant**: Service accounts have least-privilege publish/subscribe
- **Evidence Type**: Config File
- **Location**: `config/nats.conf`
- **Status**: ✅ Verified — 8 accounts with per-service permissions

## 4. Docker Image Pinning (post-remediation)
- **Invariant**: All compose files use pinned image tags
- **Evidence Type**: Code Diff
- **Location**: `docker-compose.dev.yml` — NATS `latest` → `2.10.22-alpine`
- **Status**: ✅ RESOLVED

## 5. Redis Auth in Production (post-remediation)
- **Invariant**: Redis requires authentication in all environments
- **Evidence Type**: Code Diff
- **Location**: `docker-compose.prod.yml` — added `--requirepass ${REDIS_PASSWORD}`
- **Status**: ✅ RESOLVED

## 6. Prod Healthchecks (post-remediation)
- **Invariant**: All services have Docker healthchecks
- **Evidence Type**: Code Diff
- **Location**: `docker-compose.prod.yml` — added healthchecks to 5 services
- **Status**: ✅ RESOLVED

## 7. Postgres Version Consistency (post-remediation)
- **Invariant**: Consistent postgres version across compose files
- **Evidence Type**: Code Diff
- **Location**: `docker-compose.dev.yml`, `docker-compose.micro.yml` — `15-alpine` → `16-alpine`
- **Status**: ✅ RESOLVED
