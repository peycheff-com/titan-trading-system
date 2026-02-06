import { EventEmitter } from 'eventemitter3';
import { NatsClient } from '../messaging/NatsClient.js';
import { Logger } from '../logger/Logger.js';
export interface LeaderElectorConfig {
    bucket: string;
    key: string;
    leaseDurationMs: number;
    heartbeatIntervalMs: number;
    nodeId: string;
}
export declare interface LeaderElector {
    on(event: 'promoted', listener: () => void): this;
    on(event: 'demoted', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
}
export declare class LeaderElector extends EventEmitter {
    private readonly config;
    private readonly natsClient;
    private readonly logger;
    private kv;
    private isLeaderState;
    private heartbeatTimer;
    private running;
    private leaderTerm;
    constructor(config: LeaderElectorConfig, natsClient: NatsClient, logger: Logger);
    start(): Promise<void>;
    stop(): Promise<void>;
    isLeader(): boolean;
    /**
     * P1: Get current leader term (fencing token)
     * Use this to validate that messages are from the current leader epoch
     */
    getLeaderTerm(): number;
    /**
     * P1: Set up NATS connection status monitoring for hard demotion
     */
    private setupConnectionStatusHandler;
    private initializeKv;
    private startHeartbeatLoop;
    private tryAcquireLease;
    private renewLease;
    private releaseLease;
    private promote;
    private demote;
    private encodeValue;
    private decodeValue;
    private stringCodec;
}
//# sourceMappingURL=LeaderElector.d.ts.map