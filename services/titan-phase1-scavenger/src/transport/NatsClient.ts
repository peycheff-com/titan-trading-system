import {
  getNatsClient,
  NatsClient as SharedNatsClient,
  POWER_LAW_SUBJECTS,
} from "@titan/shared";
import { Logger } from "../logging/Logger.js";
import { PowerLawMetric } from "../types/index.js";

export interface NatsConfig {
  servers: string | string[];
  token?: string;
  name?: string;
  user?: string;
  pass?: string;
}

interface Signal {
  signal_id: string;
  symbol?: string;
  exchange?: string;
  timestamp?: number;
  t_signal?: number;
  meta?: unknown;
  [key: string]: unknown;
}

export class NatsClient {
  private client: SharedNatsClient;
  private logger: Logger;

  constructor(private config: NatsConfig) {
    this.client = getNatsClient();
    this.logger = new Logger();
  }

  async connect(): Promise<void> {
    await this.client.connect({
      servers: Array.isArray(this.config.servers)
        ? this.config.servers
        : [this.config.servers],
      token: this.config.token,
      name: this.config.name || "titan-scavenger",
      user: this.config.user,
      pass: this.config.pass,
    });
    this.logger.info("✅ Connected to NATS via Shared Client");
  }

  async publishSignal(signal: Signal): Promise<void> {
    if (!this.client.isConnected()) {
      throw new Error("Not connected to NATS");
    }

    // Subject: titan.signal.submit.v1 (Targeting Brain)
    const subject = `titan.signal.submit.v1`; // Hardcoded for now, or match TitanSubject.SIGNAL_SUBMIT

    // Uses explicit Envelope publishing
    const tSignal = signal.t_signal ?? signal.timestamp ?? Date.now();

    // Remove flattened metadata fields if they exist to avoid duplication in payload
    // const { t_signal, timestamp, meta, ...cleanSignal } = signal;
    const cleanSignal = { ...signal };
    delete cleanSignal.t_signal;
    delete cleanSignal.timestamp;
    delete cleanSignal.meta;

    try {
      await this.client.publishEnvelope(
        subject,
        {
          ...cleanSignal,
          t_signal: tSignal,
          timestamp: tSignal, // Keep for backward compat inside payload if needed
        },
        {
          type: "titan.cmd.exec.place.v1",
          version: 1,
          producer: "titan-phase1-scavenger",
          id: signal.signal_id, // Use signal_id as envelope ID for traceability
          correlation_id: signal.signal_id,
        },
      );
      this.logger.info(
        `📤 Publishing signal to ${subject} [${signal.signal_id}]`,
      );
    } catch (err) {
      this.logger.logError(err as Error, {
        signalId: signal.signal_id,
        context: "publishSignal",
      });
      throw err;
    }
  }

  async subscribeToPowerLawMetrics(
    callback: (symbol: string, metrics: PowerLawMetric) => void,
  ) {
    if (!this.client.isConnected()) return;

    // Wildcard subscription
    // Shared client handles callback execution safely
    await this.client.subscribe(
      POWER_LAW_SUBJECTS.METRICS_V1_ALL,
      (data: unknown, subject: string) => {
        // Dual Read: Check if it's an Envelope or raw data
        let payload = data;

        // Simple heuristic for Envelope: has 'payload' and 'type'
        if (
          data && typeof data === "object" && "payload" in data &&
          "type" in data
        ) {
          // It's likely an envelope
          payload = (data as { payload: unknown }).payload;
        }

        // Subject: powerlaw.metrics.<symbol>
        const parts = subject.split(".");
        if (parts.length >= 3) {
          const symbol = parts[2];
          callback(symbol, payload as PowerLawMetric);
        }
      },
    );

    this.logger.info("✅ Subscribed to Power Law metrics (Dual Read Enabled)");
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
