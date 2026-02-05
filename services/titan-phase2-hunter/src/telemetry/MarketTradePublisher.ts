/**
 * MarketTradePublisher - Publishes normalized market trades to NATS
 *
 * Listens to ExchangeWebSocketClient 'trade' events, normalizes symbols using
 * @titan/shared utilities, and publishes MarketTradeV1 events to NATS.
 */
import { EventEmitter } from 'events';
import {
  getNatsClient,
  InstrumentType,
  type MarketTradeV1,
  normalizeSymbol,
  TITAN_SUBJECTS,
  VenueId,
} from '@titan/shared';
import type { ExchangeTrade } from '../global-liquidity/ExchangeWebSocketClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Configuration for market trade publisher
 */
export interface MarketTradePublisherConfig {
  /** Hunter instance identifier for tracing */
  readonly instanceId: string;
  /** Enable/disable publishing (for testing) */
  readonly enabled: boolean;
  /** Max trades to buffer before dropping (backpressure) */
  readonly maxBufferSize: number;
  /** Flush interval for buffered trades (ms) */
  readonly flushIntervalMs: number;
}

const DEFAULT_CONFIG: MarketTradePublisherConfig = {
  instanceId: `hunter-${uuidv4().slice(0, 8)}`,
  enabled: true,
  maxBufferSize: 10000,
  flushIntervalMs: 100,
};

// Map Hunter exchange names to VenueId
const EXCHANGE_TO_VENUE: Readonly<Record<string, VenueId>> = {
  binance: VenueId.BINANCE,
  bybit: VenueId.BYBIT,
  coinbase: VenueId.COINBASE,
  kraken: VenueId.KRAKEN,
  mexc: VenueId.MEXC,
  hyperliquid: VenueId.HYPERLIQUID,
  deribit: VenueId.DERIBIT,
};

// Map product types to InstrumentType
const PRODUCT_TO_INSTRUMENT: Readonly<Record<string, InstrumentType>> = {
  spot: InstrumentType.SPOT,
  linear: InstrumentType.PERP,
  inverse: InstrumentType.PERP,
  perp: InstrumentType.PERP,
  future: InstrumentType.FUTURE,
  option: InstrumentType.OPTION,
};

/**
 * Publisher state - immutable updates via replacement
 */
interface PublisherState {
  readonly tradeBuffer: readonly MarketTradeV1[];
  readonly flushTimer: NodeJS.Timeout | null;
  readonly isPublishing: boolean;
  readonly tradesPublished: number;
  readonly tradesDropped: number;
  readonly lastFlushTime: number;
}

const INITIAL_STATE: PublisherState = {
  tradeBuffer: [],
  flushTimer: null,
  isPublishing: false,
  tradesPublished: 0,
  tradesDropped: 0,
  lastFlushTime: 0,
};

/**
 * MarketTradePublisher
 *
 * Subscribes to trade events from ExchangeWebSocketClient and publishes
 * normalized MarketTradeV1 events to NATS.
 */

export class MarketTradePublisher extends EventEmitter {
  private readonly config: MarketTradePublisherConfig;
  private state: PublisherState = INITIAL_STATE;

