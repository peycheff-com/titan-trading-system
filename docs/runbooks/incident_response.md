# Incident Response Runbook

> [!IMPORTANT]
> This runbook defines the authoritative procedures for handling **SEV-1 (Critical)** and **SEV-2 (Major)** incidents.
> All commands assume access to the production NATS bus or CLI tools.

## Severity Levels

| Level | Description | Example | Response Time |
| :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | System HALTED, Capital at Risk, Security Breach | Unsigned commands detected, Position limits breached, Sentinel crash | **IMMEDIATE (< 5 min)** |
| **SEV-2 (Major)** | Degradation of critical path, no immediate capital risk | Latency spike > 100ms, One exchange disconnected | **URGENT (< 30 min)** |
| **SEV-3 (Minor)** | Non-critical issues, tooling, logging | Metrics delayed, dev environment down | **Standard (< 4 hours)** |

---

## Critical Procedures (SEV-1)

### 1. EMERGENCY KILL SWITCH (The "Oh Shit" Button)
**When to use**: Market anomaly, runaway algo, potential compromise, or unverified behavior.

**Procedure**:

1.  **Execute Halt (System-Wide)**:
    Publish the system halt command via NATS CLI.
    ```bash
    nats pub "titan.cmd.sys.halt.v1" '{"reason": "MANUAL_INTERVENTION", "operator": "human"}'
    ```

2.  **Verify Halt**:
    - **Console**: Check header is RED (System Halted).
    - **Logs**: Verify `titan-execution` logs show: `Order Rejected: System Halted`.
    ```bash
    docker logs titan-execution-rs --tail 50 | grep "System Halted"
    ```

3.  **Flatten Positions (Optional)**:
    > [!WARNING]
    > Only execute if market conditions allow liquidating all positions.
    ```bash
    nats pub "titan.cmd.risk.flatten" '{"symbol": "ALL", "reason": "EMERGENCY_FLATTEN"}'
    ```

4.  **Isolate Input**:
    Stop strategy services to prevent new signal generation.
    ```bash
    docker compose stop titan-phase1-scavenger titan-phase2-hunter titan-phase3-sentinel
    ```

### 2. Data Corruption / State Recovery
**When to use**: `ShadowState` mismatch, duplicate fills, or invalid sequence numbers.

**Procedure**:

1.  **Halt System** (See Step 1).
2.  **Snapshot Truth (DB)**:
    ```bash
    pg_dump -U postgres -h localhost -d titan_prod > dump_$(date +%s).sql
    ```
3.  **Reset Execution State**:
    If JetStream state is corrupt, delete the consumer to force a replay or fresh start (caution: may replay old messages if not carefully managed).
    ```bash
    # Delete the persistent consumer
    nats consumer delete TITAN_EXECUTION execution_group
    ```
4.  **Restart Execution Service**:
    ```bash
    docker compose restart titan-execution-rs
    ```
5.  **Re-Verify State**:
    - Compare `titan-console` positions with Exchange GUI.
    - If mismatch persists, manually align DB state to Exchange truth.

### 3. Security Breach (Unsigned/Invalid Commands)
**When to use**: Alert `Security: Unsigned Command Detected` or `HMAC Verification Failed`.

**Procedure**:

1.  **Rotate Secrets Immediately**:
    - Generate new `TITAN_HMAC_SECRET`.
    - Update `.env.prod` (or Vault).
2.  **Rolling Restart**:
    ```bash
    docker compose restart titan-brain titan-execution-rs
    ```
3.  **Forensics**:
    - Isolate logs for the actor ID.
    - Revoke Exchange API keys if compromise is suspected (See [Secrets Management](../security/secrets-management.md)
).

---

## Maintenance Procedures

### A. Deployment Rollback
**When to use**: New deployment fails health check or verification.

**Procedure**:
1.  **Check Last Good State**:
    ```bash
    cat /opt/titan/state/last_known_good.json
    ```
2.  **Execute Rollback Script**:
    ```bash
    /opt/titan/scripts/rollback.sh
    ```
3.  **Verify**:
    ```bash
    /opt/titan/scripts/verify.sh
    ```

### B. Database Migration Failure
**When to use**: `sota:db` fails in prod.

**Procedure**:
1.  **Rollback Migration**:
    ```bash
    npm run db:down
    ```
2.  **Restore Backup** (if data loss occurred):
    Use the most recent `dump_*.sql`.
