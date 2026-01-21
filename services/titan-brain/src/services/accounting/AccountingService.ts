import { Logger } from "../../logging/Logger.js";
import {
    FillReport,
    getNatsClient,
    IntentSignal,
    NatsClient,
} from "@titan/shared";
import { TreasuryRepository } from "../../db/repositories/TreasuryRepository.js";

interface ReconciliationMetrics {
    latency_signal_to_ingress: number;
    latency_ingress_to_exchange: number;
    latency_exchange_to_ack: number;
    total_rtt: number;
}

export class AccountingService {
    private logger: Logger;
    private nats: NatsClient;
    private treasuryRepository: TreasuryRepository;
    private activeOrders: Map<
        string,
        { signal: IntentSignal; t_ingress: number }
    > = new Map();

    constructor(
        treasuryRepository: TreasuryRepository,
        natsClient?: NatsClient,
    ) {
        this.logger = Logger.getInstance("accounting-service");
        this.nats = natsClient || getNatsClient();
        this.treasuryRepository = treasuryRepository;
    }

    async start(): Promise<void> {
        this.logger.info("Starting Titan Accountant (Phase 4)...");

        // Subscribe to Intents (to track ingress)
        await this.nats.subscribe<any>( // Type as any to handle both Envelope and raw during migration
            "titan.cmd.exec.place.v1.>",
            (msg: any, subject: string) => {
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
            "titan.evt.exec.fill.v1.>",
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
            "titan.execution.shadow_fill.>",
            async (fill: FillReport, subject: string) => {
                try {
                    this.logger.info("👻 Shadow Fill Received", undefined, {
                        symbol: fill.symbol,
                        price: fill.price,
                        t_signal: fill.t_signal,
                        t_exchange: fill.t_exchange,
                    });

                    // TODO: Implement full Drift/Slippage calculation by matching with Real Fill
                    // For now, we just log it to verify the pipeline.
                } catch (e) {
                    this.logger.error(
                        "Failed to process shadow fill",
                        e as Error,
                    );
                }
            },
        );

        this.logger.info("Titan Accountant started.");
    }

    private trackIntent(intent: IntentSignal): void {
        this.activeOrders.set(intent.signal_id, {
            signal: intent,
            t_ingress: Date.now(), // Approximate ingress tracking
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

        // Persist Reconciliation
        await this.treasuryRepository.addFill({
            ...fill,
            metrics, // If schema supports it, otherwise ignored
        });

        // Store active trade reconciliation immediately
        // In verify phase, we will check if "latency_exchange_to_ack" > 50ms and flag it.
        if (metrics.total_rtt > 200) {
            this.logger.warn("High Latency Detected", undefined, { metrics });
        }

        // Cleanup active order tracking
        this.activeOrders.delete(fill.signal_id);
    }
}
