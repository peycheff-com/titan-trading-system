/* eslint-disable functional/immutable-data -- Stateful runtime: mutations architecturally required */
import { Logger } from '@titan/shared';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

export interface FeatureFlags {
  [key: string]: boolean | string | number;
}

export class FeatureManager extends EventEmitter {
  private static instance: FeatureManager;
  private logger: Logger;
  private redis: Redis;
  private flags: FeatureFlags = {};
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly FLAG_KEY = 'titan:features';

  private constructor(logger: Logger, redisClient: Redis) {
    super();
    this.logger = logger;
    this.redis = redisClient;

    // Default flags
    this.flags = {
      'risk.strict_mode': true,
      'trading.enabled': false,
    };
  }

  public static getInstance(logger: Logger, redisClient: Redis): FeatureManager {
    if (!FeatureManager.instance) {
      FeatureManager.instance = new FeatureManager(logger, redisClient);
    }
    return FeatureManager.instance;
  }

  public async start(intervalMs: number = 30000): Promise<void> {
    this.logger.info('Starting FeatureManager polling');
    await this.refresh();

    this.pollInterval = setInterval(async () => {
      await this.refresh();
    }, intervalMs);
  }

  public stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    // Redis lifecycle managed by factory
  }

  public get(key: string, defaultValue: boolean | string | number): boolean | string | number {
    return this.flags[key] ?? defaultValue;
  }

  public isEnabled(key: string): boolean {
    return !!this.get(key, false);
  }

  public getAll(): FeatureFlags {
    return { ...this.flags };
  }

  private async refresh(): Promise<void> {
    try {
      const data = await this.redis.get(this.FLAG_KEY);
      if (data) {
        const newFlags = JSON.parse(data);
        const hasChanges = JSON.stringify(this.flags) !== JSON.stringify(newFlags);

        if (hasChanges) {
          this.flags = { ...this.flags, ...newFlags };
          this.logger.info('Feature flags updated', undefined, {
            flags: this.flags,
          });
          this.emit('updated', this.flags);
        }
      }
    } catch (error) {
      this.logger.error('Failed to refresh feature flags', error as Error);
    }
  }
}
