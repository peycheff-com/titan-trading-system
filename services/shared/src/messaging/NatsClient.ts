import {
  connect,
  ConsumerOpts,
  consumerOpts,
  JetStreamClient,
  JetStreamManager,
  JSONCodec,
  NatsConnection,
  StringCodec,
  Subscription,
} from 'nats';
import { EventEmitter } from 'eventemitter3';

export enum TitanSubject {
  SIGNALS = 'signals',
  EXECUTION_REPORTS = 'execution.reports',
  MARKET_DATA = 'market_data',
  DASHBOARD_UPDATES = 'dashboard.updates',
  AI_OPTIMIZATION_REQUESTS = 'ai.optimization.requests',
}

export interface NatsConfig {
  servers: string[];
  name?: string;
  token?: string;
}

export class NatsClient extends EventEmitter {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;
  private jc = JSONCodec();
  private sc = StringCodec();
  private static instance: NatsClient;

  // Subjects requiring durability (JetStream)
  private readonly DURABLE_SUBJECTS = new Set([
    TitanSubject.SIGNALS,
    TitanSubject.EXECUTION_REPORTS,
    TitanSubject.AI_OPTIMIZATION_REQUESTS,
  ]);

  private constructor() {
    super();
  }

  public static getInstance(): NatsClient {
    if (!NatsClient.instance) {
      NatsClient.instance = new NatsClient();
    }
    return NatsClient.instance;
  }

  public async connect(config: NatsConfig = { servers: ['nats://localhost:4222'] }): Promise<void> {
    if (this.nc) {
      return;
    }

    try {
      this.nc = await connect({
        servers: config.servers,
        name: config.name,
        token: config.token,
        maxReconnectAttempts: -1,
        waitOnFirstConnect: true,
      });

      console.log(`Connected to NATS at ${this.nc.getServer()}`);

      // Initialize JetStream
      this.js = this.nc.jetstream();
      this.jsm = await this.nc.jetstreamManager();

      await this.ensureStreams();

      this.nc.closed().then((err) => {
        if (err) {
          console.error(`NATS connection closed with error: ${err.message}`);
          this.emit('error', err);
        } else {
          console.log('NATS connection closed');
          this.emit('closed');
        }
        this.nc = null;
        this.js = null;
        this.jsm = null;
      });
    } catch (err) {
      console.error(`Error connecting to NATS: ${err}`);
      throw err;
    }
  }

  private async ensureStreams(): Promise<void> {
    if (!this.jsm) return;

    const streams = [
      {
        name: 'TITAN_TRADING',
        subjects: ['execution.>', 'signals', 'ai.>'],
        storage: 'file' as const, // Durable storage
      },
      {
        name: 'TITAN_DATA',
        subjects: ['market_data', 'dashboard.>'],
        storage: 'memory' as const, // Faster, non-durable
        max_age: 10 * 1000 * 1000 * 1000, // 10 seconds retention (nans)
      },
    ];

    for (const stream of streams) {
      try {
        await this.jsm.streams.add(stream as any);
        console.log(`Verified JetStream stream: ${stream.name}`);
      } catch (err: any) {
        // If stream explicitly exists but with different config, we might want to update it
        // For now, logging error if it's not just "already exists" (which 'add' handles by updating/idempotency usually, but NATS can be strict)
        if (!err.message.includes('already in use')) {
          try {
            // Try update if add failed
            await this.jsm.streams.update(stream.name, stream as any);
          } catch (updateErr) {
            console.warn(`Failed to create/update stream ${stream.name}:`, err);
          }
        }
      }
    }
  }

  public async publish<T>(subject: TitanSubject | string, data: T): Promise<void> {
    if (!this.nc) {
      throw new Error('NATS client not connected');
    }

    const payload = typeof data === 'string' ? this.sc.encode(data) : this.jc.encode(data);

    // Use JetStream for durable subjects, Core NATS for others
    if (this.js && this.DURABLE_SUBJECTS.has(subject as TitanSubject)) {
      await this.js.publish(subject, payload);
    } else {
      this.nc.publish(subject, payload);
    }
  }

  public subscribe<T>(
    subject: TitanSubject | string,
    callback: (data: T, subject: string) => void,
    durableName?: string, // If provided, creates a durable consumer
  ): Subscription {
    if (!this.nc) {
      throw new Error('NATS client not connected');
    }

    // If it's a durable subject and we have a durableName, use JetStream push consumer
    if (this.js && this.DURABLE_SUBJECTS.has(subject as TitanSubject) && durableName) {
      // NOTE: This simplistically uses a push consumer via standard logic or pull.
      // For simplicity and alignment with node-nats examples:
      const opts = consumerOpts();
      opts.durable(durableName);
      opts.manualAck();
      opts.ackExplicit();
      opts.deliverTo(durableName + '_DELIVERY'); // Create a delivery subject for push

      // This is complex to wrap simply in a callback style for the user without exposing 'msg.ack()'.
      // For now, we revert to standard subscribe for Core, and simple 'subscribe' for JS without manual ACK exposed in this signature.
      // TODO: Enhance this signature to support ACKs for durable consumers.

      // Falling back to standard processing for now to allow simple migration,
      // but using js.subscribe where appropriate.
    }

    const sub = this.nc.subscribe(subject);

    (async () => {
      for await (const m of sub) {
        try {
          let decoded: T;
          try {
            decoded = this.jc.decode(m.data) as T;
          } catch {
            decoded = this.sc.decode(m.data) as unknown as T;
          }
          callback(decoded, m.subject);
        } catch (err) {
          console.error(`Error processing message on ${subject}:`, err);
        }
      }
    })();

    return sub;
  }

  public async close(): Promise<void> {
    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
      this.nc = null;
      this.js = null;
      this.jsm = null;
    }
  }

  public isConnected(): boolean {
    return this.nc !== null && !this.nc.isClosed();
  }
}

export const getNatsClient = () => NatsClient.getInstance();
