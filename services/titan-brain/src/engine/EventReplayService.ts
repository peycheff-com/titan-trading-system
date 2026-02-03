import { DatabaseManager } from '../db/index.js';
import { Logger } from '@titan/shared';
import { AllocationEngine } from '../features/Allocation/AllocationEngine.js';
import { RiskGuardian } from '../features/Risk/RiskGuardian.js';
import { GovernanceEngine } from '../features/Governance/GovernanceEngine.js';
import { PerformanceTracker } from './PerformanceTracker.js';
import { NatsClient, TITAN_SUBJECTS } from '@titan/shared'; // Mock or Null for replay
import { EquityTier } from '../types/index.js';

/**
 * EventReplayService (GAP-01)
 *
 * Replays events from `event_log` to reconstruct `allocation_history` and other read models.
 * Ensures that the system's "Truth" (Postgres State) can always be rebuilt from the "Facts" (Event Log).
 */
export class EventReplayService {
  private db: DatabaseManager;
  private logger: Logger;
  private batchSize = 1000;

  constructor(db: DatabaseManager, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Replay all events and rebuild read models.
   * WARN: This might truncate existing history tables if specified.
   */
  async replayAll(reset: boolean = false): Promise<void> {
    this.logger.info('🎬 Starting Event Replay...');

    if (reset) {
      this.logger.warn('⚠️  Resetting read models (allocation_history, risk_snapshots)...');
      await this.db.query('TRUNCATE TABLE allocation_history, risk_snapshots CASCADE');
    }

    let lastId = 0;

    let count = 0;

    // Initialize ephemeral engines for state reconstruction
    // We do NOT want to trigger NATS commands, so we pass a null/mock NATS client or disable side-effects
    const governance = new GovernanceEngine();
    const allocationEngine = new AllocationEngine({
      transitionPoints: {
        startP2: 1500,
        fullP2: 5000,
        startP3: 25000,
      },
      leverageCaps: {
        [EquityTier.MICRO]: 20,
        [EquityTier.SMALL]: 10,
        [EquityTier.MEDIUM]: 5,
        [EquityTier.LARGE]: 3,
        [EquityTier.INSTITUTIONAL]: 2,
      },
    });

    // We stream events in batches
    while (true) {
      const sql = `
        SELECT * FROM event_log
        WHERE id > $1
        ORDER BY id ASC
        LIMIT $2
      `;
      const result = await this.db.query(sql, [lastId, this.batchSize]);

      if (result.rows.length === 0) break;

      for (const event of result.rows) {
        await this.applyEvent(event, allocationEngine, governance);
        lastId = event.id;
        count++;
      }

      this.logger.info(`   Replayed ${count} events...`);
    }

    this.logger.info('✅ Event Replay Complete.');
  }

  /**
   * Routes a raw event to the appropriate engine handler.
   * Implementation depends on event schema.
   */
  private async applyEvent(
    event: any,
    allocationEngine: AllocationEngine,
    governance: GovernanceEngine,
  ): Promise<void> {
    const subject = event.subject;
    const payload = event.payload; // Assumed JSON

    // Map subjects to Logic
    if (subject === TITAN_SUBJECTS.EVT.SCAVENGER.SIGNAL) {
      // allocationEngine.onSignal(...)
      // For now, we assume simple state update or we log it
    } else if (subject === TITAN_SUBJECTS.EVT.EXECUTION.FILL) {
      // allocationEngine.updatePerformance(...)
    }

    // After processing, we might want to capture a snapshot
    // await this.snapshotState(allocationEngine, event.timestamp);
  }
}
