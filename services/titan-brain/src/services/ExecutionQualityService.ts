/* eslint-disable functional/immutable-data -- Stateful runtime: mutations architecturally required */
import {
  type ExecutionQualityEvent,
  type ExecutionReport,
  ExecutionReportSchema,
  type NatsClient,
  TITAN_QUALITY_TOPIC,
  TITAN_SUBJECTS,
} from '@titan/shared';

import { getLogger, getMetrics, type StructuredLogger } from '../monitoring/index.js';

interface ExecutionSample {
  readonly timestamp: number;
  readonly slippage: number;
  readonly latencyms: number;
  readonly fillRate: number;
}

export class ExecutionQualityService {
  private readonly nc: NatsClient;
  private readonly logger: StructuredLogger;
  private readonly windowMs: number = 60000; // 1 minute window

  private samples: ExecutionSample[] = [];

  private intervalId: NodeJS.Timeout | null = null;

  constructor(nc: NatsClient) {
    this.nc = nc;
    this.logger = getLogger({ component: 'ExecutionQuality' });
  }

  public async start(): Promise<void> {
    this.logger.info('Starting Execution Quality Service');

    // Subscribe to Execution Reports
    this.nc.subscribe(TITAN_SUBJECTS.EVT.EXECUTION.REPORT, async (data: unknown) => {
      try {
        const report = ExecutionReportSchema.parse(data);
        this.processExecution(report);
      } catch (err) {
        this.logger.error('Failed to parse execution report', err);
      }
    });

    // Determine quality every 5 seconds
    this.intervalId = setInterval(() => this.publishQuality(), 5000);
  }

  public async stop(): Promise<void> {
    this.logger.info('Stopping Execution Quality Service');
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private processExecution(report: ExecutionReport): void {
    // Calculate metric for this single execution
    // Slippage: |(Exec - Target) / Target|
    // We assume target price is available. If not, we skip slippage for now or assume 0.
    // For this implementation, we need a way to know Target Price.
    // The ExecutionReport might have it, or we rely on 'price' vs 'stop_price' or similar.
    // Let's assume for now we just track latency and fill rate if target is missing.

    // Calculate Latency (ExecTime - OrderTime)
    // usage of timestamp from report
    const latency = Date.now() - (report.timestamp || Date.now());

    // Fill Rate: cumulative_quantity / order_quantity (if order_quantity known)
    // Required fields might be missing in partial reports.
    // Let's simplify: Latency is the primary metric we can verify easiest right now.
    const fillRate = 1.0; // Placeholder

    const sample: ExecutionSample = {
      timestamp: Date.now(),
      slippage: 0, // Placeholder
      latencyms: latency,
      fillRate,
    };

     
    this.samples.push(sample);
    this.logger.debug('Recorded execution sample', {
      sample: JSON.stringify(sample),
    });

    getMetrics().observeHistogram('titan.execution.latency', latency, {
      venue: 'unknown',
    });
  }

  private async publishQuality(): Promise<void> {
    const now = Date.now();
    // Prune old samples
     
    this.samples = this.samples.filter((s) => now - s.timestamp < this.windowMs);

    if (this.samples.length === 0) {
      return;
    }

    // Calculate averages
    const avgLatency = this.samples.reduce((sum, s) => sum + s.latencyms, 0) / this.samples.length;
    const avgFillRate = this.samples.reduce((sum, s) => sum + s.fillRate, 0) / this.samples.length;
    const avgSlippage = this.samples.reduce((sum, s) => sum + s.slippage, 0) / this.samples.length;

    // Simple Score Calculation: Start at 1.0, penalize.
    // Penalize 0.1 for every 100ms latency above 50ms (example)
    const latencyPenalty = Math.max(0, (avgLatency - 50) / 100) * 0.1;
    const score = Math.max(0, 1.0 - latencyPenalty);

    const qualityEvent: ExecutionQualityEvent = {
      timestamp: now,
      service: 'titan-brain',
      score: {
        slippage: avgSlippage,
        latency_ms: avgLatency,
        fill_rate: avgFillRate,
        sample_size: this.samples.length,
        window_ms: this.windowMs,
        total_score: score,
      },
    };

    this.logger.info('Publishing Execution Quality', {
      quality: qualityEvent,
    });
    getMetrics().setGauge('titan.quality.score', score);

    await this.nc.publish(TITAN_QUALITY_TOPIC, qualityEvent);
  }
}
