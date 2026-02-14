# Production Deployment Guide

> **Status**: SOTA (State of the Art)
> **Target**: Cloud Agnostic (DigitalOcean, Railway, AWS, etc.)

## 1. Principles

- **Container First**: All services run as Docker containers.
- **Environment Driven**: Configuration via 12-factor environment variables.
- **Zero Trust**: Services do not trust the network; all inter-service comms are authenticated.

## 2. Supported Platforms

The system adapts to its environment via the `PlatformFactory`:

### DigitalOcean (Recommended)

- **Type**: Docker Droplet or App Platform.
- **Config**: Standard `docker-compose.yml`.
- **Networking**: Host networking or Bridge.

### Generic Cloud (Railway, Heroku, Render)

- **Type**: PaaS / Cloud Native.
- **Detection**: Automatically detects `PORT` and environment signals (e.g., `RAILWAY_ENVIRONMENT`).
- **Networking**: Binds to `0.0.0.0` on the assigned `PORT`.

## 3. Deployment Steps

### Production

1. **Build**: `docker build -t titan-brain .`
2. **Configure**: Set env vars (see `system-source-of-truth.md`).
3. **Run**: `./scripts/ops/deploy_prod.sh`

### Staging (Micro-Capital)

Uses `docker-compose.micro.yml` — optimised for $50–$100 test deployment with minimal resources.

1. **Deploy**: `./scripts/ops/deploy_staging.sh`
2. **Required Env Vars** (or defaults applied):
   - `HMAC_SECRET` — HMAC signing key (defaults to staging placeholder)
   - `SAFETY_SECRET` — Safety session key (defaults to staging placeholder)
   - `BINANCE_API_KEY` / `BINANCE_API_SECRET` — Exchange credentials
   - `BYBIT_API_KEY` / `BYBIT_API_SECRET` — Exchange credentials
   - `POSTGRES_PASSWORD` — Database password (defaults to `password`)
3. **Services**: postgres, redis, nats, titan-brain, titan-execution, titan-scavenger, titan-hunter, titan-sentinel

## 4. Verification

- curl `/health` to verify `UP`.
- `docker ps` — all titan containers should show `healthy` or `Up`.
- Check logs for "Platform Adapter: [Name]".
