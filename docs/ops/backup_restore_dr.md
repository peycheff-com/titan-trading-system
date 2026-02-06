# Backup & Disaster Recovery

> **Status**: Canonical
> **RPO**: 1 Hour (Data Loss Tolerance)
> **RTO**: 4 Hours (Recovery Time)

## 1. Backup Strategy

### 1.1 Database (Postgres)
- **Schedule**: Every 6 hours.
- **Retention**: 7 Days (Local), 30 Days (S3 Cold Storage).
- **Content**: Full dump of `titan_brain`.

### 1.2 Configuration
- **Files**: `.env.prod`, `config/names.conf`, `risk_policy.json`.
- **Strategy**: GitOps. Repository *is* the backup for config.

## 2. Disaster Recovery Scenarios

### 2.1 Scenario A: Corrupted Database
*Symptom: Brain fails to boot due to SQL errors.*
**Procedure**:
1. Stop Titan.
2. Run `scripts/ops/restore_db.sh latest`.
3. Start Titan.
4. Verify `allocation_history` is intact.

### 2.2 Scenario B: Droplet Loss (Total Destruction)
*Symptom: Host unreachable.*
**Procedure**:
1. Provision new Droplet (via Terraform/Console).
2. Clone Repo.
3. Deploy Secrets (from offline storage).
4. Run `deploy_prod.sh`.
5. Restore Database from S3.

## 3. Restore Drills
**Frequency**: Monthly.
**Process**: restore the Production backup to a Local Dev instance and verify `npm run test:brain` passes against it.
