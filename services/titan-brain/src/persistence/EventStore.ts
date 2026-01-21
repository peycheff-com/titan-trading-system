import { DatabaseManager } from '../db/DatabaseManager.js';
import { getNatsClient, NatsClient } from '@titan/shared';
import { TitanEvent, TitanEventSchema } from '../events/EventTypes.js';
import { logger } from '../utils/Logger.js';

export class EventStore {
  private nats: NatsClient;

  constructor(private readonly db: DatabaseManager) {
    this.nats = getNatsClient();
  }

  /**
   * Persist an event to the database and publish it to NATS
   */
  async append(event: TitanEvent): Promise<void> {
    // Validate event schema
    const validation = TitanEventSchema.safeParse(event);
    if (!validation.success) {
      logger.error('Invalid event schema', new Error(JSON.stringify(validation.error.format())));
      throw new Error(`Invalid event schema: ${validation.error.message}`);
    }

    try {
      // 1. Persist to Postgres
      // We use the pool directly or db manager helper
      await this.db.query(
        `INSERT INTO event_log (id, type, aggregate_id, payload, metadata, version)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          event.id,
          event.type,
          event.aggregateId,
          JSON.stringify(event.payload),
          JSON.stringify(event.metadata),
          event.metadata.version,
        ],
      );

      // 2. Publish to NATS
      // Subject format: titan.events.<type>
      const subject = `titan.events.${event.type.toLowerCase()}`;

      await this.nats.publishEnvelope(subject, event.payload, {
        type: `titan.event.${event.type.toLowerCase()}.v1`,
        version: event.metadata.version || 1,
        producer: 'titan-brain',
        id: event.id,
        correlation_id: event.metadata.traceId, // Using traceId as correlation_id
        causation_id: event.aggregateId, // Mapping aggregateId loosely to causation/context
      });

      logger.debug(
        `Event appended and published: ${event.type} id=${event.id} traceId=${event.metadata.traceId}`,
      );
    } catch (error) {
      logger.error(`Failed to append event ${event.type}`, error as Error);
      throw error;
    }
  }

  /**
   * Replay events for a specific aggregate
   */
  async getStream(aggregateId: string): Promise<TitanEvent[]> {
    const result = await this.db.query<any>(
      `SELECT * FROM event_log WHERE aggregate_id = $1 ORDER BY created_at ASC`,
      [aggregateId],
    );

    return result.rows.map(this.mapRowToEvent);
  }

  /**
   * Replay all events (e.g. for state reconstruction)
   */
  async replayAll(options?: { startTime?: Date; type?: string }): Promise<TitanEvent[]> {
    let query = `SELECT * FROM event_log`;
    const params: any[] = [];
    const conditions: string[] = [];

    if (options?.startTime) {
      conditions.push(`created_at >= $${params.length + 1}`);
      params.push(options.startTime);
    }

    if (options?.type) {
      conditions.push(`type = $${params.length + 1}`);
      params.push(options.type);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY created_at ASC`;

    const result = await this.db.query<any>(query, params);
    return result.rows.map(this.mapRowToEvent);
  }

  private mapRowToEvent(row: any): TitanEvent {
    return {
      id: row.id,
      type: row.type,
      aggregateId: row.aggregate_id,
      payload: row.payload, // pg driver parses JSON automatically
      metadata: row.metadata, // pg driver parses JSON automatically
    };
  }
}
