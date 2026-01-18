import { DatabaseManager } from "../DatabaseManager.js";
import { ExecutionReport } from "../../types/index.js";
import { v4 as uuidv4 } from "uuid";

export class FillsRepository {
    constructor(private db: DatabaseManager) {}

    /**
     * Persist a raw execution report (fill) to the database
     */
    async createFill(fill: ExecutionReport): Promise<void> {
        const fillId = uuidv4();

        // Ensure we handle potential missing fees or optional fields
        const fee = fill.fee ?? 0;
        const feeCurrency = fill.feeCurrency ?? null;
        const signalId = fill.signalId ?? null;

        await this.db.query(
            `INSERT INTO fills (
        fill_id, 
        signal_id, 
        symbol, 
        side, 
        price, 
        qty, 
        fee, 
        fee_currency,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TO_TIMESTAMP($9 / 1000.0))`,
            [
                fillId,
                signalId,
                fill.symbol,
                fill.side,
                fill.price,
                fill.qty,
                fee,
                feeCurrency,
                fill.timestamp,
            ],
        );
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
            const fillId = uuidv4();
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

        const query = `
            INSERT INTO fills (
                fill_id, signal_id, symbol, side, price, qty, fee, fee_currency, created_at
            ) VALUES ${placeholders.join(", ")}
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
