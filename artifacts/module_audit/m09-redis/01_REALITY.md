# M09 Redis - Reality

> **Capture Date**: 2026-02-11
> **Status**: Initial Capture

## 1. Infrastructure Reality
- **Docker Image**: `redis:7.2.4-alpine3.19`
- **Config File**: `config/redis-secure.conf`
- **Volume**: `redis_data:/data`
- **Port**: 6379 (exposed)
- **Auth**: `requirepass ${REDIS_PASSWORD}` (Env var driven)
- **Hardening**:
    - Hazardous commands renamed/disabled (`FLUSHDB`, `KEYS`, `CONFIG`, `SHUTDOWN`, `DEBUG`, `EVAL`).
    - `protected-mode yes`
    - `appendonly yes` (AOF enabled)

## 2. Client Reality (Titan Brain)
### A. FeatureStoreClient (`src/ml/FeatureStoreClient.ts`)
- **Lib**: `ioredis`
- **Pattern**: Direct key-value storage (`set`, `get`).
- **Key Schema**: `titan:features:<featureName>`
- **Serialization**: `JSON.stringify` / `JSON.parse`
- **Error Handling**: Try-catch blocks logging errors to `Logger`.
- **Issues**:
    - Usage of `any` type for Redis client.
    - No explicit retry logic visible in client wrapper (relies on `ioredis` defaults).
    - No explicit timeout configuration in constructor.

### B. BayesianCalibrator (`src/features/Risk/BayesianCalibrator.ts`)
- **Lib**: `ioredis`
- **Pattern**: Hash storage (`hset`, `hgetall`).
- **Key Schema**: `bayesian:stats` (Hash) -> `trapType` (Field)
- **Serialization**: JSON in Hash values.
- **Issues**:
    - `private redis: Redis | null = null` with explicit `process.env.REDIS_URL` check inside class (should perform dependency injection).
    - `loadStats` is fire-and-forget in constructor (creates race condition on startup).
    - Hardcoded key `bayesian:stats`.

### C. ConfigSchema (`src/config/ConfigSchema.ts`)
- **Validation**: Zod schema.
- **Defaults**: `redis://localhost:6379`, 3 retries, 1000ms delay.
- **Regex**: `^redis:\/\/` validation.

## 3. Gap Analysis (Vs Gate A)
- [ ] **Dependency Injection**: `BayesianCalibrator` instantiates Redis directly from env vars, violating DI principles.
- [ ] **Type Safety**: `FeatureStoreClient` uses `any` for the Redis instance.
- [ ] **Startup Safety**: `BayesianCalibrator` loads stats asynchronously in constructor without `await`, risking uninitialized state usage.
- [ ] **Connection Management**: Clients should likely share a connection pool or manager rather than creating ad-hoc connections.
- [ ] **Observability**: Metrics (latency, hit rate) are missing from client wrappers.
