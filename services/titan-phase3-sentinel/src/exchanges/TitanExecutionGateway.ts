import { IExchangeGateway } from './interfaces.js';
import { Order, OrderResult } from '../types/orders.js';
import { NatsConnection, Msg, JSONCodec } from 'nats';
import { createHmac, randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { Logger } from '@titan/shared';

const logger = Logger.getInstance('sentinel:TitanExecutionGateway');

interface BookTicker {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  timestamp: number;
}

export class TitanExecutionGateway extends EventEmitter implements IExchangeGateway {
  private priceCache: Map<string, BookTicker> = new Map();
  private jc = JSONCodec();

  constructor(
    public name: string, // exchange id, e.g. "binance", "bybit"
    private nats: NatsConnection,
    private hmacSecret: string
  ) {
    super();
  }

  async initialize(): Promise<void> {
    // Subscribe to market data updates for this exchange
    // Subject: titan.market.ticker.<exchange>.<symbol>
    const subject = `titan.market.ticker.${this.name}.>`;
    const sub = this.nats.subscribe(subject);
    
    // Process messages asynchronously
    (async () => {
      for await (const msg of sub) {
        try {
          const data = this.jc.decode(msg.data) as any;
          // Expected data format: BookTicker (symbol, price, bidirectional...)
          // We'll normalize or depend on standard format
          const ticker: BookTicker = {
            symbol: data.symbol || msg.subject.split('.').pop(),
            price: parseFloat(data.price),
            bid: parseFloat(data.bid || data.price),
            ask: parseFloat(data.ask || data.price),
            timestamp: Date.now()
          };
          this.priceCache.set(ticker.symbol, ticker);
        } catch (err) {
          logger.error(`Error parsing ticker for ${this.name}:`, err);
        }
      }
    })();

    logger.info(`✅ Gateway ${this.name} initialized and listening on ${subject}`);
  }

  async executeOrder(order: Order): Promise<OrderResult> {
    // Create Intent
    // Payload structure for titan-execution-rs validation
    const signalId = randomUUID();
    
    // Direction mapping: 1 (Long/Buy), -1 (Short/Sell)
    // Order.side might be 'buy'/'sell'
    let direction = 0;
    if (order.side.toLowerCase() === 'buy' || order.side.toLowerCase() === 'long') direction = 1;
    if (order.side.toLowerCase() === 'sell' || order.side.toLowerCase() === 'short') direction = -1;

    const payload = {
      signal_id: signalId,
      symbol: order.symbol,
      direction: direction,
      intent_type: "Open", // Simplified. Sentinel usually manages portfolio state.
      size: order.size,
      status: "Validated",
      source: "Sentinel",
      // Optional fields for completeness
      metadata: {
         exchange: this.name
      },
      timestamp: Date.now()
    };

    // Calculate Signature
    const signature = createHmac('sha256', this.hmacSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    // Envelope
    const envelope = {
      id: randomUUID(),
      type: "titan.cmd.execution.v1",
      specversion: "1.0",
      source: "sentinel",
      subject: `titan.cmd.execution`,
      time: new Date().toISOString(),
      correlation_id: signalId,
      payload: payload,
      signature: signature
    };

    // Publish to NATS
    const subj = `titan.cmd.execution`;
    this.nats.publish(subj, this.jc.encode(envelope));

    // Return pending result (NATS is async fire-and-forget usually, unless we wait for evt)
    // For Sentinel interface compatibility, we return a "Pending" order result.
    // Ideally we should listen for execution event matching correlation_id
    
    return {
      orderId: signalId,
      status: 'PENDING',
      filledSize: 0,
      avgPrice: 0,
       timestamp: Date.now(),
      fees: 0
    };
  }

  async getPrice(symbol: string): Promise<number> {
    const ticker = this.priceCache.get(symbol);
    return ticker ? ticker.price : 0;
  }

  async getTicker(symbol: string): Promise<{ price: number; bid: number; ask: number }> {
    const ticker = this.priceCache.get(symbol);
    if (!ticker) return { price: 0, bid: 0, ask: 0 };
    return { price: ticker.price, bid: ticker.bid, ask: ticker.ask };
  }

  async getBalance(asset: string): Promise<number> {
    // RPC Request to titan-execution-rs
    try {
      const msg = await this.nats.request('titan.execution.rpc.get_balances', this.jc.encode({}), { timeout: 1000 });
      const response = this.jc.decode(msg.data) as any;
      
      // Response: { balances: [ { currency: "USDT", total: ... } ] }
      if (response && response.balances) {
        const bal = response.balances.find((b: any) => b.currency === asset);
        return bal ? parseFloat(bal.total) : 0;
      }
    } catch (err) {
      logger.error(`Error fetching balance for ${asset}:`, err);
    }
    return 0;
  }
}
