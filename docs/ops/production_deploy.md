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
1.  **Build**: `docker build -t titan-brain .`
2.  **Configure**: Set env vars (see `SYSTEM_SOURCE_OF_TRUTH.md`).
3.  **Run**: `docker run -p 3000:3000 --env-file .env titan-brain`

## 4. Verification
- curl `/health` to verify `UP`.
- Check logs for "Platform Adapter: [Name]".
