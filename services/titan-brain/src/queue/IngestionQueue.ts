import { EventEmitter } from 'events';

export interface IngestionEvent {
  type: 'FILL' | 'TRADE' | 'ORDER_UPDATE';
  payload: any;
  timestamp: number;
}

export class IngestionQueue extends EventEmitter {
  private queue: IngestionEvent[] = [];
  private batchSize: number = 100;
  private flushIntervalMs: number = 1000;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(batchSize: number = 100, flushIntervalMs: number = 1000) {
    super();
    this.batchSize = batchSize;
    this.flushIntervalMs = flushIntervalMs;
  }

  public enqueue(event: IngestionEvent): void {
    this.queue.push(event);
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  public startAutoFlush(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, this.flushIntervalMs);
  }

  public stopAutoFlush(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);

      this.intervalId = null;
    }
    // Flush remaining
    this.flush();
  }

  private flush(): void {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];

    this.queue = [];
    this.emit('batch', batch);
  }

  public getLength(): number {
    return this.queue.length;
  }
}
