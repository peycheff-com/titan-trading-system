# Titan Production Runbook

## CI/CD Deployment Failure

If a deployment fails, the pipeline will mark the job as failed. `scripts/ci/deploy.sh` will initiate an **automatic rollback**.

### To Investigate:
1.  Check GitHub Actions run logs.
2.  SSH into droplet: `ssh titan-deploy@<IP>`
3.  Check deployment logs: `/opt/titan/logs/deploy.log` and `deploy-<timestamp>.log`.
4.  Check container logs: `docker compose logs --tail=100`

### Common Causes:
1.  **Migration Failure**: Database migration failed. Check `titan-brain` logs.
2.  **Health Verification**: Services didn't start in time. Check `docker compose ps` and `titan-brain` health.
3.  **Policy Hash Parity**: Brain and Execution policy mismatch. Check logs for "Policy hash handshake".

## Manual Deployment

To trigger a deployment manually (bypass CI or run a specific SHA):

1.  SSH into droplet.
    ```bash
    ssh titan-deploy@<IP>
    ```
2.  Navigate to titan root.
    ```bash
    cd /opt/titan
    ```
3.  Identify the SHA you want to deploy (or `latest`).
    *   Ideally, use CI artifacts.
    *   If you must pull fresh: Ensure `.env.prod` is valid.
4.  Run deployment script (if you have the artifact package locally):
    ```bash
    # This requires the deployment package structure (scripts, compose, evidence)
    # usually downloaded from GH Actions artifacts.
    # To re-deploy CURRENT installed scripts:
    /opt/titan/scripts/deploy.sh <SHA>
    ```

## Manual Rollback

If automatic rollback failed or you need to revert to a specific version manually:

1.  SSH into droplet.
2.  List releases:
    ```bash
    ls -l /opt/titan/releases/
    ```
3.  Identify the target release directory (e.g., `20240101-abcdef`).
4.  Run rollback script:
    ```bash
    /opt/titan/scripts/rollback.sh
    ```
    *   Or manually:
        ```bash
        ln -sfn /opt/titan/releases/<target-dir> /opt/titan/current
        cd /opt/titan/current
        docker compose up -d --remove-orphans
        ```

## Rotating Secrets

1.  Edit the master secrets file:
    ```bash
    nano /opt/titan/compose/.env.prod
    ```
2.  Restart containers to pick up changes:
    ```bash
    cd /opt/titan/current
    docker compose up -d
    ```

## Registry Credentials

Registry credentials (GHCR) are stored in `~/.docker/config.json` for the `titan-deploy` user.
To rotate:
1.  Generate new PAT (Personal Access Token) with `read:packages` scope.
2.  On droplet:
    ```bash
    docker login ghcr.io -u <USERNAME> -p <NEW_TOKEN>
    ```

## Evidence Logs

Deployment evidence is stored in:
1.  `/opt/titan/releases/<id>/evidence/` (digests.json)
2.  `/opt/titan/logs/deploy.log` (Global log)
3.  GitHub Actions Artifacts (Zipped evidence bundle)
