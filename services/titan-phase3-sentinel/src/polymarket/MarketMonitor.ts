import { Market, PolymarketClient } from "./PolymarketClient.js";
import { ArbEngine, ArbSignal } from "./ArbEngine.js";
import { ExecutionClient } from "../execution/ExecutionClient.js";
import { v4 as uuidv4 } from "uuid"; // Need to make sure uuid is available or use crypto for random id

export class MarketMonitor {
    private client: PolymarketClient;
    private engine: ArbEngine;
    private executionClient: ExecutionClient;
    private isRunning: boolean = false;
    private pollingInterval: NodeJS.Timeout | null = null;

    constructor(private intervalMs: number = 5000) {
        this.client = new PolymarketClient();
        this.engine = new ArbEngine();
        this.executionClient = new ExecutionClient();
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("Starting Market Monitor...");

        this.poll(); // Initial poll
        this.pollingInterval = setInterval(() => this.poll(), this.intervalMs);
    }

    async stop() {
        this.isRunning = false;
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        console.log("Market Monitor stopped.");
    }

    private async poll() {
        try {
            // 1. Fetch top active markets
            const markets = await this.client.getMarkets(20);

            // 2. Analyze each market for signals
            if (markets && markets.length > 0) {
                for (const market of markets) {
                    const signals = this.engine.evaluate(market);
                    if (signals.length > 0) {
                        await this.processSignals(signals, market);
                    }
                }
            }
        } catch (error) {
            console.error("Error in poll loop:", error);
        }
    }

    private async processSignals(signals: ArbSignal[], market: Market) {
        for (const signal of signals) {
            console.log(
                `[SIGNAL] ${signal.type} on ${market.slug} (${signal.outcomeId})`,
            );

            // Dispatch to Titan Execution
            const sent = await this.executionClient.sendSignal({
                signal_id: `sentinel-${Date.now()}-${
                    Math.floor(Math.random() * 1000)
                }`,
                type: "PREPARE", // Initiate a trade preparation
                symbol: "POLYMARKET", // Special symbol? Or map to related asset?
                phase_id: "phase3",
                market_id: market.id,
                outcome_id: signal.outcomeId,
                direction: "LONG", // Buying the outcome
                price: signal.price,
                confidence: signal.confidence,
            });

            if (sent) {
                console.log("  > Dispatched to Titan Execution ✓");
            } else {
                console.log("  > Dispatch FAILED ✗");
            }
        }
    }
}
