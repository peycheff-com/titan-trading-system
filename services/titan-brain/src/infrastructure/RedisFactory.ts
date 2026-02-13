/* eslint-disable functional/immutable-data -- Stateful connection pool: singleton + map mutations required */
import Redis, { RedisOptions } from 'ioredis';
import { Logger } from '@titan/shared';
import { TitanBrainConfig } from '../config/ConfigSchema';

export class RedisFactory {
  private static instance: RedisFactory;
  private logger: Logger;
  private clients: Map<string, Redis> = new Map();

  private constructor() {
    this.logger = Logger.getInstance('RedisFactory');
  }

  public static getInstance(): RedisFactory {
    if (!RedisFactory.instance) {
      RedisFactory.instance = new RedisFactory();
    }
    return RedisFactory.instance;
  }

  public createClient(config: TitanBrainConfig['redis'], name: string = 'default'): Redis {
    if (this.clients.has(name)) {
      return this.clients.get(name)!;
    }

    this.logger.info(`Creating Redis client: ${name}`);

    const options: RedisOptions = {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        this.logger.warn(`Redis retry attempt ${times} for ${name} in ${delay}ms`);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Only reconnect when the error starts with "READONLY"
          return true; // or return 2 to resend the failed command
        }
        return false;
      },
      maxRetriesPerRequest: config.maxRetries || 3,
      enableReadyCheck: true,
      showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
    };

    const client = new Redis(config.url, options);

    client.on('connect', () => {
      this.logger.info(`Redis client ${name} connected`);
    });

    client.on('ready', () => {
      this.logger.info(`Redis client ${name} ready`);
    });

    client.on('error', (err) => {
      this.logger.error(`Redis client ${name} error`, err);
    });

    client.on('close', () => {
      this.logger.warn(`Redis client ${name} connection closed`);
    });

    client.on('reconnecting', () => {
      this.logger.warn(`Redis client ${name} reconnecting...`);
    });

    this.clients.set(name, client);
    return client;
  }

  public async closeAll(): Promise<void> {
    this.logger.info('Closing all Redis clients...');
    const closePromises = Array.from(this.clients.values()).map((client) => client.quit());
    await Promise.all(closePromises);
    this.clients.clear();
    this.logger.info('All Redis clients closed');
  }
}
