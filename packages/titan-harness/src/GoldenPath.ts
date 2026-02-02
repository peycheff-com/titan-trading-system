import { getNatsClient, TITAN_SUBJECTS } from "@titan/shared";
import { v4 as uuidv4 } from "uuid";

export interface HarnessConfig {
    natsUrl: string;
}

export interface RejectionEvent {
    reason: string;
    expected_policy_hash: string;
    got_policy_hash: string;
    intent_id: string;
    brain_instance_id: string;
    timestamp: number;
}

export interface LatencyStats {
    p50: number;
    p95: number;
    p99: number;
    samples: number[];
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

    // P0 item 7.5: Track rejection events
    private rejectionEvents: RejectionEvent[] = [];
    private latencySamples: number[] = [];

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
            TITAN_SUBJECTS.CMD.EXECUTION.ALL,
            (data: any, subject: string) => {
                this.handleExecutionIntent(data, subject);
            },
        );

        // P0 item 7.5: Listen for Execution Rejection Events
        this.nats.subscribe(
            TITAN_SUBJECTS.EVT.EXECUTION.REJECT,
            (data: any) => {
                this.handleRejectionEvent(data as RejectionEvent);
            },
        );

        this.running = true;
    }

    async stop() {
        await this.nats.close();
        this.running = false;
    }

    /**
     * Run normal acceptance scenario (Signal -> Brain -> Execution Accept)
     */
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
                await this.nats.publish(TITAN_SUBJECTS.SIGNAL.SUBMIT, signal);
            } catch (err) {
                clearTimeout(timeout);
                this.pendingSignals.delete(signalId);
                reject(err);
            }
        });
    }

    /**
     * P0 item 7.5: Run policy hash mismatch rejection scenario
     * Injects an intent with a wrong policy_hash to trigger rejection
     */
    async runRejectionScenario(
        symbol: string,
        badPolicyHash: string = "INVALID_HASH_ABC123",
    ): Promise<{ rejected: boolean; rejectionEvent?: RejectionEvent }> {
        const initialRejectionCount = this.rejectionEvents.length;
        const signalId = uuidv4();

        // Create intent with incorrect policy hash
        const intentPayload = {
            schema_version: "1.0.0",
            signal_id: signalId,
            source: "harness-rejection-test",
            symbol,
            direction: 1,
            type: "BUY_SETUP",
            entry_zone: [100, 101],
            stop_loss: 95,
            take_profits: [110],
            size: 0.01,
            status: "PENDING",
            t_signal: Date.now(),
            timestamp: Date.now(),
            policy_hash: badPolicyHash, // Wrong hash
            child_fills: [],
        };

        console.log(
            `🧪 Injecting Rejection Test [${signalId}] with bad hash: ${badPolicyHash}`,
        );

        // Publish directly to execution (bypassing Brain) with unsigned envelope
        // This should be rejected by Execution
        const subject = `${TITAN_SUBJECTS.CMD.EXECUTION.PREFIX}.auto.main.${
            symbol.replace("/", "_")
        }`;
        await this.nats.publish(subject, intentPayload);

        // Wait for rejection event (max 3s)
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Check if we got a new rejection event
        if (this.rejectionEvents.length > initialRejectionCount) {
            const rejectionEvent =
                this.rejectionEvents[this.rejectionEvents.length - 1];
            console.log(
                `✅ Rejection Event Received: ${rejectionEvent.reason}`,
            );
            return { rejected: true, rejectionEvent };
        }

        console.log("❌ No rejection event received (might be expected)");
        return { rejected: false };
    }

    /**
     * P0 item 7.5: Get latency statistics
     */
    getLatencyStats(): LatencyStats {
        const sorted = [...this.latencySamples].sort((a, b) => a - b);
        const len = sorted.length;

        if (len === 0) {
            return { p50: 0, p95: 0, p99: 0, samples: [] };
        }

        return {
            p50: sorted[Math.floor(len * 0.5)] || 0,
            p95: sorted[Math.floor(len * 0.95)] || 0,
            p99: sorted[Math.floor(len * 0.99)] || 0,
            samples: this.latencySamples,
        };
    }

    /**
     * P0 item 7.5: Get rejection rate by reason
     */
    getRejectionStats(): {
        total: number;
        byReason: Record<string, number>;
    } {
        const byReason: Record<string, number> = {};
        for (const event of this.rejectionEvents) {
            byReason[event.reason] = (byReason[event.reason] || 0) + 1;
        }
        return { total: this.rejectionEvents.length, byReason };
    }

    private handleExecutionIntent(data: any, subject: string) {
        // data.signal_id should match
        const signalId = data.signal_id;
        if (signalId && this.pendingSignals.has(signalId)) {
            const { resolve, start } = this.pendingSignals.get(signalId)!;
            const latency = Date.now() - start;
            this.latencySamples.push(latency); // P0: Track latency
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

    private handleRejectionEvent(event: RejectionEvent) {
        console.log(
            `⛔ Rejection Event: ${event.reason} (Expected: ${event.expected_policy_hash}, Got: ${event.got_policy_hash})`,
        );
        this.rejectionEvents.push(event);
    }
}
