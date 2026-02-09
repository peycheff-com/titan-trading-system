# Incident Response Protocol

> **Status**: Canonical
> **Policy**: Stop the Line

## 1. Severity Levels

| Level | Definition | Response Time | Example |
| :--- | :--- | :--- | :--- |
| **SEV-1 (CRITICAL)** | Capital at risk. Trading Halted. | Immediate | Exchange API disconnect while in position; Truth Drift; Host compromise. |
| **SEV-2 (HIGH)** | Core function degraded. Trading Paused. | < 15 mins | History sync failing; Strategy latency spiking. |
| **SEV-3 (LOW)** | Non-critical bug. Trading continues. | Next day | UI glitch; Logging noise. |

## 2. Response Procedures

### 2.1 The Kill Switch (SEV-1)
> [!IMPORTANT]
> **When to use**: Market anomaly, runaway algo, potential compromise, or unverified behavior. "Better safe than sorry."

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

### 2.2 Data Corruption / State Recovery
**When to use**: `ShadowState` mismatch, duplicate fills, or invalid sequence numbers.

1.  **Halt System** (See Step 2.1).
2.  **Snapshot Truth (DB)**:
    ```bash
    pg_dump -U postgres -h localhost -d titan_prod > dump_$(date +%s).sql
    ```
3.  **Reset Execution State**:
    If JetStream state is corrupt, delete the consumer to force a replay or fresh start.
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

### 2.3 Security Breach (Unsigned/Invalid Commands)
**When to use**: Alert `Security: Unsigned Command Detected` or `HMAC Verification Failed`.

1.  **Rotate Secrets Immediately**:
    - Generate new `TITAN_HMAC_SECRET`.
    - Update `.env.prod` (or Vault).
2.  **Rolling Restart**:
    ```bash
    docker compose restart titan-brain titan-execution-rs
    ```
3.  **Forensics**:
    - Isolate logs for the actor ID.
    - Revoke Exchange API keys if compromise is suspected.

## 3. Maintenance Procedures

### A. Deployment Rollback
**When to use**: New deployment fails health check or verification.

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

1.  **Rollback Migration**:
    ```bash
    npm run db:down
    ```
2.  **Restore Backup** (if data loss occurred):
    Use the most recent `dump_*.sql`.

## 4. Post-Incident
Every SEV-1 and SEV-2 requires a **Post-Mortem** within 24 hours.

### Post-Mortem Template
- **Summary**: What happened?
- **Timeline**: Detection -> Mitigation -> Resolution.
- **Root Cause**: The technical "Why".
- **Corrective Actions**: (Jira tickets).
    - [ ] Fix the bug.
    - [ ] Add the test case (Regression prevention).
    - [ ] Update documentation.
