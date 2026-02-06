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
};
/**
 * NATS JetStream storage types
 */
export const JsStorageType = {
    Memory: 'memory',
    File: 'file',
};
/**
 * NATS JetStream discard policies
 */
export const JsDiscardPolicy = {
    Old: 'old',
    New: 'new',
};
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
    },
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
    },
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
    },
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
    },
};
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
    },
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
    },
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
    },
};
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
    },
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
    },
};
// =============================================================================
// HELPERS
// =============================================================================
/**
 * Helper to get stream config by subject pattern
 */
export function getStreamForSubject(subject) {
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
export function getAllStreamNames() {
    return Object.values(TITAN_STREAMS).map((s) => s.name);
}
/**
 * Get all KV bucket names
 */
export function getAllKvBucketNames() {
    return Object.values(TITAN_KV_BUCKETS).map((b) => b.bucket);
}
//# sourceMappingURL=nats-streams.js.map