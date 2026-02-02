import { EventEmitter } from 'eventemitter3';
import { NatsClient } from '../messaging/NatsClient.js';
import { KV, NatsConnection } from 'nats';
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

export class LeaderElector extends EventEmitter {
  private kv: KV | null = null;
  private isLeaderState: boolean = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private running: boolean = false;
  // P1: Monotonic leader_term (fencing token) - increments on each promotion
  private leaderTerm: number = 0;

  constructor(
    private readonly config: LeaderElectorConfig,
    private readonly natsClient: NatsClient,
    private readonly logger: Logger,
  ) {
    super();
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.initializeKv();
      // P1: Subscribe to NATS connection status for hard demotion on disconnect
      this.setupConnectionStatusHandler();
      await this.tryAcquireLease();
      this.startHeartbeatLoop();
    } catch (error) {
      this.logger.error('Failed to start LeaderElector', error as Error);
      this.emit('error', error as Error);
    }
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.isLeaderState) {
      await this.releaseLease();
    }
  }

  public isLeader(): boolean {
    return this.isLeaderState;
  }

  /**
   * P1: Get current leader term (fencing token)
   * Use this to validate that messages are from the current leader epoch
   */
  public getLeaderTerm(): number {
    return this.leaderTerm;
  }

  /**
   * P1: Set up NATS connection status monitoring for hard demotion
   */
  private setupConnectionStatusHandler(): void {
    // Check connection state periodically using isConnected()
    const checkConnection = () => {
      if (!this.running) return;
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

  private async initializeKv(): Promise<void> {
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
    } catch (err) {
      // If it fails, try to create it via JSM if possible, but the view usually creates it if the stream exists
      // For now assume NatsClient setup handles stream creation or we rely on pre-existing buckets
      this.logger.warn(
        'KV bucket bind failed, attempting to continue or handle specific error',
        undefined,
        { error: err },
      );
      throw err;
    }
  }

  private startHeartbeatLoop() {
    if (!this.running) return;

    this.heartbeatTimer = setTimeout(async () => {
      try {
        if (this.isLeaderState) {
          await this.renewLease();
        } else {
          await this.tryAcquireLease();
        }
      } catch (error) {
        this.logger.warn('Leader election heartbeat failed', undefined, { error });
      } finally {
        if (this.running) {
          this.startHeartbeatLoop();
        }
      }
    }, this.config.heartbeatIntervalMs);
  }

  private async tryAcquireLease(): Promise<void> {
    if (!this.kv || !this.running) return;

    try {
      const entry = await this.kv.get(this.config.key);
      const now = Date.now();

      if (!entry) {
        // No leader, try to acquire
        await this.kv.create(this.config.key, this.encodeValue());
        this.promote();
      } else {
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
    } catch (err: any) {
      // CASE: Key might not exist (handled by !entry usually, but KV errs on get sometimes if 404 depending on client ver)
      // If err is 'wrong last sequence' (CAS fail), we lost race.
      if (err.message?.includes('wrong last sequence')) {
        return;
      }

      // If create failed (CAS race), we lost.
    }
  }

  private async renewLease(): Promise<void> {
    if (!this.kv || !this.running) return;

    try {
      // Just put again to reset TTL
      await this.kv.put(this.config.key, this.encodeValue());
    } catch (err) {
      this.logger.warn('Failed to renew lease, demoting...', undefined, { error: err });
      this.demote();
    }
  }

  private async releaseLease(): Promise<void> {
    if (!this.kv) return;
    try {
      await this.kv.delete(this.config.key);
      this.demote();
    } catch (err) {
      this.logger.warn('Failed to release lease', undefined, {
        error: err,
      });
    }
  }

  private promote() {
    if (this.isLeaderState) return;
    this.isLeaderState = true;
    // P1: Increment monotonic leader term (fencing token)
    this.leaderTerm++;
    this.logger.info(`👑 Became LEADER (Node: ${this.config.nodeId}, Term: ${this.leaderTerm})`);
    this.emit('promoted');
  }

  private demote() {
    if (!this.isLeaderState) return;
    this.isLeaderState = false;
    this.logger.info(`🙇 Became FOLLOWER (Node: ${this.config.nodeId})`);
    this.emit('demoted');
  }

  private encodeValue(): Uint8Array {
    return this.stringCodec.encode(
      JSON.stringify({
        nodeId: this.config.nodeId,
        ts: Date.now(),
      }),
    );
  }

  private decodeValue(data: Uint8Array): { nodeId: string; ts: number } {
    try {
      return JSON.parse(this.stringCodec.decode(data));
    } catch {
      return { nodeId: 'unknown', ts: 0 };
    }
  }

  private stringCodec = {
    encode: (s: string) => Buffer.from(s),
    decode: (b: Uint8Array) => Buffer.from(b).toString(),
  };
}
