import { Logger } from "../../logging/Logger.js";
import { getNatsClient, NatsClient, TITAN_SUBJECTS } from "@titan/shared";
import { DynamicConfigService } from "../config/DynamicConfigService.js";

interface ResultMetric {
  versionId: number;
  isCanary: boolean;
  pnl: number;
  slippage: number;
  success: boolean;
}

export class CanaryMonitor {
  private logger: Logger;
  private intervalId: NodeJS.Timeout | null = null;
  private configService: DynamicConfigService;
  private nats: NatsClient;

  // In-memory aggregations: versionId -> stats
  private stats: Map<
    number,
    {
      totalTrades: number;
      failedTrades: number;
      totalPnl: number;
      totalSlippage: number;
    }
  > = new Map();

  constructor(
    configService: DynamicConfigService,
    private readonly ledgerRepo?: any, // Optional for now
    private readonly metricsCollector?: any, // Optional
    natsClient?: NatsClient,
  ) {
    this.logger = Logger.getInstance("canary-monitor");
    this.nats = natsClient || getNatsClient();
    this.configService = configService;
  }

  async startMonitoring(intervalMs: number = 60000): Promise<void> {
    this.logger.info("Starting Canary Monitor...");

    // Listen for trade completion events
    await this.nats.subscribe(
      TITAN_SUBJECTS.EVT.ANALYSIS.TRADE_COMPLETED,
      (msg: any) => {
        const data = msg.payload || msg;
        if (data.configVersionId) {
          this.recordMetric({
            versionId: data.configVersionId,
            isCanary: data.isCanary,
            pnl: data.pnl,
            slippage: data.slippage,
            success: data.pnl >= 0,
          });
        }
      },
    );

    // Periodic Health Check
    // eslint-disable-next-line functional/immutable-data
    this.intervalId = setInterval(() => this.evaluateHealth(), intervalMs);
  }

  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      // eslint-disable-next-line functional/immutable-data
      this.intervalId = null;
    }
    this.logger.info("Canary Monitor stopped");
  }

  private recordMetric(metric: ResultMetric) {
    if (!this.stats.has(metric.versionId)) {
      // eslint-disable-next-line functional/immutable-data
      this.stats.set(metric.versionId, {
        totalTrades: 0,
        failedTrades: 0,
        totalPnl: 0,
        totalSlippage: 0,
      });
    }

    const stat = this.stats.get(metric.versionId)!;
    // eslint-disable-next-line functional/immutable-data
    stat.totalTrades++;
    // eslint-disable-next-line functional/immutable-data
    if (!metric.success) stat.failedTrades++;
    // eslint-disable-next-line functional/immutable-data
    stat.totalPnl += metric.pnl;
    // eslint-disable-next-line functional/immutable-data
    stat.totalSlippage += metric.slippage;
  }

  private evaluateHealth() {
    for (const [versionId, stat] of this.stats.entries()) {
      if (stat.totalTrades < 5) continue; // Min sample size

      const failureRate = stat.failedTrades / stat.totalTrades;

      // Example Threshold: > 60% failure
      if (failureRate > 0.6) {
        this.logger.error(
          `🚨 Canary Version ${versionId} is failing! Rate: ${failureRate}`,
        );
        this.triggerRollback(versionId);
      }
    }
  }

  private triggerRollback(versionId: number) {
    this.logger.warn(`Initiating rollback for version ${versionId}`);
    // Publish event for distributed systems
    this.nats.publish(TITAN_SUBJECTS.CMD.CONFIG.ROLLBACK, { versionId });

    // Also could call configService directly if needed, e.g.
    // this.configService.disableRollout(versionId);
  }
}
