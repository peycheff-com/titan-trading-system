# Titan Deployment Architecture

## Overview

The Titan Trading System uses a fully automated, atomic, and immutable deployment pipeline powered by GitHub Actions and Docker. The deployment strategy prioritizes safety (fail-closed), determinism (digest pinning), and auditability.

## Principles

1.  **Immutability**: Builds are performed once in CI. Artifacts are pushed to GHCR. Production pulls exact digests (e.g., `image@sha256:abc...`).
2.  **Atomicity**: Deployments use a "Release Directory" pattern (`/opt/titan/releases/<timestamp>-<sha>`). The active system is switched via a single symlink change (`/opt/titan/current`).
3.  **Single Source of Truth**: The `docker-compose.prod.yml` in the repository is the canonical definition. It is copied to the release directory. Secrets are injected via a stable `.env.prod` file on the host.
4.  **Verification**: Every deployment runs a `verify.sh` suite checking health, connectivity, and Policy Hash Parity before being marked successful. Failure triggers immediate automatic rollback.

## CI/CD Pipeline

The pipeline is defined in `.github/workflows/deploy-prod.yml`.

1.  **Build & Push**:
    *   Triggers on push to `main`.
    *   Builds all services in parallel using a matrix strategy.
    *   Pushes to GitHub Container Registry (GHCR).
    *   **Crucial Step**: Captures the exact SHA256 digest of the pushed image.
2.  **Artifact bundle**:
    *   Consolidates all digests into `digests.json`.
    *   Bundles `scripts/`, `docker-compose.prod.yml`, and `digests.json`.
3.  **Deploy (Droplet)**:
    *   SCP the bundle to a temporary directory on the droplet.
    *   Executes `deploy.sh`.

## Droplet Layout

Location: `/opt/titan`

```
/opt/titan/
├── releases/                  # Immutable release history
│   ├── 20260202T120000Z-abc1234/
│   │   ├── docker-compose.prod.yml
│   │   ├── compose.override.digest.yml  # Generated from digests.json
│   │   ├── scripts/
│   │   ├── evidence/
│   │   └── .env.prod -> ../../compose/.env.prod  # Symlinked secrets
├── current -> releases/2026... # Active release pointer
├── compose/
│   ├── .env.prod              # MASTER SECRETS FILE (Manually managed)
├── state/
│   ├── deploy.lock            # Flock file
│   └── last_known_good.json
└── logs/
```

## Deployment Logic (`deploy.sh`)

1.  Acquire lock (`flock`).
2.  Create new release directory.
3.  Generate `compose.override.digest.yml` using `digests.json` (Ensures we run exactly what CI built).
4.  Pull images.
5.  Run Database Migrations (using new image, but separate run).
6.  **Atomic Switch**: Update `current` symlink.
7.  `docker compose up -d` (Recreates containers with new config).
    *   Uses `COMPOSE_PROJECT_NAME=titan` to ensure continuity of persistent volumes (DB, Redis).
8.  Run `verify.sh`.
    *   Checks Health URLs.
    *   Checks Policy Hash Parity.
9.  **Failure Handling**: If any step fails, `rollback.sh` is invoked automatically.

## Rollback

Detailed in `RUNBOOK.md`.
Essentially:
1.  Verify failure.
2.  Identify previous release directory.
3.  Update `current` symlink to previous release.
4.  `docker compose up -d` (Restores old containers).
5.  Verify.
