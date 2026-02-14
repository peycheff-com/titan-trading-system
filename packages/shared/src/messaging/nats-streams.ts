/**
 * nats-streams.ts
 *
 * NATS JetStream configurations for Titan.
 * Defines stream and KV bucket configurations for venue telemetry and market data.
 *
 * These are configuration templates - actual stream/KV creation uses NATS client APIs.
 */
import { TITAN_SUBJECTS } from './titan_subjects.js';

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
  /** Explicit backoff schedule (nanoseconds). If set, overrides linear ack_wait for redelivery. */
  backoff_ns?: readonly number[];
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
    subjects: [TITAN_SUBJECTS.DATA.VENUES.STATUS],
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
    subjects: [TITAN_SUBJECTS.DATA.VENUES.TRADES_ALL],
    retention: JsRetentionPolicy.Limits,
    storage: JsStorageType.File,
    max_msgs: 10_000_000,
    max_age_ns: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days in nanoseconds
    max_bytes: 20 * 1024 * 1024 * 1024, // 20GB
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
    subjects: [TITAN_SUBJECTS.DATA.VENUES.ORDERBOOKS_ALL],
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
      TITAN_SUBJECTS.EVT.EXECUTION.FILL,
      TITAN_SUBJECTS.EVT.EXECUTION.SHADOW_FILL,
      TITAN_SUBJECTS.EVT.EXECUTION.REPORT,
      TITAN_SUBJECTS.EVT.EXECUTION.REJECT,
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
   * Execution Core Consumer (mirrors Rust EXECUTION_CORE)
   * Durable consumer for intent command processing with exponential backoff
   */
  EXECUTION_CORE: {
    durable_name: 'EXECUTION_CORE',
    filter_subject: TITAN_SUBJECTS.CMD.EXECUTION.ALL,
    ack_policy: 'explicit',
    deliver_policy: 'all',
    max_deliver: 5,
    ack_wait_ns: 30 * 1_000_000_000, // 30 seconds
    backoff_ns: [
      1 * 1_000_000_000, // 1s
      5 * 1_000_000_000, // 5s
      15 * 1_000_000_000, // 15s
      30 * 1_000_000_000, // 30s
    ],
  } satisfies TitanConsumerConfig,

  /**
   * Brain Venue Status Consumer
   * Durable consumer for Brain service to process venue status
   */
  BRAIN_VENUE_STATUS: {
    durable_name: 'brain-venue-status',
    filter_subject: TITAN_SUBJECTS.DATA.VENUES.STATUS,
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
    filter_subject: TITAN_SUBJECTS.DATA.VENUES.TRADES_ALL,
    ack_policy: 'explicit',
    deliver_policy: 'new',
    max_deliver: 3,
    ack_wait_ns: 60 * 1_000_000_000, // 60 seconds
  } satisfies TitanConsumerConfig,

  /**
   * DLQ Monitor Consumer
   * Durable consumer for ops/alerting on dead-lettered messages
   */
  DLQ_MONITOR: {
    durable_name: 'dlq-monitor',
    filter_subject: TITAN_SUBJECTS.DLQ.ALL,
    ack_policy: 'explicit',
    deliver_policy: 'new',
    max_deliver: 1,
    ack_wait_ns: 120 * 1_000_000_000, // 2 minutes
  } satisfies TitanConsumerConfig,
} as const;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Helper to get stream config by subject pattern
 */
export function getStreamForSubject(subject: string): keyof typeof TITAN_STREAMS | undefined {
  if (subject.startsWith(TITAN_SUBJECTS.DATA.VENUES.STATUS)) {
    return 'VENUE_STATUS';
  }
  if (subject.startsWith(TITAN_SUBJECTS.DATA.VENUES.TRADES_PREFIX)) {
    return 'MARKET_TRADES';
  }
  if (subject.startsWith(TITAN_SUBJECTS.EVT.EXECUTION.PREFIX)) {
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
