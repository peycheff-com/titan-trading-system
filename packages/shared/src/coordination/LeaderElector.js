import { EventEmitter } from 'eventemitter3';
export class LeaderElector extends EventEmitter {
    config;
    natsClient;
    logger;
    kv = null;
    isLeaderState = false;
    heartbeatTimer = null;
    running = false;
    // P1: Monotonic leader_term (fencing token) - increments on each promotion
    leaderTerm = 0;
    constructor(config, natsClient, logger) {
        super();
        this.config = config;
        this.natsClient = natsClient;
        this.logger = logger;
    }
    async start() {
        if (this.running)
            return;
        this.running = true;
        try {
            await this.initializeKv();
            // P1: Subscribe to NATS connection status for hard demotion on disconnect
            this.setupConnectionStatusHandler();
            await this.tryAcquireLease();
            this.startHeartbeatLoop();
        }
        catch (error) {
            this.logger.error('Failed to start LeaderElector', error);
            this.emit('error', error);
        }
    }
    async stop() {
        this.running = false;
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.isLeaderState) {
            await this.releaseLease();
        }
    }
    isLeader() {
        return this.isLeaderState;
    }
    /**
     * P1: Get current leader term (fencing token)
     * Use this to validate that messages are from the current leader epoch
     */
    getLeaderTerm() {
        return this.leaderTerm;
    }
    /**
     * P1: Set up NATS connection status monitoring for hard demotion
     */
    setupConnectionStatusHandler() {
        // Check connection state periodically using isConnected()
        const checkConnection = () => {
            if (!this.running)
                return;
            if (!this.natsClient.isConnected()) {
                this.logger.error('🚨 NATS connection LOST - forcing DEMOTION');
                this.demote();
            }
            if (this.running && this.isLeaderState) {
                setTimeout(checkConnection, 1000); // Check every second while leader
            }
        };
        // Start checking after initial delay
        if (this.isLeaderState) {
            setTimeout(checkConnection, 1000);
        }
    }
    async initializeKv() {
        const js = this.natsClient.getJetStream();
        if (!js) {
            throw new Error('JetStream not available');
        }
        // Ensure bucket exists
        try {
            this.kv = await js.views.kv(this.config.bucket, {
                history: 1,
                ttl: this.config.leaseDurationMs + 2000,
            });
        }
        catch (err) {
            // If it fails, try to create it via JSM if possible, but the view usually creates it if the stream exists
            // For now assume NatsClient setup handles stream creation or we rely on pre-existing buckets
            this.logger.warn('KV bucket bind failed, attempting to continue or handle specific error', undefined, { error: err });
            throw err;
        }
    }
    startHeartbeatLoop() {
        if (!this.running)
            return;
        this.heartbeatTimer = setTimeout(async () => {
            try {
                if (this.isLeaderState) {
                    await this.renewLease();
                }
                else {
                    await this.tryAcquireLease();
                }
            }
            catch (error) {
                this.logger.warn('Leader election heartbeat failed', undefined, { error });
            }
            finally {
                if (this.running) {
                    this.startHeartbeatLoop();
                }
            }
        }, this.config.heartbeatIntervalMs);
    }
    async tryAcquireLease() {
        if (!this.kv || !this.running)
            return;
        try {
            const entry = await this.kv.get(this.config.key);
            const now = Date.now();
            if (!entry) {
                // No leader, try to acquire
                await this.kv.create(this.config.key, this.encodeValue());
                this.promote();
            }
            else {
                // Current leader exists
                // Since we are using KV TTL, the entry effectively disappears if expired.
                // If we see it, it's valid.
                // However, if we want to check if it's strictly US (in case of restart with same ID persistence?)
                // decode and check ID
                // For now, if get returns, someone holds it.
                const data = this.decodeValue(entry.value);
                if (data.nodeId === this.config.nodeId) {
                    // It's us! (Maybe recovered state)
                    if (!this.isLeaderState) {
                        this.promote();
                    }
                }
            }
        }
        catch (err) {
            // CASE: Key might not exist (handled by !entry usually, but KV errs on get sometimes if 404 depending on client ver)
            // If err is 'wrong last sequence' (CAS fail), we lost race.
            if (err.message?.includes('wrong last sequence')) {
                return;
            }
            // If create failed (CAS race), we lost.
        }
    }
    async renewLease() {
        if (!this.kv || !this.running)
            return;
        try {
            // Just put again to reset TTL
            await this.kv.put(this.config.key, this.encodeValue());
        }
        catch (err) {
            this.logger.warn('Failed to renew lease, demoting...', undefined, { error: err });
            this.demote();
        }
    }
    async releaseLease() {
        if (!this.kv)
            return;
        try {
            await this.kv.delete(this.config.key);
            this.demote();
        }
        catch (err) {
            this.logger.warn('Failed to release lease', undefined, {
                error: err,
            });
        }
    }
    promote() {
        if (this.isLeaderState)
            return;
        this.isLeaderState = true;
        // P1: Increment monotonic leader term (fencing token)
        this.leaderTerm++;
        this.logger.info(`👑 Became LEADER (Node: ${this.config.nodeId}, Term: ${this.leaderTerm})`);
        this.emit('promoted');
    }
    demote() {
        if (!this.isLeaderState)
            return;
        this.isLeaderState = false;
        this.logger.info(`🙇 Became FOLLOWER (Node: ${this.config.nodeId})`);
        this.emit('demoted');
    }
    encodeValue() {
        return this.stringCodec.encode(JSON.stringify({
            nodeId: this.config.nodeId,
            ts: Date.now(),
        }));
    }
    decodeValue(data) {
        try {
            return JSON.parse(this.stringCodec.decode(data));
        }
        catch {
            return { nodeId: 'unknown', ts: 0 };
        }
    }
    stringCodec = {
        encode: (s) => Buffer.from(s),
        decode: (b) => Buffer.from(b).toString(),
    };
}
//# sourceMappingURL=LeaderElector.js.map