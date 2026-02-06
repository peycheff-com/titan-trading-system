import { JetStreamClient, JetStreamManager, KV, KvEntry, KvWatchOptions, QueuedIterator, Subscription } from "nats";
import { EventEmitter } from "eventemitter3";
export declare const TitanSubject: {
    readonly CMD_EXEC_PLACE: "titan.cmd.execution.place.v1";
    readonly CMD_SYS_HALT: "titan.cmd.sys.halt.v1";
    readonly CMD_AI_OPTIMIZE: "titan.cmd.ai.optimize.v1";
    readonly CMD_AI_OPTIMIZE_PROPOSAL: "titan.cmd.ai.optimize.proposal.v1";
    readonly CMD_RISK_POLICY: "titan.cmd.risk.policy.v1";
    readonly EVT_EXEC_FILL: "titan.evt.execution.fill.v1";
    readonly EVT_BRAIN_SIGNAL: "titan.evt.brain.signal.v1";
    readonly EVT_REGIME_UPDATE: "titan.evt.brain.regime.v1";
    readonly EVT_POWERLAW_UPDATE: "titan.evt.analytics.powerlaw.v1";
    readonly EVT_BUDGET_UPDATE: "titan.evt.budget.update.v1";
    readonly EVT_PHASE_INTENT: "titan.evt.phase.intent.v1";
    readonly EVT_PHASE_POSTURE: "titan.evt.phase.posture.v1";
    readonly EVT_PHASE_DIAGNOSTICS: "titan.evt.phase.diagnostics.v1";
    readonly DATA_MARKET_TICKER: "titan.data.market.ticker.v1";
    readonly DATA_DASHBOARD_UPDATE: "titan.data.dashboard.update.v1";
    readonly SIGNALS: "titan.evt.brain.signal.v1";
    readonly EXECUTION_FILL: "titan.evt.execution.fill.v1";
    readonly EXECUTION_REPORTS: "titan.evt.exec.report.v1";
    readonly MARKET_DATA: "titan.data.market.ticker.v1";
    readonly AI_OPTIMIZATION_REQUESTS: "titan.cmd.ai.optimize.v1";
    readonly REGIME_UPDATE: "titan.evt.brain.regime.v1";
    readonly DASHBOARD_UPDATES: "titan.data.dashboard.update.v1";
    readonly EXECUTION_INTENT: "titan.cmd.execution.place.v1";
    readonly SIGNAL_SUBMIT: "titan.evt.brain.signal.v1";
    readonly SIGNAL_POWERLAW_METRICS: "titan.data.powerlaw.metrics.v1";
    readonly SIGNAL_EXECUTION_CONSTRAINTS: "titan.data.execution.constraints.v1";
    readonly EVT_POWERLAW_IMPACT: "titan.evt.powerlaw.impact.v1";
};
export type TitanSubject = (typeof TitanSubject)[keyof typeof TitanSubject];
export interface NatsConfig {
    servers: string[];
    name?: string;
    token?: string;
    user?: string;
    pass?: string;
}
export declare class NatsClient extends EventEmitter {
    private nc;
    private js;
    private jsm;
    private readonly kvBuckets;
    private jc;
    private sc;
    private static instance;
    private readonly STREAM_PREFIXES;
    private constructor();
    static getInstance(): NatsClient;
    connect(config?: NatsConfig): Promise<void>;
    private ensureStreams;
    publish<T>(subject: TitanSubject | string, data: T): Promise<void>;
    /**
     * Publishes a message wrapped in the canonical Titan Envelope.
     * Enforces strict schema compliance.
     */
    publishEnvelope<T>(subject: TitanSubject | string, data: T, meta: {
        version: number;
        type: string;
        producer: string;
        id?: string;
        correlation_id?: string;
        causation_id?: string;
        idempotency_key?: string;
    }): Promise<void>;
    subscribe<T>(subject: TitanSubject | string, callback: (data: T, subject: string) => Promise<void> | void, durableName?: string): Subscription;
    close(): Promise<void>;
    request<T>(subject: string, data?: unknown, options?: {
        timeout?: number;
    }): Promise<T>;
    isConnected(): boolean;
    getJetStream(): JetStreamClient | null;
    getJetStreamManager(): JetStreamManager | null;
    publishToDlq(subject: string, originalMessage: unknown, error: Error, service: string, metadata?: Record<string, string>): Promise<void>;
    /**
     * Get or create a KV bucket by name.
     * Returns cached bucket if already opened.
     */
    getKv(bucket: string): Promise<KV>;
    /**
     * Put a value into a KV bucket
     */
    kvPut<T>(bucket: string, key: string, value: T): Promise<number>;
    /**
     * Get a value from a KV bucket
     */
    kvGet<T>(bucket: string, key: string): Promise<T | null>;
    /**
     * Get all keys from a KV bucket
     */
    kvKeys(bucket: string): Promise<string[]>;
    /**
     * Delete a key from a KV bucket
     */
    kvDelete(bucket: string, key: string): Promise<void>;
    /**
     * Watch a KV bucket for changes
     */
    kvWatch(bucket: string, options?: KvWatchOptions): Promise<QueuedIterator<KvEntry>>;
}
export declare const getNatsClient: () => NatsClient;
//# sourceMappingURL=NatsClient.d.ts.map