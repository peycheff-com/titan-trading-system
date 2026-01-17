import { getNatsClient, NatsClient, TitanSubject } from '@titan/shared';
import { NightlyOptimize } from '../cron/NightlyOptimize.js';

const logger = console;

export class NatsAdapter {
  private nats: NatsClient;
  private optimizer: NightlyOptimize;

  constructor(optimizer: NightlyOptimize) {
    this.nats = getNatsClient();
    this.optimizer = optimizer;
  }

  /**
   * Initialize NATS connection and subscriptions
   */
  async init(): Promise<void> {
    try {
      const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
      await this.nats.connect({
        servers: [natsUrl],
        name: 'titan-ai-quant',
      });

      this.subscribeToOptimizationRequests();

      logger.log('✅ NatsAdapter initialized');
    } catch (error) {
      logger.error('Failed to initialize NatsAdapter:', error);
      throw error;
    }
  }

  /**
   * Subscribe to AI optimization requests
   */
  private subscribeToOptimizationRequests(): void {
    this.nats.subscribe(
      TitanSubject.AI_OPTIMIZATION_REQUESTS,
      async (data: any, subject: string) => {
        logger.log(`Received optimization request on ${subject}`, data);

        try {
          // Trigger optimization
          // In a real scenario, we might use data to filter scope,
          // but for now we run the standard nightly cycle
          await this.optimizer.runNow();

          logger.log('✅ Automated optimization completed via NATS trigger');
        } catch (error) {
          logger.error('❌ Validated optimization failed:', error);
        }
      },
    );
  }

  /**
   * Close NATS connection
   */
  async close(): Promise<void> {
    await this.nats.close();
  }
}
