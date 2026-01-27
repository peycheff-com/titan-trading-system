import { Pool } from 'pg';

export const version = 11;
export const name = 'idempotent_fills';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Clean up potential duplicates before adding unique constraint
    // Strategy: Keep the first seen fill_id
    await client.query(`
            DELETE FROM fills a USING (
                SELECT MIN(ctid) as ctid, fill_id
                FROM fills 
                GROUP BY fill_id HAVING COUNT(*) > 1
            ) b
            WHERE a.fill_id = b.fill_id 
            AND a.ctid <> b.ctid
        `);

    // 2. Add Unique Constraint to fill_id (if not exists)
    // Using DO block to avoid error if constraint already exists (idempotent migration)
    await client.query(`
            DO $$
            BEGIN
                -- Constraint removed due to partitioning limitations
                -- IF NOT EXISTS (
                --     SELECT 1 FROM pg_constraint WHERE conname = 'uq_fills_fill_id'
                -- ) THEN
                --     ALTER TABLE fills ADD CONSTRAINT uq_fills_fill_id UNIQUE (fill_id);
                -- END IF;
            END $$;
        `);

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
    await client.query(`
            ALTER TABLE fills DROP CONSTRAINT IF EXISTS uq_fills_fill_id;
        `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
