/* eslint-disable functional/immutable-data, functional/no-let -- Stateful runtime: mutations architecturally required */
/**
 * VenueStatusStore - Caches live venue telemetry from Hunter via NATS
 *
 * Subscribes to titan.data.venues.status.v1, validates with Zod,
 * and serves the VenuesController with live or cached status.
 */
import { EventEmitter } from 'events';
import {
  ALL_VENUE_IDS,
  deriveRecommendedAction,
  getNatsClient,
  safeParseVenueConfigV1,
  safeParseVenueStatusV1,
  TITAN_KV_BUCKETS,
  TITAN_SUBJECTS,
  type VenueConfigV1,
  VenueId,
  VenueRecommendedAction,
  type VenueStatusV1,
  VenueWsState,
} from '@titan/shared';
import { Logger } from '../../logging/Logger.js';
import { MetricsCollector } from '../../metrics/MetricsCollector.js';

/**
 * Configuration for the venue status store
 */
export interface VenueStatusStoreConfig {
  /** NATS subject to subscribe to */
  subject: string;
  /** Default staleness threshold in ms (default 30s) */
  staleThresholdMs: number;
  /** How long to keep status entry after going stale (ms) */
  evictAfterStalenessMs: number;
}

const DEFAULT_CONFIG: VenueStatusStoreConfig = {
  subject: TITAN_SUBJECTS.DATA.VENUES.STATUS,
  staleThresholdMs: 30_000,
  evictAfterStalenessMs: 300_000, // 5 minutes
};

/**
 * Cached venue status entry
 */
export interface CachedVenueStatus {
  status: VenueStatusV1;
  receivedAt: Date;
  staleAt: Date;
  isStale: boolean;
  recommendedAction: VenueRecommendedAction;
  effectiveThresholdMs: number;
}

/**
 * VenueStatusStore
 *
 * Single source of truth for live venue status in Brain.
 */
export class VenueStatusStore extends EventEmitter {
  private readonly config: VenueStatusStoreConfig;
  private readonly logger: Logger;
  private readonly metricsCollector: MetricsCollector | null;
  private readonly cache: Map<VenueId, CachedVenueStatus> = new Map();
  private readonly venueConfigs: Map<VenueId, VenueConfigV1> = new Map();
  private subscriptionActive = false;
  private evictionTimer: NodeJS.Timeout | null = null;

  constructor(
    config: Partial<VenueStatusStoreConfig> = {},
    logger?: Logger,
    metricsCollector?: MetricsCollector,
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? Logger.getInstance('VenueStatusStore');
    this.metricsCollector = metricsCollector ?? null;
  }

  /**
   * Start subscribing to NATS venue status events and config KV
   */
  async start(): Promise<void> {
    if (this.subscriptionActive) {
      return;
    }

    const nats = getNatsClient();
    if (!nats.isConnected()) {
      await nats.connect();
    }

    this.logger.info(`Subscribing to venue status updates on ${this.config.subject}`);

    nats.subscribe(this.config.subject, (data: unknown) => {
      this.handleMessage(data);
    });

    // Watch for config updates
    this.watchConfigUpdates().catch((err) => {
      this.logger.error(`Failed to watch config KV: ${err}`);
    });

    this.subscriptionActive = true;

    // Start eviction timer
    this.evictionTimer = setInterval(() => {
      this.evictStaleEntries();
    }, this.config.staleThresholdMs);

    this.emit('started');
  }

