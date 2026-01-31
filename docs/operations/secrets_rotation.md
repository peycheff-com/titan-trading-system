# Secrets Management & Rotation Runbook

## Overview
This runbook describes the procedures for managing and rotating sensitive secrets in the Titan Trading System, ensuring zero downtime and maintaining security compliance.

## Secret Categories
1.  **HMAC Secrets**: Used for verifying payload integrity between Brain, Execution, and Phase services.
    - **Rotation**: Zero-downtime rotation enabled via Key IDs.
    - **Frequency**: Every 90 days.
2.  **Service Credentials**: Database passwords, Redis passwords, NATS credentials.
    - **Rotation**: Requires rolling restart.
    - **Frequency**: Every 180 days (or upon compromise).
3.  **API Keys**: Exchange API keys (Bybit, MEXC, etc.).
    - **Rotation**: Dependent on exchange policies.
    - **Frequency**: Every 90 days recommended.

## Rotation Procedures

### 1. Rotating HMAC Secrets (Zero Downtime)
Titan supports multiple valid HMAC secrets during a transition period.

**Phase 1: Add New Secret**
1. Generate new secret: `openssl rand -hex 32`
2. Update configuration (e.g., Vault, K8s Secret):
   - `TITAN_HMAC_SECRET_PRIMARY=<new_secret>`
   - `TITAN_HMAC_SECRET_SECONDARY=<old_secret>`
   - `TITAN_HMAC_KEY_ID=<new_key_id>`
3. Deploy changes to **listeners** (Execution, Sentinel) first.
   - Services will accept signatures from both Primary and Secondary secrets.
4. Deploy changes to **signers** (Brain) last.
   - Brain will start signing with the new Primary secret.

**Phase 2: Deprecate Old Secret**
1. Wait 24 hours to ensure all in-flight messages are processed.
2. Remove `TITAN_HMAC_SECRET_SECONDARY`.
3. Redeploy all services.

### 2. Rotating Database/NATS Credentials (Rolling Restart)
1. Provision new credentials in the infrastructure (AWS RDS, NATS Server).
2. Update `*_FILE` secrets (e.g., `/run/secrets/db_password`).
   - If using K8s/Docker Swarm, update the Secret object.
3. Perform a rolling restart of all services.
   - `titan-brain`, `titan-execution-rs`, etc.
   - Services will pick up the new file content on startup via `loadSecretsFromFiles()`.

### 3. Rotating Exchange API Keys
1. Generate new API keys on the Exchange Dashboard.
2. Update the secret store (Vault/Secrets Manager).
3. Restart `titan-execution-rs` and `titan-ai-quant` (or trigger hot-reload if supported).
4. Verify connectivity:
   - Check logs for "Exchange connected".
   - Place a test order (min size) in Lab Mode.
5. Revoke old keys on the Exchange.

## Verification
- **Logs**: Ensure no secrets appear in logs. Search for `[MASKED]`.
- **Metrics**: Monitor `auth_failures` metric during rotation.
