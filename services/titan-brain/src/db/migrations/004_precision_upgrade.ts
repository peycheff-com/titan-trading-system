import { Pool } from "pg";

export const version = 4;
export const name = "precision_upgrade";

export async function up(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Upgrade phase_performance table
        await client.query(
            "ALTER TABLE phase_performance ALTER COLUMN equity TYPE DECIMAL(18, 8)",
        );
        await client.query(
            "ALTER TABLE phase_performance ALTER COLUMN pnl TYPE DECIMAL(18, 8)",
        );
        await client.query(
            "ALTER TABLE phase_performance ALTER COLUMN drawdown TYPE DECIMAL(18, 8)",
        );

        // Upgrade phase_trades table
        await client.query(
            "ALTER TABLE phase_trades ALTER COLUMN pnl TYPE DECIMAL(18, 8)",
        );

        // Upgrade allocation_vectors table
        await client.query(
            "ALTER TABLE allocation_vectors ALTER COLUMN total_equity TYPE DECIMAL(18, 8)",
        );

        // Upgrade allocation_history table
        await client.query(
            "ALTER TABLE allocation_history ALTER COLUMN equity TYPE DECIMAL(18, 8)",
        );

        // Upgrade treasury_operations table
        await client.query(
            "ALTER TABLE treasury_operations ALTER COLUMN amount TYPE DECIMAL(18, 8)",
        );
        await client.query(
            "ALTER TABLE treasury_operations ALTER COLUMN high_watermark TYPE DECIMAL(18, 8)",
        );

        // Upgrade high_watermark table
        await client.query(
            "ALTER TABLE high_watermark ALTER COLUMN value TYPE DECIMAL(18, 8)",
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
            "ALTER TABLE phase_performance ALTER COLUMN equity TYPE REAL",
        );
        await client.query(
            "ALTER TABLE phase_performance ALTER COLUMN pnl TYPE REAL",
        );
        await client.query(
            "ALTER TABLE phase_performance ALTER COLUMN drawdown TYPE REAL",
        );

        await client.query(
            "ALTER TABLE phase_trades ALTER COLUMN pnl TYPE REAL",
        );

        await client.query(
            "ALTER TABLE allocation_vectors ALTER COLUMN total_equity TYPE REAL",
        );

        await client.query(
            "ALTER TABLE allocation_history ALTER COLUMN equity TYPE REAL",
        );

        await client.query(
            "ALTER TABLE treasury_operations ALTER COLUMN amount TYPE REAL",
        );
        await client.query(
            "ALTER TABLE treasury_operations ALTER COLUMN high_watermark TYPE REAL",
        );

        await client.query(
            "ALTER TABLE high_watermark ALTER COLUMN value TYPE REAL",
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
