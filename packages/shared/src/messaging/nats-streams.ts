/**
 * nats-streams.ts
 *
 * NATS JetStream configurations for Titan.
 * Defines stream and KV bucket configurations for venue telemetry and market data.
 *
 * These are configuration templates - actual stream/KV creation uses NATS client APIs.
 */

/**
 * NATS JetStream retention policies
 */
export const JsRetentionPolicy = {
  Limits: 'limits',
  Interest: 'interest',
  WorkQueue: 'workqueue',
} as const;

/**
 * NATS JetStream storage types
 */
export const JsStorageType = {
  Memory: 'memory',
  File: 'file',
} as const;

/**
 * NATS JetStream discard policies
 */
export const JsDiscardPolicy = {
  Old: 'old',
  New: 'new',
} as const;

/**
 * Stream configuration interface
 */
export interface TitanStreamConfig {
  name: string;
  subjects: readonly string[];
  retention: (typeof JsRetentionPolicy)[keyof typeof JsRetentionPolicy];
  storage: (typeof JsStorageType)[keyof typeof JsStorageType];
  max_msgs: number;
  max_age_ns: number;
  max_bytes?: number;
  discard: (typeof JsDiscardPolicy)[keyof typeof JsDiscardPolicy];
  num_replicas: number;
  description: string;
}

/**
 * KV bucket configuration interface
 */
export interface TitanKvConfig {
  bucket: string;
  history: number;
  ttl_ms?: number;
  storage: (typeof JsStorageType)[keyof typeof JsStorageType];
  num_replicas: number;
  description: string;
}

/**
 * Consumer configuration interface
 */
export interface TitanConsumerConfig {
  durable_name: string;
  filter_subject: string;
  ack_policy: 'none' | 'all' | 'explicit';
  deliver_policy: 'all' | 'last' | 'new' | 'by_start_sequence' | 'by_start_time';
  max_deliver: number;
  ack_wait_ns: number;
}

// =============================================================================
// STREAM CONFIGURATIONS
// =============================================================================

/**
 * Stream configurations for JetStream
 */
export const TITAN_STREAMS = {
  /**
   * Venue Status Stream
   * Stores venue health/status updates for replay/recovery
   */
  VENUE_STATUS: {
    name: 'TITAN_VENUE_STATUS',
    subjects: ['titan.data.venues.status.v1'],
    retention: JsRetentionPolicy.Limits,
    storage: JsStorageType.Memory,
    max_msgs: 1000,
    max_age_ns: 24 * 60 * 60 * 1_000_000_000, // 24 hours in nanoseconds
    discard: JsDiscardPolicy.Old,
    num_replicas: 1,
    description: 'Venue health status telemetry from Hunter',
  } satisfies TitanStreamConfig,

  /**
   * Market Trades Stream
   * High-volume stream for normalized trade events
   */
  MARKET_TRADES: {
    name: 'TITAN_MARKET_TRADES',
    subjects: ['titan.data.venues.trades.v1.>'],
    retention: JsRetentionPolicy.Limits,
    storage: JsStorageType.File,
    max_msgs: 1_000_000,
    max_age_ns: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days in nanoseconds
    max_bytes: 10 * 1024 * 1024 * 1024, // 10GB
    discard: JsDiscardPolicy.Old,
    num_replicas: 1,
    description: 'Normalized market trade events from all venues',
  } satisfies TitanStreamConfig,

  /**
   * OrderBook Stream
   * High-volume stream for orderbook changes
   */
  ORDERBOOKS: {
    name: 'TITAN_ORDERBOOKS',
    subjects: ['titan.data.venues.orderbooks.v1.>'],
    retention: JsRetentionPolicy.Limits,
    storage: JsStorageType.File,
    max_msgs: 1_000_000,
    max_age_ns: 24 * 60 * 60 * 1_000_000_000, // 24 hours
    max_bytes: 10 * 1024 * 1024 * 1024, // 10GB
    discard: JsDiscardPolicy.Old,
    num_replicas: 1,
    description: 'Orderbook snapshots and deltas',
  } satisfies TitanStreamConfig,

  /**
   * Execution Events Stream
   * Order lifecycle events for audit and replay
   */
  EXECUTION_EVENTS: {
    name: 'TITAN_EXECUTION_EVENTS',
    subjects: [
      'titan.evt.execution.fill.v1',
      'titan.evt.execution.shadow_fill.v1',
      'titan.evt.exec.report.v1',
      'titan.evt.execution.reject.v1',
    ],
    retention: JsRetentionPolicy.Limits,
    storage: JsStorageType.File,
    max_msgs: 100_000,
    max_age_ns: 30 * 24 * 60 * 60 * 1_000_000_000, // 30 days in nanoseconds
    discard: JsDiscardPolicy.Old,
    num_replicas: 1,
    description: 'Order execution lifecycle events for audit trail',
  } satisfies TitanStreamConfig,
} as const;

