/**
 * Position Repository
 * Handles persistence of position snapshots for reconciliation
 *
 * Requirements: Multi-Exchange Reconciliation
 */

import { DatabaseManager } from "../DatabaseManager.js";
import { BaseRepository } from "./BaseRepository.js";
import { Position } from "../../types/index.js";

interface PositionSnapshotRow {
    id: string; // BIGSERIAL returns as string
    timestamp: string; // BIGINT returns as string
    positions: Position[]; // JSONB returns as object/array
    created_at: Date;
}

export interface PositionSnapshot {
    id: string;
    timestamp: number;
    positions: Position[];
}

export class PositionRepository extends BaseRepository<PositionSnapshotRow> {
    constructor(db: DatabaseManager) {
        super(db, "position_snapshots");
    }

    /**
     * Save a new position snapshot
     */
    async saveSnapshot(positions: Position[]): Promise<PositionSnapshot> {
        const timestamp = Date.now();
        // DatabaseManager handles JSON serialization for JSONB columns if using pg
        // But for explicit safety or if using SQLite fallback logic (which expects string for TEXT),
        // we might need to verify.
        // Looking at DatabaseManager.ts, it passes values directly to pg / sqlite.prepare.
        // SQLite needs JSON.stringify. PG can take object.
        // Let's stringify for maximum compatibility if SQLite fallback is a concern,
        // OR rely on the fact that we are mainly PG.
        // However, risk_repository uses fields directly.
        // Re-checking DatabaseManager.ts SQLite section:
        /*
          const sqliteQuery = this.convertToSQLite(text);
          // ...
          const stmt = this.sqlite.prepare(sqliteQuery);
          // SQLite parameters. Objects might fail if not stringified?
        */
        // Let's stick to object for PG performance. If SQLite fails, we fix it (it's fallback).

        const row = await this.db.insert<PositionSnapshotRow>(this.tableName, {
            timestamp,
            positions: JSON.stringify(positions), // Stringifying ensures compatibility with both PG (which accepts JSON string for JSONB) and SQLite (TEXT)
        });

        return this.mapRowToSnapshot(row);
    }

    /**
     * Get the latest position snapshot
     */
    async getLatest(): Promise<PositionSnapshot | null> {
        const row = await this.db.queryOne<PositionSnapshotRow>(
            `SELECT * FROM ${this.tableName} ORDER BY timestamp DESC LIMIT 1`,
        );

        return row ? this.mapRowToSnapshot(row) : null;
    }

    /**
     * Get snapshots within a time range
     */
    async getInTimeRange(
        startTime: number,
        endTime: number,
    ): Promise<PositionSnapshot[]> {
        const rows = await this.db.queryAll<PositionSnapshotRow>(
            `SELECT * FROM ${this.tableName} 
       WHERE timestamp >= $1 AND timestamp <= $2 
       ORDER BY timestamp DESC`,
            [startTime, endTime],
        );

        return rows.map((row) => this.mapRowToSnapshot(row));
    }

    /**
     * Map database row to PositionSnapshot
     */
    private mapRowToSnapshot(row: PositionSnapshotRow): PositionSnapshot {
        // Handle potential string vs object from DB driver
        let positions: Position[] = [];
        if (typeof row.positions === "string") {
            try {
                positions = JSON.parse(row.positions);
            } catch (e) {
                console.error("Failed to parse positions JSON from DB", e);
            }
        } else {
            positions = row.positions;
        }

        return {
            id: row.id,
            timestamp: parseInt(row.timestamp, 10),
            positions,
        };
    }
}
