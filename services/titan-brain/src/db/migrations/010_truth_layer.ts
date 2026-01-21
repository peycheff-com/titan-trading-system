import { Pool } from "pg";

export const version = 10;
export const name = "create_truth_layer";

export async function up(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Reconciliation Runs
        await client.query(`
            CREATE TABLE IF NOT EXISTS truth_reconcile_run (
                id SERIAL PRIMARY KEY,
                scope VARCHAR(100) NOT NULL,
                started_at BIGINT NOT NULL,
                finished_at BIGINT,
                success BOOLEAN NOT NULL DEFAULT false,
                stats_json JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(
            "CREATE INDEX IF NOT EXISTS idx_truth_reconcile_run_scope_ts ON truth_reconcile_run(scope, started_at DESC)",
        );

        // 2. Evidence Snapshots
        await client.query(`
            CREATE TABLE IF NOT EXISTS truth_evidence_snapshot (
                id SERIAL PRIMARY KEY,
                run_id INTEGER REFERENCES truth_reconcile_run(id),
                scope VARCHAR(100) NOT NULL,
                source VARCHAR(50) NOT NULL,
                fetched_at BIGINT NOT NULL,
                payload_hash VARCHAR(64),
                storage_ref VARCHAR(255),
                payload_json JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(
            "CREATE INDEX IF NOT EXISTS idx_truth_evidence_snapshot_run ON truth_evidence_snapshot(run_id)",
        );

        // 3. Drift Events
        await client.query(`
            CREATE TABLE IF NOT EXISTS truth_drift_event (
                id UUID PRIMARY KEY,
                run_id INTEGER REFERENCES truth_reconcile_run(id),
                scope VARCHAR(100) NOT NULL,
                drift_type VARCHAR(50) NOT NULL,
                severity VARCHAR(20) NOT NULL,
                detected_at BIGINT NOT NULL,
                details_json JSONB NOT NULL,
                recommended_action VARCHAR(50),
                resolved_at BIGINT,
                resolution_method VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(
            "CREATE INDEX IF NOT EXISTS idx_truth_drift_event_scope_ts ON truth_drift_event(scope, detected_at DESC)",
        );
        await client.query(
            "CREATE INDEX IF NOT EXISTS idx_truth_drift_event_active ON truth_drift_event(resolved_at) WHERE resolved_at IS NULL",
        );

        // 4. Confidence Score
        await client.query(`
            CREATE TABLE IF NOT EXISTS truth_confidence (
                scope VARCHAR(100) PRIMARY KEY,
                score DECIMAL(5, 4) NOT NULL DEFAULT 1.0,
                state VARCHAR(20) NOT NULL DEFAULT 'HIGH',
                reasons_json JSONB,
                last_update_ts BIGINT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // RLS Policies
        await client.query(
            "ALTER TABLE truth_reconcile_run ENABLE ROW LEVEL SECURITY",
        );
        await client.query(
            "ALTER TABLE truth_evidence_snapshot ENABLE ROW LEVEL SECURITY",
        );
        await client.query(
            "ALTER TABLE truth_drift_event ENABLE ROW LEVEL SECURITY",
        );
        await client.query(
            "ALTER TABLE truth_confidence ENABLE ROW LEVEL SECURITY",
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function down(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("DROP TABLE IF EXISTS truth_confidence");
        await client.query("DROP TABLE IF EXISTS truth_drift_event");
        await client.query("DROP TABLE IF EXISTS truth_evidence_snapshot");
        await client.query("DROP TABLE IF EXISTS truth_reconcile_run");
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
