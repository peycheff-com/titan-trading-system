/**
 * OrderBookPublisher - Publishes orderbook deltas/snapshots to NATS
 */
import { EventEmitter } from 'events';
import {
  getNatsClient,
  InstrumentType,
  type OrderBookDeltaV1,
  TITAN_SUBJECTS,
  VenueId,
} from '@titan/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * Configuration for orderbook publisher
 */
export interface OrderBookPublisherConfig {
  /** Hunter instance identifier for tracing */
  readonly instanceId: string;
  /** Enable/disable publishing */
  readonly enabled: boolean;
  /** Max deltas to buffer before dropping (backpressure) */
  readonly maxBufferSize: number;
  /** Flush interval for buffered deltas (ms) */
  readonly flushIntervalMs: number;
}

const DEFAULT_CONFIG: OrderBookPublisherConfig = {
  instanceId: `hunter-${uuidv4().slice(0, 8)}`,
  enabled: true,
  maxBufferSize: 5000, // Stricter buffer for OBs (larger payload)
  flushIntervalMs: 50, // Faster flush for OBs
};

interface PublisherState {
  readonly deltaBuffer: readonly OrderBookDeltaV1[];
  readonly flushTimer: NodeJS.Timeout | null;
  readonly isPublishing: boolean;
  readonly deltasPublished: number;
  readonly deltasDropped: number;
  readonly lastFlushTime: number;
}

const INITIAL_STATE: PublisherState = {
  deltaBuffer: [],
  flushTimer: null,
  isPublishing: false,
  deltasPublished: 0,
  deltasDropped: 0,
  lastFlushTime: 0,
};

export class OrderBookPublisher extends EventEmitter {
  private readonly config: OrderBookPublisherConfig;
  private state: PublisherState = INITIAL_STATE;

  constructor(config: Partial<OrderBookPublisherConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (this.state.flushTimer) return;

    console.log(`[OrderBookPublisher] Starting (flush=${this.config.flushIntervalMs}ms)`);

    const timer = setInterval(() => {
      this.flushBuffer().catch(err => {
        console.error('[OrderBookPublisher] Flush error:', err);
        this.emit('error', err);
      });
    }, this.config.flushIntervalMs);

    // eslint-disable-next-line functional/immutable-data -- internal publisher state transition
    this.state = { ...this.state, flushTimer: timer };
  }

  stop(): void {
    if (this.state.flushTimer) {
      clearInterval(this.state.flushTimer);
      // eslint-disable-next-line functional/immutable-data -- internal publisher state transition
      this.state = { ...this.state, flushTimer: null };
    }
    this.flushBuffer().catch(console.error);
    console.log(`[OrderBookPublisher] Stopped (published=${this.state.deltasPublished})`);
  }

  /**
   * Publish an orderbook update (snapshot or delta)
   */
  publish(
    venue: VenueId,
    symbol: string,
    bids: [string, string][],
    asks: [string, string][],
    sequence: number,
    isSnapshot: boolean
  ): void {
    if (!this.config.enabled) return;

    const delta: OrderBookDeltaV1 = {
      v: 1,
      ts: new Date().toISOString(),
      venue,
      symbol,
      bids,
      asks,
      sequence,
      is_snapshot: isSnapshot,
      meta: {
        hunter_instance_id: this.config.instanceId,
      },
    };

    if (this.state.deltaBuffer.length >= this.config.maxBufferSize) {
      // Drop oldest
      // eslint-disable-next-line functional/immutable-data -- internal publisher state transition
      this.state = {
        ...this.state,
        deltaBuffer: [...this.state.deltaBuffer.slice(1), delta],
        deltasDropped: this.state.deltasDropped + 1,
      };
    } else {
      // eslint-disable-next-line functional/immutable-data -- internal publisher state transition
      this.state = {
        ...this.state,
        deltaBuffer: [...this.state.deltaBuffer, delta],
      };
    }
  }

  private async flushBuffer(): Promise<void> {
    if (this.state.isPublishing || this.state.deltaBuffer.length === 0) {
      return;
    }

    // eslint-disable-next-line functional/immutable-data -- internal publisher state transition
    this.state = { ...this.state, isPublishing: true };
    const startTime = Date.now();

    try {
      const nats = getNatsClient();
      if (!nats.isConnected()) return;

      const deltas = this.state.deltaBuffer;
      // eslint-disable-next-line functional/immutable-data -- internal publisher state transition
      this.state = { ...this.state, deltaBuffer: [] };
      const published = deltas.length;
      for (const delta of deltas) {
        const subject = TITAN_SUBJECTS.DATA.VENUES.ORDERBOOKS(
          delta.venue,
          delta.symbol.replace('/', '_')
        );
        await nats.publish(subject, delta);
      }

      // eslint-disable-next-line functional/immutable-data -- internal publisher state transition
      this.state = {
        ...this.state,
        deltasPublished: this.state.deltasPublished + published,
        lastFlushTime: Date.now() - startTime,
      };
    } finally {
      // eslint-disable-next-line functional/immutable-data -- internal publisher state transition
      this.state = { ...this.state, isPublishing: false };
    }
  }

  getStats() {
    return {
      published: this.state.deltasPublished,
      dropped: this.state.deltasDropped,
      buffer: this.state.deltaBuffer.length,
    };
  }
}

// Singleton
// eslint-disable-next-line functional/no-let
let instance: OrderBookPublisher | null = null;

export function getOrderBookPublisher(
  config?: Partial<OrderBookPublisherConfig>
): OrderBookPublisher {
  if (!instance) {
    instance = new OrderBookPublisher(config);
  }
  return instance;
}
