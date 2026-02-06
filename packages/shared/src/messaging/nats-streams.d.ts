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
export declare const JsRetentionPolicy: {
    readonly Limits: "limits";
    readonly Interest: "interest";
    readonly WorkQueue: "workqueue";
};
/**
 * NATS JetStream storage types
 */
export declare const JsStorageType: {
    readonly Memory: "memory";
    readonly File: "file";
};
/**
 * NATS JetStream discard policies
 */
export declare const JsDiscardPolicy: {
    readonly Old: "old";
    readonly New: "new";
};
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
/**
 * Stream configurations for JetStream
 */
export declare const TITAN_STREAMS: {
    /**
     * Venue Status Stream
     * Stores venue health/status updates for replay/recovery
     */
    readonly VENUE_STATUS: {
        name: string;
        subjects: string[];
        retention: "limits";
        storage: "memory";
        max_msgs: number;
        max_age_ns: number;
        discard: "old";
        num_replicas: number;
        description: string;
    };
    /**
     * Market Trades Stream
     * High-volume stream for normalized trade events
     */
    readonly MARKET_TRADES: {
        name: string;
        subjects: string[];
        retention: "limits";
        storage: "file";
        max_msgs: number;
        max_age_ns: number;
        max_bytes: number;
        discard: "old";
        num_replicas: number;
        description: string;
    };
    /**
     * OrderBook Stream
     * High-volume stream for orderbook changes
     */
    readonly ORDERBOOKS: {
        name: string;
        subjects: string[];
        retention: "limits";
        storage: "file";
        max_msgs: number;
        max_age_ns: number;
        max_bytes: number;
        discard: "old";
        num_replicas: number;
        description: string;
    };
    /**
     * Execution Events Stream
     * Order lifecycle events for audit and replay
     */
    readonly EXECUTION_EVENTS: {
        name: string;
        subjects: string[];
        retention: "limits";
        storage: "file";
        max_msgs: number;
        max_age_ns: number;
        discard: "old";
        num_replicas: number;
        description: string;
    };
};
/**
 * KV Bucket configurations
 */
export declare const TITAN_KV_BUCKETS: {
    /**
     * Live Venue Status KV
     * Real-time venue health state (last-value semantic)
     */
    readonly VENUE_STATUS: {
        bucket: string;
        history: number;
        ttl_ms: number;
        storage: "memory";
        num_replicas: number;
        description: string;
    };
    /**
     * Configuration KV
     * Runtime configuration values
     */
    readonly CONFIG: {
        bucket: string;
        history: number;
        storage: "file";
        num_replicas: number;
        description: string;
    };
    /**
     * Instrument Metadata KV
     * Cached instrument specifications per venue
     */
    readonly INSTRUMENTS: {
        bucket: string;
        history: number;
        ttl_ms: number;
        storage: "file";
        num_replicas: number;
        description: string;
    };
};
/**
 * Consumer configurations for durable subscriptions
 */
export declare const TITAN_CONSUMERS: {
    /**
     * Brain Venue Status Consumer
     * Durable consumer for Brain service to process venue status
     */
    readonly BRAIN_VENUE_STATUS: {
        durable_name: string;
        filter_subject: string;
        ack_policy: "explicit";
        deliver_policy: "last";
        max_deliver: number;
        ack_wait_ns: number;
    };
    /**
     * Analytics Trade Consumer
     * Durable consumer for trade analytics processing
     */
    readonly ANALYTICS_TRADES: {
        durable_name: string;
        filter_subject: string;
        ack_policy: "explicit";
        deliver_policy: "new";
        max_deliver: number;
        ack_wait_ns: number;
    };
};
/**
 * Helper to get stream config by subject pattern
 */
export declare function getStreamForSubject(subject: string): keyof typeof TITAN_STREAMS | undefined;
/**
 * Get all stream names
 */
export declare function getAllStreamNames(): string[];
/**
 * Get all KV bucket names
 */
export declare function getAllKvBucketNames(): string[];
//# sourceMappingURL=nats-streams.d.ts.map