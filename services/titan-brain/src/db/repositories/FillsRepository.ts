import { DatabaseManager } from "../DatabaseManager.js";
import { ExecutionReport } from "../../types/index.js";
import { PoolClient } from "pg";

export class FillsRepository {
    constructor(private db: DatabaseManager) {}

    /**
     * Persist a raw execution report (fill) to the database
     */
    async createFill(
        fill: ExecutionReport,
        client?: PoolClient,
    ): Promise<void> {
        // Ensure fill.id is present (or map from executionId)
        const fillId = fill.fillId || fill.executionId;

        if (!fillId) {
            console.warn(
                "⚠️ Skipping fill persistence: No fillId/executionId provided - cannot guarantee idempotency",
                fill,
            );
            return;
        }

        const fee = fill.fee ?? 0;
        const feeCurrency = fill.feeCurrency ?? null;
        const signalId = fill.signalId ?? null;

        // Use the provided client or the database manager
        const query = `INSERT INTO fills (
            fill_id, 
            signal_id, 
            symbol, 
            side, 
            price, 
            qty, 
            fee, 
            fee_currency,
            created_at,
            order_id,
            realized_pnl,
            t_signal,
            t_exchange,
            t_ingress
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (fill_id) DO UPDATE SET
            t_signal = COALESCE(fills.t_signal, EXCLUDED.t_signal),
            t_exchange = COALESCE(fills.t_exchange, EXCLUDED.t_exchange),
            t_ingress = COALESCE(fills.t_ingress, EXCLUDED.t_ingress),
            realized_pnl = COALESCE(fills.realized_pnl, EXCLUDED.realized_pnl)
        `;

        const params = [
            fillId,
            signalId,
            fill.symbol,
            fill.side,
            fill.price,
            fill.qty,
            fee,
            feeCurrency,
            new Date(fill.timestamp),
            fill.orderId ?? null,
            fill.realizedPnL ?? null,
            fill.t_signal ?? null,
            fill.t_exchange ?? null,
            fill.t_ingress ?? null,
        ];

        if (client) {
            await client.query(query, params);
        } else {
            await this.db.query(query, params);
        }
    }

    /**
     * Persist multiple execution reports in a single batch
     */
    async createFills(fills: ExecutionReport[]): Promise<void> {
        if (fills.length === 0) return;

        const values: any[] = [];
        const placeholders: string[] = [];
        let paramIndex = 1;

        for (const fill of fills) {
            const fillId = fill.fillId || fill.executionId;
            if (!fillId) {
                console.warn(
                    "⚠️ Skipping fill in batch: Missing upstream ID",
                    fill,
                );
                continue;
            }

            const fee = fill.fee ?? 0;
            const feeCurrency = fill.feeCurrency ?? null;
            const signalId = fill.signalId ?? null;

            placeholders.push(
                `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${
                    paramIndex + 3
                }, $${paramIndex + 4}, $${paramIndex + 5}, $${
                    paramIndex + 6
                }, $${paramIndex + 7}, TO_TIMESTAMP($${
                    paramIndex + 8
                } / 1000.0))`,
            );

            values.push(
                fillId,
                signalId,
                fill.symbol,
                fill.side,
                fill.price,
                fill.qty,
                fee,
                feeCurrency,
                fill.timestamp,
            );
            paramIndex += 9;
        }

        if (values.length === 0) return;

        const query = `
            INSERT INTO fills (
                fill_id, signal_id, symbol, side, price, qty, fee, fee_currency, created_at
            ) VALUES ${placeholders.join(", ")}
            ON CONFLICT (fill_id) DO NOTHING
        `;

        await this.db.query(query, values);
    }

    /**
     * Get recent fills for a symbol
     */
    async getRecentFills(symbol: string, limit: number = 50): Promise<any[]> {
        const result = await this.db.query(
            `SELECT * FROM fills WHERE symbol = $1 ORDER BY created_at DESC LIMIT $2`,
            [symbol, limit],
        );
        return result.rows;
    }
}