  constructor(config: Partial<MarketTradePublisherConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the publisher
   */
  start(): void {
    if (this.state.flushTimer) {
      return;
    }

    console.log(
      `[MarketTradePublisher] Starting (flush=${this.config.flushIntervalMs}ms, buffer=${this.config.maxBufferSize})`
    );

    const timer = setInterval(() => {
      this.flushBuffer().catch(err => {
        console.error('[MarketTradePublisher] Flush error:', err);
        this.emit('error', err);
      });
    }, this.config.flushIntervalMs);

    this.state = { ...this.state, flushTimer: timer };
  }

  /**
   * Stop the publisher
   */
  stop(): void {
    if (this.state.flushTimer) {
      clearInterval(this.state.flushTimer);
      this.state = { ...this.state, flushTimer: null };
    }

    // Final flush
    this.flushBuffer().catch(console.error);

    console.log(
      `[MarketTradePublisher] Stopped (published=${this.state.tradesPublished}, dropped=${this.state.tradesDropped})`
    );
  }

  /**
   * Handle incoming trade from ExchangeWebSocketClient
   */
  onTrade(trade: ExchangeTrade): void {
    if (!this.config.enabled) {
      return;
    }

    const normalized = this.normalizeTrade(trade);
    if (!normalized) {
      return;
    }

    // Backpressure: drop oldest if buffer full
    if (this.state.tradeBuffer.length >= this.config.maxBufferSize) {
      this.state = {
        ...this.state,
        tradeBuffer: [...this.state.tradeBuffer.slice(1), normalized],
        tradesDropped: this.state.tradesDropped + 1,
      };
    } else {
      this.state = {
        ...this.state,
        tradeBuffer: [...this.state.tradeBuffer, normalized],
      };
    }
  }

  /**
   * Normalize ExchangeTrade to MarketTradeV1
   */
  normalizeTrade(trade: ExchangeTrade): MarketTradeV1 | null {
    const venueId = EXCHANGE_TO_VENUE[trade.exchange];
    if (!venueId) {
      return null;
    }

    const instrumentType = PRODUCT_TO_INSTRUMENT[trade.product] ?? InstrumentType.SPOT;

    // Normalize symbol
    const normalizedSymbol = (() => {
      try {
        const result = normalizeSymbol(venueId, trade.symbol, instrumentType);
        return result.symbol;
      } catch {
        // Fallback to raw symbol if normalization fails
        return trade.symbol;
      }
    })();

    // Map side to taker_side
    const takerSide: 'buy' | 'sell' | 'unknown' =
      trade.side === 'buy' || trade.side === 'sell' ? trade.side : 'unknown';

    return {
      v: 1,
      ts: new Date().toISOString(),
      venue: venueId,
      symbol: normalizedSymbol,
      raw_symbol: trade.symbol,
      exchange_ts: trade.timestamp,
      price: trade.price.toString(),
      size: trade.quantity.toString(),
      taker_side: takerSide,
      trade_id: trade.tradeId,
      instrument_type: instrumentType,
    };
  }

  /**
   * Flush buffered trades to NATS
   */
  async flushBuffer(): Promise<void> {
    if (this.state.isPublishing || this.state.tradeBuffer.length === 0) {
      return;
    }

    this.state = { ...this.state, isPublishing: true };
    const startTime = Date.now();

    try {
      const nats = getNatsClient();
      if (!nats.isConnected()) {
        // NATS down: keep buffer, will retry
        return;
      }

      // Take all buffered trades immutably
      const trades = this.state.tradeBuffer;
      this.state = { ...this.state, tradeBuffer: [] };

      let published = 0;
      for (const trade of trades) {
        const subject = TITAN_SUBJECTS.DATA.VENUES.TRADES(
          trade.venue,
          trade.symbol.replace('/', '_')
        );
        await nats.publish(subject, trade);
        published++;
      }

      this.state = {
        ...this.state,
        tradesPublished: this.state.tradesPublished + published,
        lastFlushTime: Date.now() - startTime,
      };
    } finally {
      this.state = { ...this.state, isPublishing: false };
    }
  }

  /**
   * Get publisher statistics
   */
  getStats(): {
    readonly tradesPublished: number;
    readonly tradesDropped: number;
    readonly bufferSize: number;
    readonly lastFlushMs: number;
  } {
    return {
      tradesPublished: this.state.tradesPublished,
      tradesDropped: this.state.tradesDropped,
      bufferSize: this.state.tradeBuffer.length,
      lastFlushMs: this.state.lastFlushTime,
    };
  }

  /**
   * Check if publisher is running
   */
  isRunning(): boolean {
    return this.state.flushTimer !== null;
  }
}

/**
 * Singleton instance
 */
// eslint-disable-next-line functional/no-let
let instance: MarketTradePublisher | null = null;

export function getMarketTradePublisher(
  config?: Partial<MarketTradePublisherConfig>
): MarketTradePublisher {
  if (!instance) {
    instance = new MarketTradePublisher(config);
  }
  return instance;
}

export function resetMarketTradePublisher(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
