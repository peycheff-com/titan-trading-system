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
import { createEnvelope, Envelope } from "../schemas/envelope";

export enum TitanSubject {
  // --- COMMANDS (TITAN_CMD) ---
  /* eslint-disable @typescript-eslint/no-duplicate-enum-values */
  // titan.cmd.exec.place.v1.{venue}.{account}.{symbol}
  CMD_EXEC_PLACE = "titan.cmd.exec.place.v1",
  // titan.cmd.sys.halt.v1.{scope}
  CMD_SYS_HALT = "titan.cmd.sys.halt.v1",
  // titan.cmd.ai.optimize.v1
  CMD_AI_OPTIMIZE = "titan.cmd.ai.optimize.v1",
  // titan.cmd.risk.policy (Global Risk Policy)
  CMD_RISK_POLICY = "titan.cmd.risk.policy",

  // --- EVENTS (TITAN_EVT) ---
  // titan.evt.exec.fill.v1.{venue}.{account}.{symbol}
  EVT_EXEC_FILL = "titan.evt.exec.fill.v1",
  // titan.evt.brain.signal.v1.{strategy}
  EVT_BRAIN_SIGNAL = "titan.evt.brain.signal.v1",
  // titan.evt.brain.regime.v1
  EVT_REGIME_UPDATE = "titan.evt.brain.regime.v1",
  // titan.evt.analytics.powerlaw.v1
  EVT_POWERLAW_UPDATE = "titan.evt.analytics.powerlaw.v1",
  // titan.evt.budget.update
  EVT_BUDGET_UPDATE = "titan.evt.budget.update",
  // titan.evt.market.trade.{venue}.{symbol} (Note: Market data might be EVT or DATA depending on retention needs. Manifest says DATA for Ticker, EVT for signals)
  // But wait, brain signals are critical. Market data is usually ephemeral.

  // --- PHASE EVENTS ---
  // titan.evt.phase.intent.v1.{phase}.{symbol}
  EVT_PHASE_INTENT = "titan.evt.phase.intent.v1",
  // titan.evt.phase.posture.v1.{phase}
  EVT_PHASE_POSTURE = "titan.evt.phase.posture.v1",
  // titan.evt.phase.diagnostics.v1.{phase}
  EVT_PHASE_DIAGNOSTICS = "titan.evt.phase.diagnostics.v1",

  // --- DATA (TITAN_DATA) ---
  // titan.data.market.ticker.{venue}.{symbol}
  DATA_MARKET_TICKER = "titan.data.market.ticker",
  // titan.data.dashboard.update.v1
  DATA_DASHBOARD_UPDATE = "titan.data.dashboard.update.v1",

  // Legacy mappings (to be phased out or remapped)
  SIGNALS = "titan.evt.brain.signal.v1", // Remapped
  EXECUTION_FILL = "titan.evt.exec.fill.v1", // Remapped
  EXECUTION_REPORTS = "titan.evt.exec.report.v1", // Remapped
  MARKET_DATA = "titan.data.market.ticker", // Remapped
  AI_OPTIMIZATION_REQUESTS = "titan.cmd.ai.optimize.v1", // Remapped
  REGIME_UPDATE = "titan.evt.brain.regime.v1", // Remapped
  DASHBOARD_UPDATES = "titan.data.dashboard.update.v1", // Remapped
  EXECUTION_INTENT = "titan.cmd.exec.place.v1", // Remapped (Warning: Intents could be cancels too)
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
  // In the new manifest, subjects starting with titan.cmd or titan.evt are Durable.
  // titan.data is Ephemeral (but stored in Memory Stream, so strictly speaking it's still JetStream if we want stream features, or Core NATS if pure fire-and-forget).
  // Manifest says TITAN_DATA has Memory storage, so it IS a stream.
  private readonly STREAM_PREFIXES = [
    "titan.cmd.",
    "titan.evt.",
    "titan.data.",
  ];

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
        name: "TITAN_CMD",
        subjects: ["titan.cmd.>"],
        storage: "file" as const,
        retention: "workqueue" as const,
        max_age: 7 * 24 * 60 * 60 * 1000 * 1000 * 1000, // 7 Days
        duplicate_window: 60 * 1000 * 1000 * 1000, // 1 min
      },
      {
        name: "TITAN_EVT",
        subjects: ["titan.evt.>"],
        storage: "file" as const,
        retention: "limits" as const,
        max_age: 30 * 24 * 60 * 60 * 1000 * 1000 * 1000, // 30 Days
        max_bytes: 10 * 1024 * 1024 * 1024, // 10 GB
      },
      {
        name: "TITAN_DATA",
        subjects: ["titan.data.>"],
        storage: "memory" as const,
        retention: "limits" as const,
        max_age: 15 * 60 * 1000 * 1000 * 1000, // 15 Min
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

    // Use JetStream if subject matches any stream prefix
    let isJetStream = false;
    if (this.js) {
      if (typeof subject === "string") {
        for (const prefix of this.STREAM_PREFIXES) {
          if (subject.startsWith(prefix)) {
            isJetStream = true;
            break;
          }
        }
      }
    }

    if (isJetStream && this.js) {
      await this.js.publish(subject, payload);
    } else {
      this.nc.publish(subject, payload);
    }
  }

  /**
   * Publishes a message wrapped in the canonical Titan Envelope.
   * Enforces strict schema compliance.
   */
  public async publishEnvelope<T>(
    subject: TitanSubject | string,
    data: T,
    meta: {
      version: number;
      type: string;
      producer: string;
      id?: string;
      correlation_id?: string;
      causation_id?: string;
      idempotency_key?: string;
    },
  ): Promise<void> {
    const envelope = createEnvelope(meta.type, data, {
      id: meta.id,
      version: meta.version,
      producer: meta.producer,
      correlation_id: meta.correlation_id,
      causation_id: meta.causation_id,
      idempotency_key: meta.idempotency_key,
    });

    await this.publish(subject, envelope);
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

    // Check if we should use JetStream Push Consumer
    let isJetStream = false;
    if (this.js && typeof subject === "string") {
      for (const prefix of this.STREAM_PREFIXES) {
        if (subject.startsWith(prefix)) {
          isJetStream = true;
          break;
        }
      }
    }

    if (isJetStream && durableName) {
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

  public async request<T>(
    subject: string,
    data: any = {},
    options: { timeout?: number } = {},
  ): Promise<T> {
    if (!this.nc) {
      throw new Error("NATS client not connected");
    }

    const payload = this.jc.encode(data);
    const timeout = options.timeout || 5000;

    try {
      const response = await this.nc.request(subject, payload, { timeout });
      try {
        return this.jc.decode(response.data) as T;
      } catch {
        return this.sc.decode(response.data) as unknown as T;
      }
    } catch (err) {
      console.error(`Request failed for ${subject}:`, err);
      throw err;
    }
  }

  public isConnected(): boolean {
    return this.nc !== null && !this.nc.isClosed();
  }

  public getJetStream(): JetStreamClient | null {
    return this.js;
  }

  public getJetStreamManager(): JetStreamManager | null {
    return this.jsm;
  }
}

export const getNatsClient = () => NatsClient.getInstance();
