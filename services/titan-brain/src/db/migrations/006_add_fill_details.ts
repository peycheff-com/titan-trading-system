import { Pool } from "pg";

export const version = 6;
export const name = "add_fill_details";

export async function up(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Add columns to fills table
        await client.query(
            "ALTER TABLE fills ADD COLUMN IF NOT EXISTS execution_id VARCHAR(100)",
        );
        await client.query(
            "ALTER TABLE fills ADD COLUMN IF NOT EXISTS order_id VARCHAR(100)",
        );
        await client.query(
            "ALTER TABLE fills ADD COLUMN IF NOT EXISTS realized_pnl DECIMAL(18, 8)",
        );

        // Add indexes
        await client.query(
            "CREATE INDEX IF NOT EXISTS idx_fills_execution_id ON fills(execution_id)",
        );
        await client.query(
            "CREATE INDEX IF NOT EXISTS idx_fills_order_id ON fills(order_id)",
        );

        // Add unique constraint to execution_id to prevent duplicates (if supported by data)
        // We make it optional first, but recommended for integrity
        await client.query(
            "ALTER TABLE fills ADD CONSTRAINT uq_fills_execution_id UNIQUE (execution_id)",
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

        await client.query(
            "ALTER TABLE fills DROP CONSTRAINT IF EXISTS uq_fills_execution_id",
        );
        await client.query("DROP INDEX IF EXISTS idx_fills_order_id");
        await client.query("DROP INDEX IF EXISTS idx_fills_execution_id");
        await client.query(
            "ALTER TABLE fills DROP COLUMN IF EXISTS realized_pnl",
        );
        await client.query("ALTER TABLE fills DROP COLUMN IF EXISTS order_id");
        await client.query(
            "ALTER TABLE fills DROP COLUMN IF EXISTS execution_id",
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
