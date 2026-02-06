/**
 * VenueStatusPublisher - Publishes venue WebSocket health to NATS
 *
 * Hooks into MultiExchangeManager's healthUpdate events to publish
 * VenueStatusV1 events for consumption by titan-brain.
 */
import { EventEmitter } from 'events';
import {
  getNatsClient,
  TITAN_KV_BUCKETS,
  TITAN_SUBJECTS,
  VENUE_CAPABILITIES,
  VenueId,
  type VenueStatusV1,
  VenueWsState,
} from '@titan/shared';
import type { ConnectionHealth } from '../global-liquidity/ExchangeWebSocketClient';
import { ConnectionStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Configuration for venue status publisher
 */
export interface VenueStatusPublisherConfig {
  /** How often to publish status per venue (ms) */
  publishIntervalMs: number;
  /** Hunter instance identifier for tracing */
  instanceId: string;
  /** Optional build SHA for tracing */
  buildSha?: string;
  /** Reconnect threshold to consider degraded (15 min window) */
  reconnectThreshold15m: number;
  /** Parse error threshold to consider degraded (5 min window) */
  parseErrorThreshold5m: number;
  /** Message timeout to consider stale (ms) */
  messageTimeoutMs: number;
}

const DEFAULT_CONFIG: VenueStatusPublisherConfig = {
  publishIntervalMs: 1000,
  instanceId: `hunter-${uuidv4().slice(0, 8)}`,
  buildSha: process.env.BUILD_SHA,
  reconnectThreshold15m: 5,
  parseErrorThreshold5m: 10,
  messageTimeoutMs: 5000,
};

/**
 * Extended health with parse errors
 */
export interface ExtendedConnectionHealth extends ConnectionHealth {
  parseErrors5m?: number;
  wsUrl?: string;
}

// Map Hunter exchange names to VenueId
const EXCHANGE_TO_VENUE: Record<string, VenueId> = {
  binance: VenueId.BINANCE,
  bybit: VenueId.BYBIT,
  coinbase: VenueId.COINBASE,
  kraken: VenueId.KRAKEN,
  mexc: VenueId.MEXC,
  hyperliquid: VenueId.HYPERLIQUID,
  deribit: VenueId.DERIBIT,
};

/**
 * VenueStatusPublisher
 *
 * Subscribes to MultiExchangeManager healthUpdate events and publishes
 * VenueStatusV1 events to NATS.
 */
export class VenueStatusPublisher extends EventEmitter {
  private config: VenueStatusPublisherConfig;
  private publishTimer: NodeJS.Timeout | null = null;
  private latestHealth: Map<string, ExtendedConnectionHealth> = new Map();
  private isPublishing = false;
  private metricsEmitted = 0;

  constructor(config: Partial<VenueStatusPublisherConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the publisher
   */
  start(): void {
    if (this.publishTimer) {
      return;
    }

    console.log(`[VenueStatusPublisher] Starting (interval=${this.config.publishIntervalMs}ms)`);

    // eslint-disable-next-line functional/immutable-data -- lifecycle timer is internal mutable runtime state
    this.publishTimer = setInterval(() => {
      this.publishAllStatuses().catch(err => {
        console.error('[VenueStatusPublisher] Publish error:', err);
        this.emit('error', err);
      });
    }, this.config.publishIntervalMs);
  }

  /**
   * Stop the publisher
   */
  stop(): void {
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
      // eslint-disable-next-line functional/immutable-data -- lifecycle timer is internal mutable runtime state
      this.publishTimer = null;
    }
    console.log(`[VenueStatusPublisher] Stopped (published=${this.metricsEmitted})`);
  }

  /**
   * Update health data from MultiExchangeManager
   */
  updateHealth(healthMap: Map<string, ConnectionHealth>): void {
    const updates = Array.from(healthMap, ([exchange, health]) => {
      // Extend with parse errors if available
      const extended: ExtendedConnectionHealth = {
        ...health,
        parseErrors5m: (health as ExtendedConnectionHealth).parseErrors5m ?? 0,
        wsUrl: (health as ExtendedConnectionHealth).wsUrl ?? '',
      };
      return [exchange, extended] as const;
    });
    const updated = new Map([...this.latestHealth, ...updates]);
    // eslint-disable-next-line functional/immutable-data -- replace map snapshot atomically
    this.latestHealth = updated;
  }

  /**
   * Classify WebSocket state based on health metrics
   */
  classifyState(health: ExtendedConnectionHealth): VenueWsState {
    const now = Date.now();
    const msgAge = health.lastMessageTime ? now - health.lastMessageTime : Infinity;

    // Disconnected: status is not CONNECTED
    if (health.status !== ConnectionStatus.CONNECTED) {
      return VenueWsState.DISCONNECTED;
    }

    // Degraded: stale messages, reconnect storm, or high parse errors
    if (msgAge > this.config.messageTimeoutMs) {
      return VenueWsState.DEGRADED;
    }
    if (health.reconnectAttempts > this.config.reconnectThreshold15m) {
      return VenueWsState.DEGRADED;
    }
    if ((health.parseErrors5m ?? 0) > this.config.parseErrorThreshold5m) {
      return VenueWsState.DEGRADED;
    }

    return VenueWsState.CONNECTED;
  }

  /**
   * Build VenueStatusV1 from health data
   */
  buildStatus(exchange: string, health: ExtendedConnectionHealth): VenueStatusV1 | null {
    const venueId = EXCHANGE_TO_VENUE[exchange];
    if (!venueId) {
      return null; // Unknown exchange
    }

    const capabilities = VENUE_CAPABILITIES[venueId];
    const state = this.classifyState(health);
    const now = new Date().toISOString();

    return {
      v: 1,
      ts: now,
      venue: venueId,
      capabilities: {
        spot: capabilities.spot,
        perps: capabilities.perps,
        futures: capabilities.futures,
        options: capabilities.options,
        dex: capabilities.dex,
        enabled: capabilities.enabled,
      },
      ws: {
        state,
        url: health.wsUrl ?? '',
        since_ts: health.uptime > 0 ? new Date(Date.now() - health.uptime).toISOString() : null,
        last_msg_ts:
          health.lastMessageTime > 0 ? new Date(health.lastMessageTime).toISOString() : null,
        last_trade_ts: null, // Could be extended later
        ping_rtt_ms: health.latency ?? null,
        reconnects_15m: health.reconnectAttempts,
        parse_errors_5m: health.parseErrors5m ?? 0,
      },
      meta: {
        hunter_instance_id: this.config.instanceId,
        build_sha: this.config.buildSha,
      },
    };
  }

  /**
   * Publish status for all known venues
   */
  async publishAllStatuses(): Promise<void> {
    if (this.isPublishing || this.latestHealth.size === 0) {
      return;
    }

    // eslint-disable-next-line functional/immutable-data -- publish loop lock
    this.isPublishing = true;

    try {
      const nats = getNatsClient();
      if (!nats.isConnected()) {
        return;
      }

      const subject = TITAN_SUBJECTS.DATA.VENUES.STATUS;
      const kvBucket = TITAN_KV_BUCKETS.VENUE_STATUS.bucket;

      for (const [exchange, health] of this.latestHealth) {
        const status = this.buildStatus(exchange, health);
        if (!status) {
          continue;
        }

        // Publish to stream
        await nats.publish(subject, status);

        // Snapshot to KV bucket for Brain bootstrap
        await nats.kvPut(kvBucket, status.venue, status).catch(err => {
          console.warn(`[VenueStatusPublisher] KV write failed for ${status.venue}:`, err);
        });

        // eslint-disable-next-line functional/immutable-data -- telemetry counter
        this.metricsEmitted++;
      }
    } finally {
      // eslint-disable-next-line functional/immutable-data -- publish loop lock
      this.isPublishing = false;
    }
  }

  /**
   * Get publisher stats
   */
  getStats(): { metricsEmitted: number; venuesTracked: number } {
    return {
      metricsEmitted: this.metricsEmitted,
      venuesTracked: this.latestHealth.size,
    };
  }
}
