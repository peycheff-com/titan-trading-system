import { Pool } from 'pg';

export const version = 9;
export const name = 'create_position_snapshots';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create position_snapshots table
    // Used for Brain vs Database reconciliation
    await client.query(`
      CREATE TABLE IF NOT EXISTS position_snapshots (
        id BIGSERIAL PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        positions JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add indexes for efficient time-range queries
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_position_snapshots_timestamp ON position_snapshots(timestamp DESC)',
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS position_snapshots');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
