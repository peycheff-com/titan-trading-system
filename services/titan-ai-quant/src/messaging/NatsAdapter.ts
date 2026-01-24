import { getNatsClient, NatsClient, TitanSubject } from '@titan/shared';
import { NightlyOptimize } from '../cron/NightlyOptimize.js';
import crypto from 'crypto';

const logger = console;

export class NatsAdapter {
  private nats: NatsClient;
  private optimizer: NightlyOptimize;

  constructor(optimizer: NightlyOptimize) {
    this.nats = getNatsClient();
    this.optimizer = optimizer;
  }

  /**
   * Publish regime update
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async publishRegimeUpdate(snapshot: any): Promise<void> {
    try {
      if (this.nats.isConnected()) {
        const id = crypto.randomUUID();

        await this.nats.publishEnvelope(TitanSubject.EVT_REGIME_UPDATE, snapshot, {
          type: TitanSubject.EVT_REGIME_UPDATE,
          version: 1,
          producer: 'titan-ai-quant',
          id: id,
        });
      }
    } catch (error) {
      logger.error('Failed to publish regime update:', error);
    }
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
      TitanSubject.CMD_AI_OPTIMIZE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (data: any, subject: string) => {
        // Dual Read Strategy

        // eslint-disable-next-line functional/no-let
        let payload = data;
        if (data && typeof data === 'object' && 'payload' in data && 'type' in data) {
          payload = data.payload;
        }

        logger.log(`Received optimization request on ${subject}`, payload);

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
