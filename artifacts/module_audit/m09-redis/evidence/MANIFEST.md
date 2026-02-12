# Evidence Manifest - M09 Redis

> Verification of SOTA compliance via Code and Configuration.

## 1. Password Protection (Security)
- **Invariant**: Auth required.
- **Evidence Type**: Configuration
- **Location**: `docker-compose.prod.yml`
- **Snippet**:
```yaml
redis:
  image: redis:7.2.4-alpine3.19
  command: redis-server --requirepass ${REDIS_PASSWORD}
```
- **Status**: ✅ Verified

## 2. Persistence (Reliability)
- **Invariant**: AOF Enabled.
- **Evidence Type**: Configuration
- **Location**: `docker-compose.prod.yml`
- **Snippet**:
```yaml
command: redis-server ... --appendonly yes
```
- **Status**: ✅ Verified

## 3. Network Isolation (Security)
- **Invariant**: Not exposed publicly.
- **Evidence Type**: Configuration
- **Location**: `docker-compose.prod.yml`
- **Snippet**:
```yaml
networks:
  - titan-net
# No ports: section defined for host binding in prod
```
- **Status**: ✅ Verified
