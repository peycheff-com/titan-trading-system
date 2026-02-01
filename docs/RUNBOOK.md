# SOTA Incident Response Runbook

## Severity Levels

| Level | Description | Example | Response Time |
| :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | System HALTED, Capital at Risk, Security Breach | Unsigned commands detected, Position limits breached, Sentinel crash | **IMMEDIATE (< 5 min)** |
| **SEV-2 (Major)** | Degradation of critical path, no immediate capital risk | Latency spike > 100ms, One exchange disconnected | **URGENT (< 30 min)** |
| **SEV-3 (Minor)** | Non-critical issues, tooling, logging | Metrics delayed, dev environment down | **Standard (< 4 hours)** |

## Critical Procedures (SEV-1)

### 1. EMERGENCY KILL SWITCH (The "Oh Shit" Button)
**When to use**: Market anomaly, runaway algo, potential compromise.

**Procedure**:
1.  **Execute Halt**:
    ```bash
    # From Operator Console or CLI
    npm run titan:halt -- --reason="Manual Intervention: [REASON]"
    ```
    *   *Alternative (Direct NATS)*: Publish `STOP` to `titan.lifecycle.system.halt`.
2.  **Verify Halt**:
    *   Check `titan-console` header is RED (System Halted).
    *   Verify `titan-execution` logs show `Order Rejected: System Halted`.
3.  **Flatten Positions (Optional/if safe)**:
    ```bash
    npm run titan:flatten -- --symbol="ALL"
    ```
4.  **Isolate**:
    *   Stop ingress services: `docker compose stop titan-scavenger`.

### 2. Data Corruption / State Recovery
**When to use**: `ShadowState` mismatch, duplicate fills, invalid sequence.

**Procedure**:
1.  **Halt System** (See above).
2.  **Snapshot DB**:
    ```bash
    pg_dump -U postgres -h localhost -d titan_prod > dump_$(date +%s).sql
    ```
3.  **Restart Execution with Replay**:
    *   NATS JetStream will replay missed messages.
    *   If JetStream is corrupt, reset consumer:
        ```bash
        nats consumer delete TITAN_EXECUTION execution_group
        ```
    *   Restart service: `docker compose restart titan-execution`.
4.  **Verify State**:
    *   Compare `titan-console` positions with Exchange GUI.

### 3. Security Breach (Unsigned Commands)
**When to use**: Alert `Security: Unsigned Command Detected`.

**Procedure**:
1.  **Rotate Secrets**:
    *   Update `TITAN_HMAC_SECRET` in `.env.prod`.
    *   Restart all services.
2.  **Audit Logs**:
    *   Grep logs for `actor_id` associated with invalid commands.
    *   Export NATS traffic for forensics.

## Maintenance Procedures

### A. Deployment Rollback
**When to use**: New deployment fails health check.

**Procedure**:
1.  **Revert Image**:
    ```bash
    # Update docker-compose.prod.yml to previous tag
    docker compose up -d
    ```
2.  **Verify Health**:
    ```bash
    npm run health:check
    ```

### B. Database Migration Failure
**When to use**: `sota:db` fails in prod.

**Procedure**:
1.  **Rollback Migration**:
    ```bash
    npm run db:down
    ```
2.  **Restore Backup** (if data lost).