  /**
   * Watch for venue configuration changes in KV
   */
  private async watchConfigUpdates(): Promise<void> {
    const nats = getNatsClient();
    const bucket = TITAN_KV_BUCKETS.CONFIG.bucket;

    try {
      const watcher = await nats.kvWatch(bucket, {
        key: 'config.venue.>',
      });

      // Process updates in background
      (async () => {
        for await (const entry of watcher) {
          const key = entry.key;
          const operation = entry.operation;
          const venueId = key.split('.').pop() as VenueId | undefined;

          if (!venueId || !ALL_VENUE_IDS.includes(venueId)) {
            continue;
          }

          if (operation === 'DEL' || operation === 'PURGE') {
            this.venueConfigs.delete(venueId);
            this.logger.info(`Venue config removed for ${venueId}`);
          } else if (entry.value.length > 0) {
            const value = JSON.parse(new TextDecoder().decode(entry.value));
            const result = safeParseVenueConfigV1(value);
            if (result.success) {
              this.venueConfigs.set(venueId, result.data);
              this.logger.info(
                `Venue config updated for ${venueId}, threshold: ${result.data.staleness_threshold_ms}ms`,
              );
            } else {
              this.logger.warn(
                `Invalid venue config for ${venueId}: ${JSON.stringify(result.error)}`,
              );
            }
          }

          // Re-evaluate staleness for this venue immediately
          this.refreshStaleness(venueId);
        }
      })().catch((err) => {
        this.logger.warn(`Config KV watch processing failed: ${err}`);
      });
    } catch (err) {
      this.logger.warn(`Config KV watch failed (bucket likely missing): ${err}`);
    }
  }

  /**
   * Bootstrap venue status from KV bucket on startup
   * Loads any existing snapshots from Hunter before stream subscription
   */
  async bootstrapFromKV(): Promise<void> {
    const nats = getNatsClient();
    if (!nats.isConnected()) {
      this.logger.warn('Cannot bootstrap from KV - NATS not connected');
      return;
    }

    const bucket = TITAN_KV_BUCKETS.VENUE_STATUS.bucket;

    try {
      const keys = await nats.kvKeys(bucket);
      this.logger.info(`KV bootstrap: found ${keys.length} venue snapshots`);

      for (const key of keys) {
        const data = await nats.kvGet<VenueStatusV1>(bucket, key);
        if (data) {
          const result = safeParseVenueStatusV1(data);
          if (result.success) {
            // Mark as stale since it's from KV (may be old)
            const now = new Date();
            const threshold = this.getThresholdForVenue(result.data.venue);
            const staleAt = new Date(now.getTime() + threshold);
            const wsState = result.data.ws.state as VenueWsState;

            const cached: CachedVenueStatus = {
              status: result.data,
              receivedAt: now,
              staleAt,
              isStale: false,
              recommendedAction: deriveRecommendedAction(wsState, false),
              effectiveThresholdMs: threshold,
            };

            this.cache.set(result.data.venue, cached);
            this.logger.debug(`KV bootstrap: loaded ${result.data.venue}`);
          }
        }
      }

      this.emit('bootstrap_complete', { venuesLoaded: keys.length });
    } catch (err) {
      this.logger.warn(`KV bootstrap failed: ${err}`);
      this.emit('bootstrap_error', err);
    }
  }

  /**
   * Stop the subscription
   */
  stop(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
    this.subscriptionActive = false;
    this.logger.info('VenueStatusStore stopped');
    this.emit('stopped');
  }

  /**
   * Handle incoming NATS message
   */
  private handleMessage(data: unknown): void {
    // Extract payload from envelope if wrapped
    const payload =
      data && typeof data === 'object' && 'payload' in data
        ? (data as { payload: unknown }).payload
        : data;

    const result = safeParseVenueStatusV1(payload);

    if (!result.success) {
      this.logger.warn(`Invalid venue status message: ${JSON.stringify(result.error?.errors)}`);
      this.emit('validation_error', result.error);
      return;
    }

    const status = result.data;
    const now = new Date();
    const threshold = this.getThresholdForVenue(status.venue);
    const staleAt = new Date(now.getTime() + threshold);
    const wsState = status.ws.state as VenueWsState;

    const cached: CachedVenueStatus = {
      status,
      receivedAt: now,
      staleAt,
      isStale: false,
      recommendedAction: deriveRecommendedAction(wsState, false),
      effectiveThresholdMs: threshold,
    };

    this.cache.set(status.venue, cached);

    // Emit venue metrics
    if (this.metricsCollector) {
      const stateStr =
        wsState === VenueWsState.CONNECTED
          ? 'connected'
          : wsState === VenueWsState.DEGRADED
            ? 'degraded'
            : wsState === VenueWsState.DISCONNECTED
              ? 'disconnected'
              : 'unknown';
      this.metricsCollector.recordVenueStatus(status.venue, stateStr, false);
    }

    this.emit('status_updated', cached);
  }

