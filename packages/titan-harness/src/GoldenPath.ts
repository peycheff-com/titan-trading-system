import { getNatsClient, TitanSubject } from "@titan/shared";
import { v4 as uuidv4 } from "uuid";

export interface HarnessConfig {
    natsUrl: string;
}

export class GoldenPath {
    private nats = getNatsClient();
    private running = false;
    private pendingSignals: Map<
        string,
        {
            resolve: (val: any) => void;
            reject: (err: any) => void;
            start: number;
        }
    > = new Map();

    constructor(private config: HarnessConfig) {}

    async start() {
        if (this.running) return;

        console.log(
            `🔌 Connecting Harness to NATS at ${this.config.natsUrl}...`,
        );
        await this.nats.connect({
            servers: [this.config.natsUrl],
            name: "titan-harness",
        });

        console.log("🎧 Subscribing to Command/Event streams...");

        // Listen for Brain -> Execution Intent
        this.nats.subscribe(
            "titan.cmd.exec.place.v1.>",
            (data: any, subject: string) => {
                this.handleExecutionIntent(data, subject);
            },
        );

        this.running = true;
    }

    async stop() {
        await this.nats.close();
        this.running = false;
    }

    async runScenario(
        symbol: string,
        side: "BUY" | "SELL",
        size: number = 1.0,
    ): Promise<any> {
        const signalId = uuidv4();
        const signal = {
            signal_id: signalId,
            source: "harness",
            symbol,
            direction: side === "BUY" ? 1 : -1,
            type: "MARKET",
            confidence: 0.99,
            timestamp: Date.now(),
            size,
            phase_id: "phase1", // Simulate Scavenger
        };

        console.log(
            `🚀 Injecting Signal [${signalId}] ${side} ${symbol} x${size}`,
        );

        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.pendingSignals.has(signalId)) {
                    this.pendingSignals.delete(signalId);
                    reject(
                        new Error(
                            `Timeout waiting for execution intent for signal ${signalId}`,
                        ),
                    );
                }
            }, 5000); // 5s Timeout

            this.pendingSignals.set(signalId, {
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                },
                start: Date.now(),
            });

            try {
                await this.nats.publish(TitanSubject.SIGNAL_SUBMIT, signal);
            } catch (err) {
                clearTimeout(timeout);
                this.pendingSignals.delete(signalId);
                reject(err);
            }
        });
    }

    private handleExecutionIntent(data: any, subject: string) {
        // data.signal_id should match
        const signalId = data.signal_id;
        if (signalId && this.pendingSignals.has(signalId)) {
            const { resolve, start } = this.pendingSignals.get(signalId)!;
            const latency = Date.now() - start;
            console.log(
                `✅ Verified Brain Output [${signalId}] in ${latency}ms`,
            );
            console.log(`   Subject: ${subject}`);
            console.log(`   Intent: ${JSON.stringify(data)}`);
            this.pendingSignals.delete(signalId);
            resolve({
                latency,
                intent: data,
            });
        }
    }
}
