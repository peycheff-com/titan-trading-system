import {
    Logger,
    NatsClient,
    PowerLawMetricsSchemaV1,
    PowerLawMetricsV1,
    RegimeState,
} from "@titan/shared";

/**
 * Service to infer the current Market Regime based on Power Law metrics.
 *
 * Regimes:
 * - CRASH: Alpha < 1.5 (Heavy tails, extreme risk) -> Cash heavy
 * - VISCOUS: Alpha > 3.0 (Stable, mean reverting) -> Sentinel heavy
 * - VOLATILE_BREAKOUT: Expanding volatility -> Hunter heavy
 * - MEAN_REVERSION: Normal market behavior -> Standard allocation
 */
export class RegimeInferenceService {
    private readonly nc: NatsClient;
    private readonly logger: Logger;
    private currentRegime: RegimeState = RegimeState.STABLE;
    private lastAlpha: number = 2.0;

    constructor(natsClient: NatsClient) {
        this.nc = natsClient;
        this.logger = Logger.getInstance("regime-inference");
    }

    public async start(): Promise<void> {
        this.logger.info("Starting Regime Inference Service");

        // Subscribe to Power Law Metrics (using V1 topic)
        this.nc.subscribe(
            "titan.data.metrics.powerlaw",
            async (data: unknown) => {
                try {
                    const metrics = PowerLawMetricsSchemaV1.parse(data);
                    this.processMetrics(metrics);
                } catch {
                    // Ignore parsing errors for non-V1 metrics if any
                }
            },
        );
    }

    private processMetrics(metrics: PowerLawMetricsV1): void {
        // Only care about BTCUSDT as the global market proxy for now
        if (metrics.symbol !== "BTCUSDT") return;

        // Check health and confidence
        if (
            metrics.health.status !== "ok" && metrics.health.status !== "stale"
        ) {
            // If data is bad, fallback to standard regime (don't act on noise)
            // But if it was CRASH, maybe stay CRASH?
            // Safer to default to MEAN_REVERSION (Neutral) if data is garbage.
            return;
        }

        const confidence = metrics.tail.confidence ?? 0;
        if (confidence < 0.5) {
            // Low confidence, ignore update
            return;
        }

        // Use tail.alpha if available, otherwise default to 2.0 safe
        const alpha = metrics.tail.alpha ?? 2.0;
        this.lastAlpha = alpha;

        const newRegime = this.inferRegime(metrics);

        if (newRegime !== this.currentRegime) {
            this.logger.info(
                `Regime Change Detected: ${this.currentRegime} -> ${newRegime}. Alpha: ${alpha}, VolState: ${metrics.vol_cluster.state}, Conf: ${confidence}`,
            );
            this.currentRegime = newRegime;
            this.publishRegimeChange();
        }
    }

    private inferRegime(metrics: PowerLawMetricsV1): RegimeState {
        const alpha = metrics.tail.alpha ?? 2.0;
        const volState = metrics.vol_cluster.state;

        // 1. Crash Detection (Heavy Tails)
        if (alpha <= 1.5) {
            return RegimeState.CRASH;
        }

        // 2. Volatile Breakout (Expanding Vol + Moderate Tails)
        if (volState === "expanding" && alpha < 2.5) {
            return RegimeState.VOLATILE_BREAKOUT;
        }

        // 3. Stable / Viscous (High Alpha)
        if (alpha >= 3.0) {
            // Mapping STABLE to MEAN_REVERSION effectively, or STABLE if we want strict
            // Using STABLE as per enum logic (Sentinel Dominant)
            return RegimeState.STABLE;
        }

        // Default: Mean Reversion / Normal
        return RegimeState.MEAN_REVERSION;
    }

    private publishRegimeChange(): void {
        this.nc.publish("titan.evt.system.regime", {
            regime: this.currentRegime,
            timestamp: Date.now(),
            source: "regime-inference-service",
            metadata: {
                alpha: this.lastAlpha,
            },
        });
    }

    public getCurrentRegime(): RegimeState {
        return this.currentRegime;
    }
}
