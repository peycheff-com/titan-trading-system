import { Logger } from '@titan/shared';
import Redis from 'ioredis';

export interface FeatureRecord {
  name: string;
  value: number[];
  timestamp: number;
  metadata?: Record<string, string>;
}

export class FeatureStoreClient {
  private redis: any; // Use any to bypass TS namespace errors with ioredis
  private logger: Logger;
  private readonly PREFIX = 'titan:features:';

  constructor(logger: Logger, redisUrl: string) {
    this.logger = logger;
    this.redis = new (Redis as any)(redisUrl);
  }

  public async put(
    featureName: string,
    value: number[],
    metadata?: Record<string, string>,
  ): Promise<void> {
    const key = `${this.PREFIX}${featureName}`;
    const record: FeatureRecord = {
      name: featureName,
      value,
      timestamp: Date.now(),
      metadata,
    };

    try {
      await this.redis.set(key, JSON.stringify(record));
      // Optional: Store history in a list or TSDB reference
      this.logger.debug(`Stored feature ${featureName}`, undefined, {
        value,
      });
    } catch (error) {
      this.logger.error(`Failed to store feature ${featureName}`, error as Error);
      throw error;
    }
  }

  public async get(featureName: string): Promise<FeatureRecord | null> {
    try {
      const data = await this.redis.get(`${this.PREFIX}${featureName}`);
      if (!data) return null;
      return JSON.parse(data);
    } catch (error) {
      this.logger.error(`Failed to retrieve feature ${featureName}`, error as Error);
      return null;
    }
  }

  public async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
