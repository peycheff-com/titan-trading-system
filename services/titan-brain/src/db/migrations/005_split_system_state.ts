import { Pool } from "pg";

export const version = 5;
export const name = "split_system_state";

export async function up(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Create phase_state table for structured persistent state per phase
        await client.query(`
      CREATE TABLE IF NOT EXISTS phase_state (
        phase_id VARCHAR(50) NOT NULL,
        key VARCHAR(100) NOT NULL,
        value JSONB NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (phase_id, key)
      )
    `);

        // Drop the old system_state table which used the anti-pattern
        await client.query("DROP TABLE IF EXISTS system_state");

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

        // Recreate system_state table
        await client.query(`
      CREATE TABLE IF NOT EXISTS system_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

        // Drop new table
        await client.query("DROP TABLE IF EXISTS phase_state");

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
