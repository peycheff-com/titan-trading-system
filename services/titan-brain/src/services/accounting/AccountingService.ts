import { Logger } from "../../logging/Logger.js";
import {
  FillReport,
  getNatsClient,
  IntentSignal,
  NatsClient,
  TITAN_SUBJECTS,
} from "@titan/shared";
import { FillsRepository } from "../../db/repositories/FillsRepository.js";
import { LedgerRepository } from "../../db/repositories/LedgerRepository.js";
import { PostingEngine } from "./PostingEngine.js";

interface ReconciliationMetrics {
  latency_signal_to_ingress: number;
  latency_ingress_to_exchange: number;
  latency_exchange_to_ack: number;
  total_rtt: number;
}

export class AccountingService {
  private logger: Logger;
  private nats: NatsClient;
  private fillsRepository: FillsRepository;
  private ledgerRepository: LedgerRepository;
  private activeOrders: Map<
    string,
    {
      signal: IntentSignal;
      t_ingress: number;
      shadowFill?: FillReport;
    }
  > = new Map();

  constructor(
    fillsRepository: FillsRepository,
    ledgerRepository: LedgerRepository,
    natsClient?: NatsClient,
  ) {
    this.logger = Logger.getInstance("accounting-service");
    this.nats = natsClient || getNatsClient();
    this.fillsRepository = fillsRepository;
    this.ledgerRepository = ledgerRepository;
  }

  async start(): Promise<void> {
    this.logger.info("Starting Titan Accountant (Phase 4)...");

    // Subscribe to Intents (to track ingress)
    await this.nats.subscribe<any>(
      TITAN_SUBJECTS.CMD.EXECUTION.ALL,
      (msg: any, subject: string) => {
        // Type as any to handle both Envelope and raw during migration
        try {
          // unwrapping logic
          const intent = msg.payload ? msg.payload : msg;

          // Add t_ingress if not present (it should be added by ExecutionRouter, but Brain sees it here too)
          // Actually Brain sends it. Brain -> NATS -> Execution.
          // We want to see what Execution publishes BACK.
          // Execution publishes `titan.execution.status` or similar.
          this.trackIntent(intent);
        } catch (e) {
          this.logger.error("Failed to parse intent", e as Error);
        }
      },
    );

    // Subscribe to Fills (from Execution Service)
    // Subject: titan.evt.exec.fill.v1.<venue>.<account>.<symbol>
    await this.nats.subscribe<FillReport>(
      `${TITAN_SUBJECTS.EVT.EXECUTION.FILL}.>`,
      async (fill: FillReport, subject: string) => {
        try {
          await this.processFill(fill);
        } catch (e) {
          this.logger.error("Failed to process fill", e as Error);
        }
      },
    );

    // Subscribe to Shadow Fills (Truth Layer)
    // Subject: titan.execution.shadow_fill.<symbol>
    await this.nats.subscribe<FillReport>(
      `${TITAN_SUBJECTS.EVT.EXECUTION.SHADOW_FILL}.>`,
      async (fill: FillReport, subject: string) => {
        try {
          this.processShadowFill(fill);
        } catch (e) {
          this.logger.error("Failed to process shadow fill", e as Error);
        }
      },
    );

    // Subscribe to Balance Updates
    await this.nats.subscribe<any>(
      TITAN_SUBJECTS.EVT.EXECUTION.BALANCE,
      async (msg: any) => {
        try {
          const balance = msg.payload || msg;
          this.logger.info("💰 Balance Update", undefined, {
            ...balance,
          });
          // TODO: Update shared state or database if needed
        } catch (e) {
          this.logger.error("Failed to process balance update", e as Error);
        }
      },
    );

    this.logger.info("Titan Accountant started.");
  }

  async stop(): Promise<void> {
    this.logger.info("Stopping Titan Accountant...");
    // TODO: Unsubscribe from NATS subjects if client supports it
  }

  private trackIntent(intent: IntentSignal): void {
    const existing = this.activeOrders.get(intent.signal_id);
    // eslint-disable-next-line functional/immutable-data
    this.activeOrders.set(intent.signal_id, {
      ...existing, // Preserve shadowFill if it arrived before intent (unlikely but possible)
      signal: intent,
      t_ingress: Date.now(),
    });
  }

