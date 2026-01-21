import { Pool } from "pg";

export const version = 8;
export const name = "create_event_log";

export async function up(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Create event_log table
        // Using simple columns for high throughput query patterns
        await client.query(`
      CREATE TABLE IF NOT EXISTS event_log (
        id UUID PRIMARY KEY,
        type VARCHAR(64) NOT NULL,
        aggregate_id VARCHAR(128) NOT NULL,
        payload JSONB NOT NULL,
        metadata JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        version INTEGER DEFAULT 1
      )
    `);

        // Add indexes for common query patterns:
        // 1. Replaying stream for an aggregate (e.g., getting all events for a signal)
        await client.query(
            "CREATE INDEX IF NOT EXISTS idx_event_log_aggregate_id_created_at ON event_log(aggregate_id, created_at)",
        );

        // 2. Replaying all events in order (for full system recovery or analytics)
        await client.query(
            "CREATE INDEX IF NOT EXISTS idx_event_log_created_at ON event_log(created_at)",
        );

        // 3. Querying by traceId (often in metadata) - leveraging GIN index for JSONB
        // We add a GIN index on metadata to support "metadata->>'traceId'" queries efficiently if needed.
        await client.query(
            "CREATE INDEX IF NOT EXISTS idx_event_log_metadata ON event_log USING GIN (metadata)",
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
        await client.query("DROP TABLE IF EXISTS event_log");
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
