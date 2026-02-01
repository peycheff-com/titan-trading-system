/**
 * Prometheus Metrics for Canonical PowerLaw Service
 *
 * Exposes tail-risk computation metrics for monitoring and alerting
 */

import client from 'prom-client';

const PREFIX = 'titan_powerlaw_';

/**
 * PowerLaw Metrics collector
 */
export class PowerLawMetrics {
  private readonly registry: client.Registry;

  // Metric instances
  private readonly metricsPublishedTotal: client.Counter;
  private readonly constraintsPublishedTotal: client.Counter;
  private readonly computationDurationMs: client.Histogram;
  private readonly activeSymbolsGauge: client.Gauge;
  private readonly tailAlphaGauge: client.Gauge;
  private readonly expectedShortfallGauge: client.Gauge;
  private readonly healthStatusGauge: client.Gauge;
  private readonly volatilityStateGauge: client.Gauge;
  private readonly sampleSizeGauge: client.Gauge;

  constructor() {
    this.registry = new client.Registry();

    // Enable default metrics (CPU, Memory, etc.)
    client.collectDefaultMetrics({
      register: this.registry,
      prefix: PREFIX,
    });

    // Total metrics published
    this.metricsPublishedTotal = new client.Counter({
      name: `${PREFIX}metrics_published_total`,
      help: 'Total number of PowerLaw metrics published to NATS',
      labelNames: ['venue', 'symbol'],
      registers: [this.registry],
    });

    // Total constraints published
    this.constraintsPublishedTotal = new client.Counter({
      name: `${PREFIX}constraints_published_total`,
      help: 'Total number of execution constraints published to NATS',
      labelNames: ['venue', 'symbol', 'risk_mode'],
      registers: [this.registry],
    });

    // Computation duration histogram
    this.computationDurationMs = new client.Histogram({
      name: `${PREFIX}computation_duration_ms`,
      help: 'Time taken to compute PowerLaw metrics in milliseconds',
      labelNames: ['symbol'],
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
      registers: [this.registry],
    });

    // Active symbols being tracked
    this.activeSymbolsGauge = new client.Gauge({
      name: `${PREFIX}active_symbols`,
      help: 'Number of symbols currently being tracked',
      registers: [this.registry],
    });

    // Tail alpha per symbol
    this.tailAlphaGauge = new client.Gauge({
      name: `${PREFIX}tail_alpha`,
      help: 'Current tail exponent (alpha) estimate per symbol',
      labelNames: ['venue', 'symbol'],
      registers: [this.registry],
    });

    // Expected shortfall per symbol
    this.expectedShortfallGauge = new client.Gauge({
      name: `${PREFIX}expected_shortfall_95`,
      help: 'Expected shortfall at 95% confidence per symbol',
      labelNames: ['venue', 'symbol'],
      registers: [this.registry],
    });

    // Health status gauge (1=ok, 0=degraded)
    this.healthStatusGauge = new client.Gauge({
      name: `${PREFIX}health_status`,
      help: 'Health status per symbol (1=ok, 0.5=stale, 0.25=low_sample, 0=fit_failed)',
      labelNames: ['venue', 'symbol', 'status'],
      registers: [this.registry],
    });

    // Volatility state gauge (0=normal, 1=elevated, 2=crisis)
    this.volatilityStateGauge = new client.Gauge({
      name: `${PREFIX}volatility_state`,
      help: 'Volatility state per symbol (0=normal, 1=elevated, 2=crisis)',
      labelNames: ['venue', 'symbol'],
      registers: [this.registry],
    });

    // Sample size gauge
    this.sampleSizeGauge = new client.Gauge({
      name: `${PREFIX}sample_size`,
      help: 'Number of return samples used for estimation',
      labelNames: ['venue', 'symbol'],
      registers: [this.registry],
    });
  }

  /**
   * Record metrics publication
   */
  recordMetricsPublished(venue: string, symbol: string): void {
    this.metricsPublishedTotal.labels({ venue, symbol }).inc();
  }

  /**
   * Record constraints publication
   */
  recordConstraintsPublished(venue: string, symbol: string, riskMode: string): void {
    this.constraintsPublishedTotal
      .labels({
        venue,
        symbol,
        risk_mode: riskMode,
      })
      .inc();
  }

  /**
   * Record computation duration
   */
  recordComputationDuration(symbol: string, durationMs: number): void {
    this.computationDurationMs.labels({ symbol }).observe(durationMs);
  }

  /**
   * Update active symbols count
   */
  updateActiveSymbols(count: number): void {
    this.activeSymbolsGauge.set(count);
  }

  /**
   * Update metrics for a symbol
   */
  updateSymbolMetrics(
    venue: string,
    symbol: string,
    tailAlpha: number,
    expectedShortfall: number,
    healthStatus: 'ok' | 'stale' | 'low_sample' | 'fit_failed',
    volatilityState: string, // schema states: 'stable', 'expanding', 'contracting', 'unknown'
    sampleSize: number,
  ): void {
    this.tailAlphaGauge.labels({ venue, symbol }).set(tailAlpha);
    this.expectedShortfallGauge.labels({ venue, symbol }).set(expectedShortfall);

    // Map health status to numeric value
    const healthValue =
      healthStatus === 'ok'
        ? 1
        : healthStatus === 'stale'
          ? 0.5
          : healthStatus === 'low_sample'
            ? 0.25
            : 0;
    this.healthStatusGauge.labels({ venue, symbol, status: healthStatus }).set(healthValue);

    // Map volatility state to numeric value (0=stable, 1=expanding, 2=contracting)
    const volValue =
      volatilityState === 'expanding' || volatilityState === 'elevated'
        ? 1
        : volatilityState === 'contracting' || volatilityState === 'crisis'
          ? 2
          : 0;
    this.volatilityStateGauge.labels({ venue, symbol }).set(volValue);

    this.sampleSizeGauge.labels({ venue, symbol }).set(sampleSize);
  }

  /**
   * Export metrics in Prometheus format
   */
  async export(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get content type for Prometheus scraping
   */
  get contentType(): string {
    return this.registry.contentType;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.registry.resetMetrics();
  }
}

// Singleton instance
// eslint-disable-next-line functional/no-let
let metricsInstance: PowerLawMetrics | null = null;

/**
 * Get or create the global metrics instance
 */
export function getPowerLawMetrics(): PowerLawMetrics {
  if (!metricsInstance) {
    metricsInstance = new PowerLawMetrics();
  }
  return metricsInstance;
}

/**
 * Reset the global metrics instance (for testing)
 */
export function resetPowerLawMetrics(): void {
  if (metricsInstance) {
    metricsInstance.reset();
  }
  metricsInstance = null;
}
