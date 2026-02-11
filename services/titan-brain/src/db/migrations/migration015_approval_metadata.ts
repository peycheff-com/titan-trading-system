import { DatabaseManager } from '../../db/DatabaseManager.js';
import { Logger } from '../../logging/Logger.js';

export async function up(db: DatabaseManager): Promise<void> {
  const logger = Logger.getInstance('migration015');
  logger.info('Starting migration 015: Adding approval metadata to operator_intents');

  try {
    await db.query(`
      ALTER TABLE operator_intents
      ADD COLUMN IF NOT EXISTS approver_id TEXT,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT
    `);

    logger.info('Migration 015 complete');
  } catch (error) {
    logger.error('Migration 015 failed', error as Error);
    throw error;
  }
}

export async function down(db: DatabaseManager): Promise<void> {
  const logger = Logger.getInstance('migration015');
  try {
    await db.query(`
      ALTER TABLE operator_intents
      DROP COLUMN IF NOT EXISTS approver_id,
      DROP COLUMN IF NOT EXISTS approved_at,
      DROP COLUMN IF NOT EXISTS rejection_reason
    `);
    logger.info('Migration 015 reverted');
  } catch (error) {
    logger.error('Migration 015 revert failed', error as Error);
    throw error;
  }
}
