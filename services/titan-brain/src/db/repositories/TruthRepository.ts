import { DatabaseManager } from "../DatabaseManager.js";
import {
    DriftEvent,
    ReconciliationRun,
    TruthConfidence,
} from "../../types/index.js";
import { v4 as uuidv4 } from "uuid";

export class TruthRepository {
    constructor(private db: DatabaseManager) {}

    async recordRun(
        run: Omit<ReconciliationRun, "id" | "created_at">,
    ): Promise<number> {
        const sql = `
            INSERT INTO truth_reconcile_run (scope, started_at, finished_at, success, stats_json)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `;
        const result = await this.db.query<{ id: number }>(sql, [
            run.scope,
            run.startedAt,
            run.finishedAt,
            run.success,
            JSON.stringify(run.stats || {}),
        ]);
        return result.rows[0].id;
    }

    async updateRunStatus(
        id: number,
        success: boolean,
        finishedAt: number,
        stats: Record<string, number>,
    ): Promise<void> {
        const sql = `
            UPDATE truth_reconcile_run
            SET success = $2, finished_at = $3, stats_json = $4
            WHERE id = $1
        `;
        await this.db.query(sql, [
            id,
            success,
            finishedAt,
            JSON.stringify(stats),
        ]);
    }

    async persistEvidence(evidence: {
        runId: number;
        scope: string;
        source: string;
        data: any;
        hash?: string;
        timestamp?: number;
    }): Promise<void> {
        const sql = `
            INSERT INTO truth_evidence_snapshot (run_id, scope, source, fetched_at, payload_json, payload_hash)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await this.db.query(sql, [
            evidence.runId,
            evidence.scope,
            evidence.source,
            evidence.timestamp || Date.now(),
            JSON.stringify(evidence.data),
            evidence.hash || null,
        ]);
    }

    async recordDrift(drift: Omit<DriftEvent, "created_at">): Promise<void> {
        const sql = `
            INSERT INTO truth_drift_event (
                id, run_id, scope, drift_type, severity, detected_at, details_json, recommended_action, resolution_method
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        await this.db.query(sql, [
            drift.id,
            drift.runId,
            drift.scope,
            drift.driftType,
            drift.severity,
            drift.detectedAt,
            JSON.stringify(drift.details),
            drift.recommendedAction,
            drift.resolutionMethod,
        ]);
    }

    async updateConfidence(confidence: TruthConfidence): Promise<void> {
        const sql = `
            INSERT INTO truth_confidence (scope, score, state, reasons_json, last_update_ts)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (scope) DO UPDATE SET
                score = EXCLUDED.score,
                state = EXCLUDED.state,
                reasons_json = EXCLUDED.reasons_json,
                last_update_ts = EXCLUDED.last_update_ts
        `;
        await this.db.query(sql, [
            confidence.scope,
            confidence.score,
            confidence.state,
            JSON.stringify(confidence.reasons),
            confidence.lastUpdateTs,
        ]);
    }

    async getConfidence(scope: string): Promise<TruthConfidence | null> {
        const sql = `SELECT * FROM truth_confidence WHERE scope = $1`;
        const result = await this.db.query<any>(sql, [scope]);
        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            scope: row.scope,
            score: parseFloat(row.score),
            state: row.state,
            reasons: row.reasons_json, // pg auto-parses JSONB if configured, or manual
            lastUpdateTs: parseInt(row.last_update_ts),
        };
    }
}