// =============================================================================
// KV BUCKET CONFIGURATIONS
// =============================================================================

/**
 * KV Bucket configurations
 */
export const TITAN_KV_BUCKETS = {
  /**
   * Live Venue Status KV
   * Real-time venue health state (last-value semantic)
   */
  VENUE_STATUS: {
    bucket: 'titan-venue-status',
    history: 5,
    ttl_ms: 5 * 60 * 1000, // 5 minutes TTL per entry
    storage: JsStorageType.Memory,
    num_replicas: 1,
    description: 'Live venue connection status and health',
  } satisfies TitanKvConfig,

  /**
   * Configuration KV
   * Runtime configuration values
   */
  CONFIG: {
    bucket: 'titan-config',
    history: 10,
    storage: JsStorageType.File,
    num_replicas: 1,
    description: 'Runtime configuration overrides',
  } satisfies TitanKvConfig,

  /**
   * Instrument Metadata KV
   * Cached instrument specifications per venue
   */
  INSTRUMENTS: {
    bucket: 'titan-instruments',
    history: 3,
    ttl_ms: 24 * 60 * 60 * 1000, // 24 hours TTL
    storage: JsStorageType.File,
    num_replicas: 1,
    description: 'Cached instrument specifications from exchanges',
  } satisfies TitanKvConfig,
} as const;

// =============================================================================
// CONSUMER CONFIGURATIONS
// =============================================================================

/**
 * Consumer configurations for durable subscriptions
 */
export const TITAN_CONSUMERS = {
  /**
   * Brain Venue Status Consumer
   * Durable consumer for Brain service to process venue status
   */
  BRAIN_VENUE_STATUS: {
    durable_name: 'brain-venue-status',
    filter_subject: 'titan.data.venues.status.v1',
    ack_policy: 'explicit',
    deliver_policy: 'last',
    max_deliver: 5,
    ack_wait_ns: 30 * 1_000_000_000, // 30 seconds
  } satisfies TitanConsumerConfig,

  /**
   * Analytics Trade Consumer
   * Durable consumer for trade analytics processing
   */
  ANALYTICS_TRADES: {
    durable_name: 'analytics-trades',
    filter_subject: 'titan.data.venues.trades.v1.>',
    ack_policy: 'explicit',
    deliver_policy: 'new',
    max_deliver: 3,
    ack_wait_ns: 60 * 1_000_000_000, // 60 seconds
  } satisfies TitanConsumerConfig,
} as const;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Helper to get stream config by subject pattern
 */
export function getStreamForSubject(subject: string): keyof typeof TITAN_STREAMS | undefined {
  if (subject.startsWith('titan.data.venues.status')) {
    return 'VENUE_STATUS';
  }
  if (subject.startsWith('titan.data.venues.trades')) {
    return 'MARKET_TRADES';
  }
  if (subject.startsWith('titan.evt.execution') || subject.startsWith('titan.evt.exec')) {
    return 'EXECUTION_EVENTS';
  }
  return undefined;
}

/**
 * Get all stream names
 */
export function getAllStreamNames(): string[] {
  return Object.values(TITAN_STREAMS).map((s) => s.name);
}

/**
 * Get all KV bucket names
 */
export function getAllKvBucketNames(): string[] {
  return Object.values(TITAN_KV_BUCKETS).map((b) => b.bucket);
}
