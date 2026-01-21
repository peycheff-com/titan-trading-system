import { Pool } from "pg";

export const version = 4;
export const name = "precision_upgrade";

export async function up(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const alterColumnIfExists = async (
            table: string,
            column: string,
            type: string,
        ): Promise<void> => {
            const result = await client.query(
                `
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = $1
                  AND column_name = $2
                `,
                [table, column],
            );

            if (result.rowCount) {
                await client.query(
                    `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${type}`,
                );
            }
        };

        // Upgrade phase_performance table (only columns that exist)
        await alterColumnIfExists(
            "phase_performance",
            "equity",
            "DECIMAL(18, 8)",
        );
        await alterColumnIfExists(
            "phase_performance",
            "pnl",
            "DECIMAL(18, 8)",
        );
        await alterColumnIfExists(
            "phase_performance",
            "drawdown",
            "DECIMAL(18, 8)",
        );

        // Upgrade phase_trades table
        await alterColumnIfExists(
            "phase_trades",
            "pnl",
            "DECIMAL(18, 8)",
        );

        // Upgrade allocation_vectors table
        await alterColumnIfExists(
            "allocation_vectors",
            "total_equity",
            "DECIMAL(18, 8)",
        );

        // Upgrade allocation_history table
        await alterColumnIfExists(
            "allocation_history",
            "equity",
            "DECIMAL(18, 8)",
        );

        // Upgrade treasury_operations table
        await alterColumnIfExists(
            "treasury_operations",
            "amount",
            "DECIMAL(18, 8)",
        );
        await alterColumnIfExists(
            "treasury_operations",
            "high_watermark",
            "DECIMAL(18, 8)",
        );

        // Upgrade high_watermark table
        await alterColumnIfExists(
            "high_watermark",
            "value",
            "DECIMAL(18, 8)",
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

        const alterColumnIfExists = async (
            table: string,
            column: string,
            type: string,
        ): Promise<void> => {
            const result = await client.query(
                `
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = $1
                  AND column_name = $2
                `,
                [table, column],
            );

            if (result.rowCount) {
                await client.query(
                    `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${type}`,
                );
            }
        };

        await alterColumnIfExists("phase_performance", "equity", "REAL");
        await alterColumnIfExists("phase_performance", "pnl", "REAL");
        await alterColumnIfExists("phase_performance", "drawdown", "REAL");

        await alterColumnIfExists("phase_trades", "pnl", "REAL");

        await alterColumnIfExists("allocation_vectors", "total_equity", "REAL");

        await alterColumnIfExists("allocation_history", "equity", "REAL");

        await alterColumnIfExists("treasury_operations", "amount", "REAL");
        await alterColumnIfExists(
            "treasury_operations",
            "high_watermark",
            "REAL",
        );

        await alterColumnIfExists("high_watermark", "value", "REAL");

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
