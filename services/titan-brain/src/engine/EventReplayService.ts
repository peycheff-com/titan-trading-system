import { DatabaseManager } from '../db/index.js';
import { Logger } from '@titan/shared';
// Removed unused imports: AllocationEngine, RiskGuardian, GovernanceEngine, PerformanceTracker, NatsClient, EquityTier
import { TITAN_SUBJECTS } from '@titan/shared';
import { BrainStateManager } from './BrainStateManager.js';
import { Position } from '../types/index.js';
import { PositionRepository } from '../db/repositories/PositionRepository.js';
import { AllocationRepository } from '../db/repositories/AllocationRepository.js';

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

    const stateManager = new BrainStateManager();
    // Initialize engines if needed for side-effect calculation (e.g. risk)
    // For pure state reconstruction from facts, we might not need them if facts contain the results.

    let lastId = 0;
    let count = 0;

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
        await this.applyEvent(event, stateManager);
        lastId = event.id;
        count++;
      }

      this.logger.info(`   Replayed ${count} events...`);
    }

    this.logger.info('✅ Event Replay Complete.');
  }

  /**
   * Reconstruct system state at a specific point in time.
   * Requirement 9.X: Time Travel / Forensic State
   * 
   * Optimization: Uses "Landmark Replay" by finding nearest snapshots for Positions and Allocation
   * and jumping to the earliest one, then replaying forward applying subsequent snapshots as overrides.
   */
  async reconstructStateAt(timestamp: number): Promise<BrainStateManager> {
    this.logger.info(`🕰️ Time Travel: Reconstructing state at ${new Date(timestamp).toISOString()}`);
    
    // 1. Initialize fresh state
    const stateManager = new BrainStateManager();
    
    // 2. Fetch Landmarks (Snapshots)
    const posRepo = new PositionRepository(this.db);
    const allocRepo = new AllocationRepository(this.db);

    const [posSnap, allocSnap] = await Promise.all([
      posRepo.findNearestSnapshot(timestamp),
      allocRepo.findNearest(timestamp),
    ]);

    // Define "Landmarks" - points in time where we have authoritative state
    interface Landmark {
       timestamp: number;
       apply: (sm: BrainStateManager) => void;
       type: 'POS' | 'ALLOC';
    }

    const landmarks: Landmark[] = [];

    if (posSnap) {
      landmarks.push({
        timestamp: Number(posSnap.timestamp), // Ensure number
        type: 'POS',
        apply: (sm) => {
          this.logger.debug(`   Applying Position Snapshot from ${new Date(Number(posSnap.timestamp)).toISOString()}`);
          sm.setPositions(posSnap.positions);
        }
      });
    }

    if (allocSnap) {
      landmarks.push({
        timestamp: allocSnap.timestamp,
        type: 'ALLOC',
        apply: (sm) => {
           this.logger.debug(`   Applying Allocation Snapshot from ${new Date(allocSnap.timestamp).toISOString()}`);
           sm.setEquity(allocSnap.equity);
           sm.setAllocation({
             w1: allocSnap.w1,
             w2: allocSnap.w2,
             w3: allocSnap.w3,
             timestamp: allocSnap.timestamp
           });
        }
      });
    }

    // Sort landmarks by time
    landmarks.sort((a, b) => a.timestamp - b.timestamp);

    let replayFrom = 0;
    
    // 3. Apply initial state if landmarks exist
    if (landmarks.length > 0) {
       // Start from the earliest landmark
       replayFrom = landmarks[0].timestamp;
       landmarks[0].apply(stateManager);
       this.logger.info(`   🚀 Jumping to snapshot at ${new Date(replayFrom).toISOString()} (${landmarks[0].type})`);
    }

    // 4. Replay Loop with Landmarks
    // We replay from `replayFrom` to `timestamp`, stopping at intermediate landmarks to apply them.

    // Remaining landmarks to apply
    const remainingLandmarks = landmarks.slice(1); 
    
    // Target time for next segment
    let currentTarget = remainingLandmarks.length > 0 ? remainingLandmarks[0].timestamp : timestamp;
    let landmarkIndex = 0;

    // Outer loop handles segments between landmarks
    while (replayFrom < timestamp) {
       // Ensure we don't overshoot the final target
       const segmentTarget = Math.min(currentTarget, timestamp);
       
       if (segmentTarget > replayFrom) {
          await this.replayRange(replayFrom, segmentTarget, stateManager);
          replayFrom = segmentTarget;
       }

       // If we reached a landmark, apply it and target the next one
       if (remainingLandmarks[landmarkIndex] && replayFrom === remainingLandmarks[landmarkIndex].timestamp) {
           remainingLandmarks[landmarkIndex].apply(stateManager);
           landmarkIndex++;
           currentTarget = remainingLandmarks[landmarkIndex] ? remainingLandmarks[landmarkIndex].timestamp : timestamp;
       } else {
           // No more landmarks, just finish the loop
           if (replayFrom >= timestamp) break;
       }
    }
    
    return stateManager;
  }

  /**
   * Helper to replay events in a specific range
   */
  private async replayRange(start: number, end: number, stateManager: BrainStateManager): Promise<void> {
    
    let offset = 0;
    while (true) {
        // Query filter: created_at > start AND created_at <= end
        const simpleSql = `
             SELECT * FROM event_log
             WHERE created_at > to_timestamp($1/1000.0) AND created_at <= to_timestamp($2/1000.0)
             ORDER BY id ASC
             LIMIT $3 OFFSET $4
        `;
        
        const queryParams = [start, end, this.batchSize, offset];
        const result = await this.db.query(simpleSql, queryParams);

        if (result.rows.length === 0) break;

        for (const event of result.rows) {
            await this.applyEvent(event, stateManager);
        }
        
        offset += result.rows.length;
        if (result.rows.length < this.batchSize) break;
    }
  }

  /**
   * Routes a raw event to the state manager.
   */
  private async applyEvent(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any,
    stateManager: BrainStateManager,
  ): Promise<void> {
    const subject = event.subject || event.type;
    const payload = event.payload || event.data; 

    // Helper to get typed payload
    const p = typeof payload === 'string' ? JSON.parse(payload) : payload;

    switch (subject) {
      case TITAN_SUBJECTS.EVT.EXECUTION.FILL:
      case 'ORDER_FILLED':
        this.applyFill(p, stateManager);
        break;
        
      case 'DEPOSIT':
      case 'WITHDRAWAL':
      case 'TRANSFER': {
         // Simplified equity update
         const current = stateManager.getEquity();
         stateManager.setEquity(current + (p.amount || 0));
         break;
      }
         
      case 'RISK_CONFIG_UPDATE':
         // Update risk params if stored in state
         break;
         
      // Add more cases as event schema matures
    }
  }

  /**
   * Apply Fill Logic (Matches StateRecoveryService logic)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFill(fill: any, stateManager: BrainStateManager) {
    const positions = stateManager.getPositions();
    const map = new Map<string, Position>(positions.map(pos => [pos.symbol, pos]));
    
    const notional = fill.fillSize * fill.fillPrice;
    const signedChange = fill.side === 'BUY' ? notional : -notional;
    let pos = map.get(fill.symbol);

    if (!pos) {
       pos = {
         symbol: fill.symbol,
         side: signedChange > 0 ? 'LONG' : 'SHORT',
         size: Math.abs(signedChange),
         entryPrice: fill.fillPrice,
         unrealizedPnL: 0,
         leverage: 1, 
         phaseId: 'phase1',
       };
    } else {
        const currentSignedSize = pos.side === 'LONG' ? pos.size : -pos.size;
        const newSignedSize = currentSignedSize + signedChange;

        if (Math.abs(newSignedSize) < 0.0001) {
            map.delete(fill.symbol);
            stateManager.setPositions(Array.from(map.values()));
            return;
        }

        const isLong = newSignedSize > 0;
        
        // Entry Price Logic (Average)
        if ((currentSignedSize > 0 && signedChange > 0) || (currentSignedSize < 0 && signedChange < 0)) {
             const totalSize = Math.abs(currentSignedSize) + Math.abs(signedChange);
             pos.entryPrice = ((pos.entryPrice * Math.abs(currentSignedSize)) + (fill.fillPrice * Math.abs(signedChange))) / totalSize;
        } else if ((currentSignedSize > 0 && newSignedSize < 0) || (currentSignedSize < 0 && newSignedSize > 0)) {
             pos.entryPrice = fill.fillPrice;
        }
        
        pos.side = isLong ? 'LONG' : 'SHORT';
        pos.size = Math.abs(newSignedSize);
    }
    
    map.set(fill.symbol, pos);
    stateManager.setPositions(Array.from(map.values()));
  }
}
