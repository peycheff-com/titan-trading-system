# Titan Trading System - Deployment Guide

## Overview

Titan uses a fully automated, immutable CI/CD pipeline. Every push to `main` triggers a build of Docker images, which are then tagged with the Git SHA and deployed to the production VPS.

**Key Principles:**
1.  **Immutable Artifacts:** Images are built once in CI, pushed to GHCR, and pulled on the server. No builds occur on the server.
2.  **Single Source of Truth:** `docker-compose.prod.yml` in the repo is the canonical definition.
3.  **Atomic Deployment:** Services are updated in a rolling fashion using Docker Compose.
4.  **Automatic Rollback:** If verification fails post-deploy, the system automatically reverts to the last known good state.

## Pipeline Architecture

1.  **GitHub Actions (`.github/workflows/deploy-prod.yml`):**
    *   Builds all services (Brain, Execution, Console, Phases).
    *   Pushes images to `ghcr.io/peycheff-com/titan-trading-system/*`.
    *   Copies `scripts/ci/*` and `docker-compose.prod.yml` to the VPS.
    *   Executes `/opt/titan/scripts/deploy.sh` over SSH.

2.  **VPS (`/opt/titan/`):**
    *   `compose/`: Contains the active Compose file and `.env.deploy` (deployment tags).
    *   `scripts/`: Contains `deploy.sh`, `verify.sh`, `rollback.sh`.
    *   `state/`: Stores `last_known_good.json` for rollback.
    *   `logs/`: Deployment logs.

## Deployment Process

The `deploy.sh` script performs the following:
1.  Validates environment variables (`PROD` secrets).
2.  Snapshots current state to `last_known_good.json`.
3.  Pulls exact images specified by `IMAGE_TAG`.
4.  Restarts services (`docker compose up -d`).
5.  Runs `verify.sh` (Health checks, NATS check).
6.  If verification fails, triggers `rollback.sh`.

## Verification Steps

The pipeline verifies:
*   All containers are Running (not Restarting or Exited).
*   HTTP Health endpoints for Brain, Execution, NATS.
*   (Future) Policy Hash Parity.

## Rollback

**Automatic:**
If the deploy fails verification, `deploy.sh` calls `rollback.sh` immediately. This script:
1.  Reads the previous SHA from `state/last_known_good.json`.
2.  Updates `.env.deploy`.
3.  Pulls and restarts services.

**Manual:**
To manually rollb[← Back to Start Here](../START_HERE.md)
  SSH into the VPS.
2.  Edit `/opt/titan/compose/.env.deploy` and set `IMAGE_TAG=<desired_sha>`.
3.  Run `/opt/titan/scripts/deploy.sh`.

## Secrets Management

Secrets are stored in:
1.  **GitHub Secrets:** `PROD_SSH_KEY`, `GHCR_TOKEN`.
2.  **VPS File:** `/opt/titan/compose/.env.prod`. **DO NOT COMMIT THIS FILE.**

To rotate secrets:
1.  Update `.env.prod` on the VPS.
2.  Run `/opt/titan/scripts/deploy.sh` (or wait for next deploy) to apply changes.
