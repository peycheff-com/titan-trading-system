/**
 * Breaker Repository
 * Handles persistence of circuit breaker events
 *
 * Requirements: 5.7, 9.1, 9.2, 9.3
 */

import { DatabaseManager } from '../DatabaseManager.js';
import { BaseRepository } from './BaseRepository.js';
import { BreakerEvent, BreakerType } from '../../types/index.js';

interface BreakerRow {
  id: number;
  timestamp: string;
  event_type: string;
  breaker_type: string | null;
  reason: string;
  equity: string;
  operator_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export class BreakerRepository extends BaseRepository<BreakerRow> {
  constructor(db: DatabaseManager) {
    super(db, 'circuit_breaker_events');
  }

  /**
   * Record a circuit breaker event
   */
  async recordEvent(event: Omit<BreakerEvent, 'id'>): Promise<BreakerEvent> {
    const row = await this.db.insert<BreakerRow>(this.tableName, {
      timestamp: event.timestamp,
      event_type: event.eventType,
      breaker_type: event.breakerType || null,
      reason: event.reason,
      equity: event.equity,
      operator_id: event.operatorId || null,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
    });

    return this.mapRowToEvent(row);
  }

  /**
   * Get the latest breaker event
   */
  async getLatestEvent(): Promise<BreakerEvent | null> {
    const row = await this.db.queryOne<BreakerRow>(
      `SELECT * FROM ${this.tableName} ORDER BY timestamp DESC LIMIT 1`,
    );

    return row ? this.mapRowToEvent(row) : null;
  }

  /**
   * Get the latest trigger event (to check if breaker is active)
   */
  async getLatestTrigger(): Promise<BreakerEvent | null> {
    const row = await this.db.queryOne<BreakerRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE event_type = 'TRIGGER' 
       ORDER BY timestamp DESC 
       LIMIT 1`,
    );

    return row ? this.mapRowToEvent(row) : null;
  }

  /**
   * Check if circuit breaker is currently active
   */
  async isActive(): Promise<boolean> {
    // Get the most recent event
    const latestEvent = await this.getLatestEvent();

    if (!latestEvent) {
      return false;
    }

    // If the latest event is a TRIGGER, breaker is active
    // If the latest event is a RESET, breaker is inactive
    return latestEvent.eventType === 'TRIGGER';
  }

  /**
   * Get event history
   */
  async getHistory(limit: number = 50): Promise<BreakerEvent[]> {
    const rows = await this.db.queryAll<BreakerRow>(
      `SELECT * FROM ${this.tableName} 
       ORDER BY timestamp DESC 
       LIMIT $1`,
      [limit],
    );

    return rows.map((row) => this.mapRowToEvent(row));
  }

  /**
   * Get trigger events within a time range
   */
  async getTriggerEvents(startTime: number, endTime: number): Promise<BreakerEvent[]> {
    const rows = await this.db.queryAll<BreakerRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE event_type = 'TRIGGER' AND timestamp >= $1 AND timestamp <= $2 
       ORDER BY timestamp DESC`,
      [startTime, endTime],
    );

    return rows.map((row) => this.mapRowToEvent(row));
  }

  /**
   * Get trigger count by reason
   */
  async getTriggerCountByReason(windowMs: number): Promise<Map<string, number>> {
    const cutoff = Date.now() - windowMs;
    const rows = await this.db.queryAll<{ reason: string; count: string }>(
      `SELECT reason, COUNT(*) as count 
       FROM ${this.tableName} 
       WHERE event_type = 'TRIGGER' AND timestamp >= $1 
       GROUP BY reason 
       ORDER BY count DESC`,
      [cutoff],
    );

    const summary = new Map<string, number>();
    for (const row of rows) {
      // eslint-disable-next-line functional/immutable-data
      summary.set(row.reason, parseInt(row.count, 10));
    }

    return summary;
  }

  /**
   * Get events by operator (for audit trail)
   */
  async getEventsByOperator(operatorId: string, limit: number = 50): Promise<BreakerEvent[]> {
    const rows = await this.db.queryAll<BreakerRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE operator_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [operatorId, limit],
    );

    return rows.map((row) => this.mapRowToEvent(row));
  }

  /**
   * Get time since last trigger
   */
  async getTimeSinceLastTrigger(): Promise<number | null> {
    const latestTrigger = await this.getLatestTrigger();

    if (!latestTrigger) {
      return null;
    }

    return Date.now() - latestTrigger.timestamp;
  }

  /**
   * Map database row to BreakerEvent
   */
  private mapRowToEvent(row: BreakerRow): BreakerEvent {
    return {
      id: row.id,
      timestamp: parseInt(row.timestamp, 10),
      eventType: row.event_type as 'TRIGGER' | 'RESET',
      breakerType: row.breaker_type as BreakerType | undefined,
      reason: row.reason,
      equity: parseFloat(row.equity),
      operatorId: row.operator_id || undefined,
      metadata: row.metadata || undefined,
    };
  }
}
