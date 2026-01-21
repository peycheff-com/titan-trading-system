import { IngestionEvent, IngestionQueue } from '../queue/IngestionQueue.js';
import { DatabaseManager } from '../db/DatabaseManager.js';
import { FillsRepository } from '../db/repositories/FillsRepository.js';
import { getLogger } from '../monitoring/index.js';

export class IngestionWorker {
  private queue: IngestionQueue;
  private db: DatabaseManager;
  private fillsRepo: FillsRepository;
  private logger = getLogger();

  constructor(queue: IngestionQueue, db: DatabaseManager, fillsRepo: FillsRepository) {
    this.queue = queue;
    this.db = db;
    this.fillsRepo = fillsRepo;
  }

  public start(): void {
    this.logger.info('Starting IngestionWorker...');
    this.queue.on('batch', this.processBatch.bind(this));
    this.queue.startAutoFlush();
  }

  public stop(): void {
    this.logger.info('Stopping IngestionWorker...');
    this.queue.stopAutoFlush();
    this.queue.removeAllListeners('batch');
  }

  private async processBatch(batch: IngestionEvent[]): Promise<void> {
    if (batch.length === 0) return;

    const startTime = Date.now();
    this.logger.debug(`Processing batch of ${batch.length} events...`);

    try {
      // Perform batch operations
      // We use direct batch methods from repositories which handle their own optimization
      // For true transactions across repositories, we would need to pass a client/context,
      // but here we are primarily batching per-entity for performance.

      // Group events by type
      const fills = batch.filter((e) => e.type === 'FILL').map((e) => e.payload);

      // Process Fills
      if (fills.length > 0) {
        await this.fillsRepo.createFills(fills);
        this.logger.debug(`Batched insert of ${fills.length} fills`);
      }

      // TODO: Handle other event types like TRADE or ORDER_UPDATE

      const duration = Date.now() - startTime;
      this.logger.info(`Processed ${batch.length} events in ${duration}ms`);
    } catch (error) {
      this.logger.error('Failed to process ingestion batch', {
        error,
        batchSize: batch.length,
      });
      // TODO: Implement DLQ or retry logic
    }
  }
}