  /**
   * Get status for a specific venue
   */
  getVenueStatus(venueId: VenueId): CachedVenueStatus | null {
    const cached = this.cache.get(venueId);
    if (!cached) {
      return null;
    }

    // Update staleness on access
    this.refreshStaleness(venueId);

    return this.cache.get(venueId) || null;
  }

  /**
   * Helper to refresh staleness for a cached entry
   */
  private refreshStaleness(venueId: VenueId): void {
    const cached = this.cache.get(venueId);
    if (!cached) return;

    const now = new Date();
    const threshold = this.getThresholdForVenue(venueId);

    // Recalculate staleAt based on received time + current threshold
    cached.staleAt = new Date(cached.receivedAt.getTime() + threshold);
    cached.effectiveThresholdMs = threshold;

    cached.isStale = now > cached.staleAt;
    if (cached.isStale) {
      const wsState = cached.status.ws.state as VenueWsState;
      cached.recommendedAction = deriveRecommendedAction(wsState, true);
    } else {
      const wsState = cached.status.ws.state as VenueWsState;
      cached.recommendedAction = deriveRecommendedAction(wsState, false);
    }
  }

  private getThresholdForVenue(venueId: VenueId): number {
    const config = this.venueConfigs.get(venueId);
    return config?.staleness_threshold_ms || this.config.staleThresholdMs;
  }

  /**
   * Get all venue statuses
   */
  getAllVenueStatuses(): Map<VenueId, CachedVenueStatus> {
    // Update staleness for all entries
    for (const venueId of this.cache.keys()) {
      this.refreshStaleness(venueId);
    }

    return this.cache;
  }

  /**
   * Get summary of venue connectivity
   */
  getSummary(): {
    total: number;
    connected: number;
    degraded: number;
    disconnected: number;
    stale: number;
    unknown: number;
  } {
    let connected = 0;
    let degraded = 0;
    let disconnected = 0;
    let stale = 0;

    // Refresh all before summarizing
    this.getAllVenueStatuses();

    const now = new Date();

    for (const cached of this.cache.values()) {
      if (cached.isStale) {
        stale++;
        continue;
      }

      switch (cached.status.ws.state) {
        case VenueWsState.CONNECTED:
          connected++;
          break;
        case VenueWsState.DEGRADED:
          degraded++;
          break;
        case VenueWsState.DISCONNECTED:
          disconnected++;
          break;
      }
    }

    const known = connected + degraded + disconnected + stale;
    const unknown = ALL_VENUE_IDS.length - known;

    // Emit summary metrics
    if (this.metricsCollector) {
      this.metricsCollector.recordVenueSummary(connected, ALL_VENUE_IDS.length);
    }

    return {
      total: ALL_VENUE_IDS.length,
      connected,
      degraded,
      disconnected,
      stale,
      unknown,
    };
  }

  /**
   * Evict entries that have been stale too long
   */
  private evictStaleEntries(): void {
    const now = new Date();
    const evictBefore = new Date(now.getTime() - this.config.evictAfterStalenessMs);

    for (const [venueId, cached] of this.cache) {
      // Check staleness first
      this.refreshStaleness(venueId);

      if (cached.staleAt < evictBefore) {
        this.cache.delete(venueId);
        this.logger.debug(`Evicted stale venue status: ${venueId}`);
        this.emit('status_evicted', venueId);
      }
    }
  }

  /**
   * Check if the store has any data
   */
  hasData(): boolean {
    return this.cache.size > 0;
  }

  /**
   * Check if subscription is active
   */
  isActive(): boolean {
    return this.subscriptionActive;
  }
}

// Singleton instance
let venueStatusStoreInstance: VenueStatusStore | null = null;

/**
 * Get singleton VenueStatusStore instance
 */
export function getVenueStatusStore(): VenueStatusStore {
  if (!venueStatusStoreInstance) {
    venueStatusStoreInstance = new VenueStatusStore();
  }
  return venueStatusStoreInstance;
}

/**
 * Reset singleton (for testing)
 */
export function resetVenueStatusStore(): void {
  if (venueStatusStoreInstance) {
    venueStatusStoreInstance.stop();
    venueStatusStoreInstance = null;
  }
}
