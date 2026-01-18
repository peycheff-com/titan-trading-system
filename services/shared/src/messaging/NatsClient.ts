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
} from "nats";
import { EventEmitter } from "eventemitter3";

export enum TitanSubject {
  SIGNALS = "signals",
  EXECUTION_REPORTS = "execution.reports",
  EXECUTION_FILL = "titan.execution.fill",
  MARKET_DATA = "market_data",
  DASHBOARD_UPDATES = "dashboard.updates",
  AI_OPTIMIZATION_REQUESTS = "ai.optimization.requests",
  REGIME_UPDATE = "titan.ai.regime.update",
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
    TitanSubject.EXECUTION_FILL,
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

  public async connect(
    config: NatsConfig = { servers: ["nats://localhost:4222"] },
  ): Promise<void> {
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
          this.emit("error", err);
        } else {
          console.log("NATS connection closed");
          this.emit("closed");
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
        name: "TITAN_TRADING",
        subjects: [
          "execution.>",
          "titan.execution.>",
          "signals",
          "ai.>",
          "titan.ai.>",
        ],
        storage: "file" as const, // Durable storage
      },
      {
        name: "TITAN_DATA",
        subjects: ["market_data", "dashboard.>"],
        storage: "memory" as const, // Faster, non-durable
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
        if (!err.message.includes("already in use")) {
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

  public async publish<T>(
    subject: TitanSubject | string,
    data: T,
  ): Promise<void> {
    if (!this.nc) {
      throw new Error("NATS client not connected");
    }

    const payload = typeof data === "string"
      ? this.sc.encode(data)
      : this.jc.encode(data);

    // Use JetStream for durable subjects, Core NATS for others
    if (this.js && this.DURABLE_SUBJECTS.has(subject as TitanSubject)) {
      await this.js.publish(subject, payload);
    } else {
      this.nc.publish(subject, payload);
    }
  }

  public subscribe<T>(
    subject: TitanSubject | string,
    callback: (data: T, subject: string) => Promise<void> | void,
    durableName?: string, // If provided, creates a durable consumer
  ): Subscription {
    if (!this.nc) {
      throw new Error("NATS client not connected");
    }

    // Wrapper to handle both sync and async callbacks uniformly
    const executeCallback = async (data: T, subj: string) => {
      try {
        await callback(data, subj);
      } catch (err) {
        console.error(`Error in subscription callback for ${subj}:`, err);
        throw err;
      }
    };

    // If it's a durable subject and we have a durableName, use JetStream push consumer
    if (
      this.js && this.DURABLE_SUBJECTS.has(subject as TitanSubject) &&
      durableName
    ) {
      const opts = consumerOpts();
      opts.durable(durableName);
      opts.manualAck();
      opts.ackExplicit();
      // opts.deliverTo(durableName + '_DELIVERY'); // Optional

      (async () => {
        try {
          const sub = await this.js!.subscribe(subject, opts);
          for await (const m of sub) {
            try {
              let decoded: T;
              try {
                decoded = this.jc.decode(m.data) as T;
              } catch {
                decoded = this.sc.decode(m.data) as unknown as T;
              }

              await executeCallback(decoded, m.subject);
              m.ack();
            } catch (err) {
              console.error(
                `Failed to process durable message on ${subject}:`,
                err,
              );
              m.nak();
            }
          }
        } catch (err) {
          console.error(`Durable subscription error for ${subject}:`, err);
        }
      })();

      // Return a dummy subscription
      return {
        unsubscribe: () =>
          console.warn(
            "Unsubscribing from durable JS subscription not fully supported",
          ),
        closed: Promise.resolve(undefined),
        drain: () => Promise.resolve(),
        isClosed: () => false,
        getSubject: () => subject,
        getReceived: () => 0,
        getProcessed: () => 0,
        getPending: () => 0,
        getID: () => 0,
        getMax: () => 0,
      } as any;
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
          await executeCallback(decoded, m.subject);
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
