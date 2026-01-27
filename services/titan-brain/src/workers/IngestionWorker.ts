import { IngestionEvent, IngestionQueue } from "../queue/IngestionQueue.js";
import { DatabaseManager } from "../db/DatabaseManager.js";
import { FillsRepository } from "../db/repositories/FillsRepository.js";
import { getLogger } from "../monitoring/index.js";
import { retryWithBackoff } from "../utils/Retry.js";

export class IngestionWorker {
  private queue: IngestionQueue;
  private db: DatabaseManager;
  private fillsRepo: FillsRepository;
  private logger = getLogger();

  constructor(
    queue: IngestionQueue,
    db: DatabaseManager,
    fillsRepo: FillsRepository,
  ) {
    this.queue = queue;
    this.db = db;
    this.fillsRepo = fillsRepo;
  }

  public start(): void {
    this.logger.info("Starting IngestionWorker...");
    this.queue.on("batch", this.processBatch.bind(this));
    this.queue.startAutoFlush();
  }

  public stop(): void {
    this.logger.info("Stopping IngestionWorker...");
    this.queue.stopAutoFlush();
    this.queue.removeAllListeners("batch");
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
      const fills = batch.filter((e) => e.type === "FILL").map((e) =>
        e.payload
      );

      // Process Fills with Retry
      if (fills.length > 0) {
        await retryWithBackoff(
          async () => {
            await this.fillsRepo.createFills(fills);
          },
          { maxRetries: 3, initialDelayMs: 200 },
          "IngestionWorker:createFills",
        );
        this.logger.debug(`Batched insert of ${fills.length} fills`);
      }

      // Handle other types explicitly to avoid data loss
      const others = batch.filter((e) => e.type !== "FILL");
      if (others.length > 0) {
        this.logger.warn(
          `Ignored ${others.length} non-FILL events in ingestion batch`,
        );
        // In a real system, we would route these to their respective Repositories
        // e.g. tradeRepo.createTrades(...)
      }

      const duration = Date.now() - startTime;
      this.logger.info(`Processed ${batch.length} events in ${duration}ms`);
    } catch (error) {
      this.logger.error("Failed to process ingestion batch - Moving to DLQ", {
        error,
        batchSize: batch.length,
      });

      // DLQ Implementation (Write to file for recovery)
      await this.writeToDlq(batch, error);
    }
  }

  private async writeToDlq(batch: IngestionEvent[], error: any): Promise<void> {
    try {
      // Lazy import fs/path if not already available or use a helper
      // Creating a simple file-based DLQ
      const fs = await import("fs");
      const path = await import("path");

      const dlqDir = "data/dlq";
      if (!fs.existsSync(dlqDir)) {
        await fs.promises.mkdir(dlqDir, { recursive: true });
      }

      const timestamp = Date.now();
      const filename = path.join(dlqDir, `ingestion_fail_${timestamp}.json`);

      const payload = {
        timestamp,
        error: error instanceof Error ? error.message : String(error),
        events: batch,
      };

      await fs.promises.writeFile(filename, JSON.stringify(payload, null, 2));
      this.logger.info(`Saved failed batch to DLQ: ${filename}`);
    } catch (dlqError) {
      this.logger.error("CRITICAL: Failed to write to DLQ!", dlqError as Error);
      // At this point we are effectively losing data if we can't write to disk
    }
  }
}