  private processShadowFill(fill: FillReport): void {
    const existing = this.activeOrders.get(fill.signal_id);
    // eslint-disable-next-line functional/immutable-data
    this.activeOrders.set(fill.signal_id, {
      signal: existing?.signal as IntentSignal, // Might be undefined if shadow arrives first
      t_ingress: existing?.t_ingress || Date.now(),
      shadowFill: fill,
    });

    this.logger.info("👻 Shadow Fill Recorded", undefined, {
      signalId: fill.signal_id,
      price: fill.price,
    });
  }

  private async processFill(fill: FillReport): Promise<void> {
    const t_now = Date.now();
    const tracked = this.activeOrders.get(fill.signal_id);

    // Calculate Metrics
    const metrics: ReconciliationMetrics = {
      latency_signal_to_ingress: fill.t_ingress - fill.t_signal,
      latency_ingress_to_exchange: fill.t_exchange - fill.t_ingress,
      latency_exchange_to_ack: t_now - fill.t_exchange,
      total_rtt: t_now - fill.t_signal,
    };

    this.logger.info("Trade Reconciled", undefined, {
      ...fill,
      metrics,
      reconciled: !!tracked,
    });

    // Drift Detection
    if (tracked?.shadowFill) {
      const driftPrice = Math.abs(fill.price - tracked.shadowFill.price);
      const driftPct = driftPrice / tracked.shadowFill.price;

      if (driftPct > 0.001) {
        // > 0.1% deviation
        this.logger.warn("⚠️ Price Drift Detected", undefined, {
          signalId: fill.signal_id,
          realPrice: fill.price,
          shadowPrice: tracked.shadowFill.price,
          driftPct,
        });

        // Publish Alert
        this.nats.publish(TITAN_SUBJECTS.EVT.ALERT.DRIFT, {
          type: "PRICE_DRIFT",
          signalId: fill.signal_id,
          symbol: fill.symbol,
          driftPct,
          details: {
            real: fill.price,
            shadow: tracked.shadowFill.price,
          },
        });
      }
    }

    // Persist Reconciliation
    await this.fillsRepository.createFill({
      ...fill,
    } as any);

    // General Ledger Posting
    try {
      const fillId = fill.fill_id ||
        (fill as any).fillId ||
        fill.execution_id ||
        (fill as any).executionId ||
        (fill as any).id;
      if (fillId) {
        const exists = await this.ledgerRepository.transactionExists(fillId);
        if (!exists) {
          const txParams = PostingEngine.createFromFill({
            ...fill,
            fillId, // Ensure ID is passed normalized
          } as FillReport);
          await this.ledgerRepository.createTransaction(txParams);
          this.logger.info("Ledger Transaction Posted", undefined, {
            correlationId: fillId,
          });
        } else {
          this.logger.debug(
            "Ledger Transaction skipped (Idempotent)",
            undefined,
            {
              correlationId: fillId,
            },
          );
        }
      }
    } catch (err) {
      this.logger.error(
        "CRITICAL: Failed to post to Ledger - Data Integrity Risk",
        err as Error,
      );

      // Alert explicit data integrity violation
      const fillId = fill.fill_id || fill.execution_id || (fill as any).id;
      this.nats.publish(TITAN_SUBJECTS.EVT.ALERT.INTEGRITY, {
        type: "LEDGER_FAILURE",
        fillId,
        error: err instanceof Error ? err.message : String(err),
      });
      // We do NOT rethrow to avoid crashing the fill processor for other systems (like position updates),
      // but this requires immediate manual intervention.
    }

    // Store active trade reconciliation immediately
    // In verify phase, we will check if "latency_exchange_to_ack" > 50ms and flag it.
    if (metrics.total_rtt > 200) {
      // > 200ms
      this.logger.warn("High Latency Detected", undefined, { metrics });

      this.nats.publish(TITAN_SUBJECTS.EVT.ALERT.LATENCY, {
        type: "HIGH_LATENCY",
        signalId: fill.signal_id,
        metrics,
        threshold: 200,
      });
    }

    // Cleanup active order tracking
    // eslint-disable-next-line functional/immutable-data
    this.activeOrders.delete(fill.signal_id);
  }
}
