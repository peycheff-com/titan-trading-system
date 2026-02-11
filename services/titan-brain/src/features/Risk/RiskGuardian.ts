/**
 * RiskGuardian - Monitors portfolio-level risk metrics and enforces correlation guards
 * Validates signals against leverage limits and correlation constraints
 *
 * Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7
 */

/* eslint-disable functional/immutable-data, functional/no-let -- RiskGuardian is stateful by design */

import {
  ExecutionEngineClient,
  IntentSignal,
  Position,
  PowerLawMetrics,
  RiskDecision,
  RiskGuardianConfig,
  RiskGuardianState,
  RiskMetrics,
} from '../../types/index.js';
import { AllocationEngine } from '../Allocation/AllocationEngine.js';
import { ChangePointDetector } from './ChangePointDetector.js';
import { DefconLevel, GovernanceEngine } from '../Governance/GovernanceEngine.js';
import { FeatureManager } from '../../config/FeatureManager.js';
import { TailRiskCalculator } from './TailRiskCalculator.js';
import { BayesianCalibrator } from './BayesianCalibrator.js';
import { NatsClient, RegimeState, RiskState, TITAN_SUBJECTS } from '@titan/shared';

/**
 * Interface for high correlation notification callback
 */
export interface HighCorrelationNotifier {
  sendHighCorrelationWarning(
    correlationScore: number,
    threshold: number,
    affectedPositions: string[],
  ): Promise<void>;
}

/**
 * Price history entry for correlation calculation
 */
export interface PriceHistoryEntry {
  symbol: string;
  timestamp: number;
  price: number;
}

/**
 * Correlation matrix cache entry
 */
interface CorrelationCacheEntry {
  correlation: number;
  timestamp: number;
}

/**
 * RiskGuardian monitors portfolio-level risk metrics and enforces
 * correlation guards and leverage limits on incoming signals.
 */
export class RiskGuardian {
  private config: RiskGuardianConfig;
  private readonly allocationEngine: AllocationEngine;
  private readonly governanceEngine: GovernanceEngine;
  private readonly changePointDetector: ChangePointDetector;
  private readonly tailRiskCalculator: TailRiskCalculator;
  private readonly bayesianCalibrator: BayesianCalibrator;
  private readonly natsClient?: NatsClient; // Optional for testing/DI
  private executionClient: ExecutionEngineClient | null = null;

  private currentRegime: RegimeState = RegimeState.STABLE;
  private currentRiskState: RiskState = RiskState.NORMAL;

  /** Price history for correlation calculations */
  private priceHistory: Map<string, PriceHistoryEntry[]> = new Map();

  /** Cached correlation matrix */
  private readonly correlationCache: Map<string, CorrelationCacheEntry> = new Map();

  /** Cached portfolio beta */
  private portfolioBetaCache: { value: number; timestamp: number } | null = null;

  /** PowerLaw Metrics Cache */
  private readonly powerLawMetrics: Map<string, PowerLawMetrics> = new Map();

  /** Current equity for leverage calculations */
  private currentEquity: number = 0;

  /** High correlation notifier */
  private correlationNotifier: HighCorrelationNotifier | null = null;

  /** Current confidence score (initially 1.0) */
  private confidenceScore: number = 1.0;

  /** Execution Quality Score (initially 1.0) */
  private executionQualityScore: number = 1.0;

  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(
    config: RiskGuardianConfig,
    allocationEngine: AllocationEngine,
    governanceEngine: GovernanceEngine,
    natsClient?: NatsClient,
  ) {
    this.config = config;
    this.allocationEngine = allocationEngine;
    this.governanceEngine = governanceEngine;
    this.natsClient = natsClient;
    this.changePointDetector = new ChangePointDetector();
    this.tailRiskCalculator = new TailRiskCalculator();
    this.bayesianCalibrator = new BayesianCalibrator();

    // Listener moved to NatsConsumer -> TitanBrain -> RiskGuardian
    // if (this.natsClient) {
    //   this.setupRegimeListener();
    // }

    this.startHeartbeat();
  }

  /**
   * Regime Listener removed in favor of Central Orchestration (NatsConsumer)
   */

  /**
   * Start 1s heartbeat to keep Execution Layer execution alive (Fail Closed)
   */
  public startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    this.heartbeatInterval = setInterval(() => {
      if (this.natsClient) {
        this.natsClient
          .publish(TITAN_SUBJECTS.SYS.HEARTBEAT('risk-guardian'), {
            ts: Date.now(),
            state: this.currentRiskState,
            regime: this.currentRegime,
          })
          .catch((err) => console.error('Failed to pulse heartbeat', err));
      }
    }, 1000);
  }

  public stopHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }

  /**
   * Derive Global Risk State from Regime, Governance, and Confidence
   */
  private deriveRiskState(): RiskState {
    // 1. Emergency Overrides
    if (this.governanceEngine.getDefconLevel() === DefconLevel.EMERGENCY) {
      return RiskState.EMERGENCY;
    }

    // 2. Regime Overrides
    if (this.currentRegime === RegimeState.CRASH) {
      return RiskState.EMERGENCY; // Crash = Stop
    }
    if (
      this.config.riskAversionLevel === 'HIGH' &&
      this.currentRegime === RegimeState.MEAN_REVERSION
    ) {
      return RiskState.CAUTIOUS;
    }

    // 3. Confidence degradation
    if (this.confidenceScore < 0.5) {
      return RiskState.DEFENSIVE;
    }

    // 4. Execution Quality degradation
    if (this.executionQualityScore < 0.7) {
      return RiskState.DEFENSIVE;
    }

    // 4. Default
    return RiskState.NORMAL;
  }

  /**
   * Update and publish new risk state
   */
  private updateAndPublishRiskState() {
    const newState = this.deriveRiskState();

    if (newState !== this.currentRiskState) {
      console.warn(`[RiskGuardian] State Transition: ${this.currentRiskState} -> ${newState}`);

      this.currentRiskState = newState;

      if (this.natsClient) {
        this.natsClient
          .publish(TITAN_SUBJECTS.EVT.RISK.STATE, JSON.stringify(newState))
          .catch((err) => console.error('Failed to publish risk state', err));
      }
    }
  }

  // Hook into updateConfidence to trigger state check
  overrideUpdateConfidence(drift: boolean) {
    this.updateConfidence(drift);
    this.updateAndPublishRiskState();
  }

  setExecutionClient(client: ExecutionEngineClient) {
    this.executionClient = client;
  }

  async tripCircuitBreaker(reason: string) {
    this.confidenceScore = 0.0;
    console.warn(`🚨 RiskGuardian Circuit Breaker TRIPPED: ${reason}`);

    if (this.executionClient && typeof this.executionClient.haltSystem === 'function') {
      try {
        await this.executionClient.haltSystem(reason);
      } catch (e) {
        console.error('Failed to halt system via execution client', e);
      }
    }

    this.updateAndPublishRiskState();
  }

  resetCircuitBreaker(reason: string) {
    console.log(`✅ RiskGuardian Circuit Breaker RESET: ${reason}`);
    this.confidenceScore = 1.0;
    this.updateAndPublishRiskState();
  }

  /**
   * Set the high correlation notifier
   */

  setCorrelationNotifier(notifier: HighCorrelationNotifier): void {
    this.correlationNotifier = notifier;
  }

  /**
   * Set FeatureManager for hot-reloadable risk configuration
   */
  setFeatureManager(featureManager: FeatureManager): void {
    featureManager.on('updated', (features) => {
      this.updateDynamicConfig(features);
    });
    // Apply initial config
    this.updateDynamicConfig(featureManager.getAll());
  }

  private updateDynamicConfig(features: Record<string, boolean | string | number>): void {
    let updated = false;

    // Dynamic Risk Parameters
    if (typeof features['risk.maxCorrelation'] === 'number') {
      this.config.maxCorrelation = features['risk.maxCorrelation'];
      updated = true;
    }
    if (typeof features['risk.correlationPenalty'] === 'number') {
      this.config.correlationPenalty = features['risk.correlationPenalty'];
      updated = true;
    }
    if (typeof features['risk.minConfidenceScore'] === 'number') {
      this.config.minConfidenceScore = features['risk.minConfidenceScore'];
      updated = true;
    }
    if (typeof features['risk.minStopDistanceMultiplier'] === 'number') {
      this.config.minStopDistanceMultiplier = features['risk.minStopDistanceMultiplier'];
      updated = true;
    }

    if (updated) {
      console.log('⚙️  RiskGuardian configuration updated dynamically');
      // Re-evaluate state
      this.updateAndPublishRiskState();
    }
  }

  /**
   * Get current PowerLaw metrics snapshot
   */
  getPowerLawMetricsSnapshot(): Record<string, PowerLawMetrics> {
    const snapshot: Record<string, PowerLawMetrics> = {};
    for (const [symbol, metrics] of this.powerLawMetrics.entries()) {
      snapshot[symbol] = metrics;
    }
    return snapshot;
  }

  /**
   * Get current regime state
   */
  getRegimeState(): RegimeState {
    return this.currentRegime;
  }

  /**
   * Set current regime state (called by Brain)
   */
  setRegimeState(regime: RegimeState): void {
    if (this.currentRegime !== regime) {
      console.log(`[RiskGuardian] Regime updated: ${this.currentRegime} -> ${regime}`);
      this.currentRegime = regime;
      this.updateAndPublishRiskState();
    }
  }

  /**
   * Set current equity for leverage calculations
   * @param equity - Current account equity in USD
   */
  setEquity(equity: number): void {
    this.currentEquity = Math.max(0, equity);
  }

  /**
   * Get current equity
   */
  getEquity(): number {
    /**
     * Get current equity
     */
    return this.currentEquity;
  }

  /**
   * Get internal state for observability
   */
  getInternalState(): RiskGuardianState {
    return {
      config: this.config,
      regime: this.currentRegime,
      powerLaw: Object.fromEntries(this.powerLawMetrics),
      metrics: {
        currentEquity: this.currentEquity,
        portfolioBeta: this.portfolioBetaCache?.value ?? 0,
        maxDrawdown: 0, // Placeholder or actual calc
      },
      circuitBreaker: {
        active: false,
        tripCount: 0,
      },
    };
  }

  /**
   * Get latest known price for a symbol
   */
  getLatestPrice(symbol: string): number | undefined {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length === 0) return undefined;
    const entry = history[history.length - 1];
    // Check if entry is object or number
    return typeof entry === 'number' ? entry : (entry as any).price;
  }

  /**
   * Update PowerLaw Metrics
   */
  updatePowerLawMetrics(metrics: PowerLawMetrics): void {
    this.powerLawMetrics.set(metrics.symbol, metrics);
  }

  /**
   * Handle incoming price tick
   */
  handlePriceUpdate(tick: { symbol: string; price: number; timestamp: number }): void {
    const history = this.priceHistory.get(tick.symbol) || [];

    history.push(tick);

    // Prune history older than window (e.g. 1 hour or based on ActiveInference window)
    const cutoff = Date.now() - 3600000;
    if (history[0] && history[0].timestamp < cutoff) {
      // Perform cleanup
      const validHistory = history.filter((h) => h.timestamp >= cutoff);

      this.priceHistory.set(tick.symbol, validHistory);
    } else {
      this.priceHistory.set(tick.symbol, history);
    }
  }

  /**
   * Update Confidence Score based on Reconciliation/Drift events
   * @param driftDetected - Whether a drift was detected in truth layer
   */
  updateConfidence(driftDetected: boolean): void {
    if (this.config.features?.disableTruthGating) {
      return;
    }

    if (driftDetected) {
      // Hard penalty on drift
      const penalty = 0.2; // -20%
      this.confidenceScore = Math.max(0, this.confidenceScore - penalty);
      console.warn(
        `[RiskGuardian] Confidence degraded to ${this.confidenceScore.toFixed(3)} due to DRIFT`,
      );
    } else {
      // Slow recovery
      const recovery = 0.01; // +1%
      this.confidenceScore = Math.min(1.0, this.confidenceScore + recovery);
    }

    // Force update state based on new confidence
    this.updateAndPublishRiskState();
  }

  /**
   * Update Execution Quality Score
   * @param score - New execution quality score (0.0 - 1.0)
   */
  updateExecutionQuality(score: number): void {
    this.executionQualityScore = score;
    if (score < 0.7) {
      console.warn(`[RiskGuardian] Execution Quality degraded to ${score.toFixed(2)}`);
      this.updateAndPublishRiskState();
    }
  }

  /**
   * Enforce Truth Layer Gating on new risk
   * Returns true if allowed, false if gated
   */
  private checkTruthGate(): boolean {
    if (this.config.features?.disableTruthGating) {
      return true;
    }

    // Hard Gate: If Confidence < 0.8 (Suspicious), block new risk
    if (this.confidenceScore < 0.8) {
      return false;
    }

    return true;
  }

  /**
   * Check a signal against risk rules
   *
   * Validation steps:
   * 1. Check if Phase 3 hedge that reduces delta (auto-approve)
   * 2. Calculate projected leverage
   * 3. Check leverage cap for equity tier
   * 4. Check correlation with existing positions
   * 5. Apply size reduction if high correlation
   *
   * @param signal - Intent signal from a phase
   * @param currentPositions - Array of current open positions
   * @returns RiskDecision with approval status and metrics
   */
  /**
   * Check a signal against risk rules
   *
   * Validation steps:
   * 1. Check if Phase 3 hedge that reduces delta (auto-approve)
   * 2. Calculate projected leverage
   * 3. Check leverage cap for equity tier
   * 4. Check correlation with existing positions
   * 5. Apply size reduction if high correlation
   *
   * @param signal - Intent signal from a phase
   * @param currentPositions - Array of current open positions
   * @returns RiskDecision with approval status and metrics
   */
  checkSignal(signal: IntentSignal, currentPositions: Position[]): RiskDecision {
    // 0. Governance & Regime Gating
    const defcon = this.governanceEngine.getDefconLevel();

    // 0a. Governance Check (Defcon)
    if (!this.governanceEngine.canOpenNewPosition(signal.phaseId)) {
      return {
        approved: false,
        reason: `GOVERNANCE_LOCKDOWN: ${defcon} rejects ${signal.phaseId}`,
        riskMetrics: this.getRiskMetrics(currentPositions),
      };
    }

    // 0a.1 Whitelist Check
    const symbolToken = signal.symbol.replace('/', '_');
    if (
      this.config.symbolWhitelist &&
      this.config.symbolWhitelist.length > 0 &&
      !this.config.symbolWhitelist.includes(symbolToken)
    ) {
      return {
        approved: false,
        reason: `Symbol not whitelisted: ${signal.symbol}`,
        riskMetrics: this.getRiskMetrics(currentPositions),
      };
    }

    // 0a.1 Truth Layer Gating
    if (!this.checkTruthGate()) {
      return {
        approved: false,
        reason: `TRUTH_VETO: Confidence Score ${this.confidenceScore.toFixed(2)} < 0.8`,
        riskMetrics: this.getRiskMetrics(currentPositions),
      };
    }

    // 0a.2 Max Position Notional Check (Policy V1)
    if (
      this.config.maxPositionNotional &&
      this.config.maxPositionNotional > 0 &&
      signal.requestedSize > this.config.maxPositionNotional
    ) {
      return {
        approved: false,
        reason: `Max Position Notional Exceeded: ${signal.requestedSize} > ${this.config.maxPositionNotional}`,
        riskMetrics: this.getRiskMetrics(currentPositions),
      };
    }

    // 0a.2 Execution Quality Gating (Gate 2)
    if (this.executionQualityScore < 0.7) {
      return {
        approved: false,
        reason: `EXECUTION_QUALITY_VETO: Score ${this.executionQualityScore.toFixed(2)} < 0.7`,
        riskMetrics: this.getRiskMetrics(currentPositions),
      };
    }

    // 0b. Regime Check
    if (this.currentRegime === RegimeState.CRASH) {
      // Strict veto for new risk in CRASH
      return {
        approved: false,
        reason: 'REGIME_CRASH_RISK_AVERSION: All new signals rejected',
        riskMetrics: this.getRiskMetrics(currentPositions),
      };
    }

    try {
      // 0c. Survival Mode Check (Tail Risk)
      // Calculate APTR for current + signal
      const alphas = new Map<string, number>();

      this.powerLawMetrics.forEach((m, s) => alphas.set(s, m.tailExponent));

      if (!alphas.has(signal.symbol)) alphas.set(signal.symbol, 2.0);

      const currentAPTR = this.tailRiskCalculator.calculateAPTR(currentPositions, alphas);
      const criticalThreshold = 0.5; // 50% max equity @ 20% crash

      if (
        this.tailRiskCalculator.isRiskCritical(currentAPTR, this.currentEquity, criticalThreshold)
      ) {
        if (defcon !== DefconLevel.DEFENSIVE && defcon !== DefconLevel.EMERGENCY) {
          console.warn(
            `[RiskGuardian] APTR Critical (${currentAPTR.toFixed(2)}). Triggering Survival Mode.`,
          );
          this.governanceEngine.setOverride(DefconLevel.DEFENSIVE);
        }

        return {
          approved: false,
          reason: `SURVIVAL_MODE: APTR Critical (${currentAPTR.toFixed(2)} > ${(
            this.currentEquity * criticalThreshold
          ).toFixed(2)})`,
          riskMetrics: this.getRiskMetrics(currentPositions),
        };
      }

      // 0e. Bayesian Confidence Calibration
      // Replaces raw confidence with evidential probability

      let effectiveConfidence = signal.confidence ?? 80;
      if (signal.phaseId === 'phase1' && signal.type !== 'MANUAL') {
        const trapType = (signal as any).trap_type || 'UNKNOWN';
        const calibratedProb = this.bayesianCalibrator.getCalibratedProbability(
          trapType,
          effectiveConfidence,
        );
        // Map back to 0-100 scale for legacy compatibility
        effectiveConfidence = calibratedProb * 100;
        console.log(
          `[RiskGuardian] ${this.bayesianCalibrator.getShrinkageReport(
            trapType,
            signal.confidence ?? 80,
          )}`,
        );
      }

      // Update confidence check
      if (effectiveConfidence / 100 < this.config.minConfidenceScore) {
        return {
          approved: false,
          reason: `CONFIDENCE_VETO: Calibrated ${effectiveConfidence.toFixed(
            2,
          )}% < ${this.config.minConfidenceScore * 100}%`,
          riskMetrics: this.getRiskMetrics(currentPositions),
        };
      }

      // Initial signal size

      let effectiveSize = signal.requestedSize;

      // 0f. Fractal Phase Risk Constraints
      if (this.config.fractal && this.config.fractal[signal.phaseId]) {
        const constraints = this.config.fractal[signal.phaseId];
        const phasePositions = currentPositions.filter((p) => p.phaseId === signal.phaseId);
        const phaseNotional = phasePositions.reduce((sum, p) => sum + p.size, 0) + effectiveSize;
        const phaseLeverage = phaseNotional / this.currentEquity;

        if (phaseLeverage > constraints.maxLeverage) {
          return {
            approved: false,
            reason: `FRACTAL_VETO: ${signal.phaseId} leverage ${phaseLeverage.toFixed(
              2,
            )}x > max ${constraints.maxLeverage}x`,
            riskMetrics: this.getRiskMetrics(currentPositions),
          };
        }

        if (phaseNotional > this.currentEquity * constraints.maxAllocation) {
          return {
            approved: false,
            reason: `FRACTAL_VETO: ${signal.phaseId} allocation ${(
              (phaseNotional / this.currentEquity) *
              100
            ).toFixed(1)}% > max ${constraints.maxAllocation * 100}%`,
            riskMetrics: this.getRiskMetrics(currentPositions),
          };
        }
      }

      const currentLeverage = this.calculateCombinedLeverage(currentPositions);
      const portfolioDelta = this.calculatePortfolioDelta(currentPositions);
      const portfolioBeta = this.getPortfolioBeta(currentPositions);

      // Requirement: Latency Feedback Loop
      if (signal.latencyProfile && signal.latencyProfile.endToEnd > 200) {
        if (signal.latencyProfile.endToEnd > 500) {
          return {
            approved: false,
            reason: `LATENCY_VETO: System lag ${signal.latencyProfile.endToEnd}ms > 500ms`,
            riskMetrics: this.getRiskMetrics(currentPositions),
          };
        }
        const penalty = 0.25;
        effectiveSize = signal.requestedSize * (1 - penalty);
        console.warn(
          `[RiskGuardian] High Latency (${signal.latencyProfile.endToEnd}ms) - Penalizing size by 25%`,
        );
      }

      const projectedLeverage = this.calculateProjectedLeverage(
        { ...signal, requestedSize: effectiveSize },
        currentPositions,
      );

      // 0d. PowerLaw Regime Gates & Continuous Throttling
      const plMetrics =
        this.powerLawMetrics.get(signal.symbol) ?? this.powerLawMetrics.get('BTCUSDT');
      if (plMetrics) {
        // Rule 1: Extreme Tail Risk Gating
        if (plMetrics.tailExponent < 2.0 && projectedLeverage > 5) {
          return {
            approved: false,
            reason: `TAIL_RISK_VETO: Extreme tail risk (α=${plMetrics.tailExponent.toFixed(
              2,
            )}) prohibits leverage > 5x`,
            riskMetrics: this.getRiskMetrics(currentPositions),
          };
        }

        // Rule 2: Volatility Cluster Gating
        if (plMetrics.volatilityCluster.state === 'expanding' && signal.phaseId === 'phase1') {
          return {
            approved: false,
            reason: `REGIME_VETO: Expanding volatility rejects Phase 1 scalps`,
            riskMetrics: this.getRiskMetrics(currentPositions),
          };
        }

        // Rule 3: Continuous Alpha Throttling
        // Apply size reduction based on heavy tails
        // Multiplier = Min(1.0, (Alpha - 1.0) / 2.0)
        // Alpha 3.0 -> 1.0 (No penalty)
        // Alpha 2.0 -> 0.5 (50% size detection)
        // Alpha 1.5 -> 0.25
        const alphaThrottle = this.getAlphaThrottle(plMetrics.tailExponent);
        if (alphaThrottle < 1.0 && signal.phaseId !== 'phase3') {
          effectiveSize = effectiveSize * alphaThrottle;
          console.warn(
            `[RiskGuardian] Alpha Throttling (α=${plMetrics.tailExponent.toFixed(
              2,
            )}) -> Scaling size by ${(alphaThrottle * 100).toFixed(0)}%`,
          );
        }
      }

      // Cost-Aware Veto (Expectancy Check)
      if (this.config.costVeto?.enabled) {
        const expectancy = this.checkExpectancy(signal, effectiveConfidence / 100);
        if (!expectancy.passed) {
          return {
            approved: false,
            reason: `COST_AWARE_VETO: ${expectancy.reason}`,
            riskMetrics: this.getRiskMetrics(currentPositions),
          };
        }
      }

      // Calculate correlation with existing positions
      const maxCorrelation = this.calculateMaxCorrelationWithPositions(signal, currentPositions);

      const riskMetrics: RiskMetrics = {
        currentLeverage,
        projectedLeverage,
        correlation: maxCorrelation,
        portfolioDelta,
        portfolioBeta,
      };

      // Requirement 3.5: Phase 3 hedge auto-approval
      if (this.isPhase3HedgeThatReducesDelta(signal, portfolioDelta)) {
        return {
          approved: true,
          reason: 'Phase 3 hedge approved: reduces global delta',
          adjustedSize: signal.requestedSize,
          riskMetrics,
        };
      }

      // Requirement 3.8: Check minimum stop distance
      const entryPrice = signal.entryPrice ?? this.getSignalPrice(signal);

      if (signal.stopLossPrice && entryPrice) {
        const volatility = signal.volatility ?? this.calculateVolatility(signal.symbol);
        const stopDistance = Math.abs(entryPrice - signal.stopLossPrice);
        const minDistance = volatility * this.config.minStopDistanceMultiplier;

        if (stopDistance < minDistance) {
          return {
            approved: false,
            reason: `Stop distance too tight: ${stopDistance.toFixed(2)} < ${minDistance.toFixed(
              2,
            )} (${this.config.minStopDistanceMultiplier}x ATR)`,
            riskMetrics,
          };
        }
      }

      // Requirement 3.9: Max Position Notional Check (Policy V1)
      if (this.config.maxPositionNotional > 0) {
        const currentPos = currentPositions.find((p) => p.symbol === signal.symbol);
        const currentSize = currentPos ? Math.abs(currentPos.size) : 0;
        let projectedSize = currentSize;

        // If same side (Long+Buy or Short+Sell), add size
        // If opposite side (Long+Sell or Short+Buy), subtract/net size
        // Note: signal.side is "BUY"/"SELL", currentPos.side is "LONG"/"SHORT"
        const isSameSide = currentPos
          ? (currentPos.side === 'LONG' && signal.side === 'BUY') ||
            (currentPos.side === 'SHORT' && signal.side === 'SELL')
          : true;

        if (isSameSide) {
          projectedSize = currentSize + effectiveSize;
        } else {
          projectedSize = Math.max(0, currentSize - effectiveSize);
        }

        if (projectedSize > this.config.maxPositionNotional) {
          return {
            approved: false,
            reason: `Max Position Notional Exceeded: ${projectedSize} > ${this.config.maxPositionNotional}`,
            riskMetrics,
          };
        }
      }

      // Requirement 3.3: Check leverage cap
      const govMultiplier = this.governanceEngine.getLeverageMultiplier();
      const maxLeverage = this.allocationEngine.getMaxLeverage(this.currentEquity) * govMultiplier;
      if (projectedLeverage > maxLeverage) {
        return {
          approved: false,
          reason: `Leverage cap exceeded: projected ${projectedLeverage.toFixed(
            2,
          )}x > max ${maxLeverage}x`,
          riskMetrics,
        };
      }

      // Requirement 3.7: High correlation check
      if (maxCorrelation > this.config.maxCorrelation) {
        if (this.correlationNotifier) {
          const affectedPositions = this.getCorrelatedPositions(signal, currentPositions);
          this.correlationNotifier
            .sendHighCorrelationWarning(
              maxCorrelation,
              this.config.maxCorrelation,
              affectedPositions,
            )
            .catch((error) => {
              console.error('Failed to send high correlation warning:', error);
            });
        }

        const hasCorrelatedSameDirection = this.hasCorrelatedSameDirectionPosition(
          signal,
          currentPositions,
        );

        if (hasCorrelatedSameDirection) {
          effectiveSize = effectiveSize * (1 - this.config.correlationPenalty);

          return {
            approved: true,
            reason: `High correlation (${maxCorrelation.toFixed(
              2,
            )}) with same direction: size reduced by ${this.config.correlationPenalty * 100}%`,
            adjustedSize: effectiveSize,
            riskMetrics,
          };
        }
      }

      const wasAdjusted = effectiveSize !== signal.requestedSize;

      return {
        approved: true,
        reason: wasAdjusted
          ? 'Signal approved with size adjustment: Risk/Latency/Alpha'
          : 'Signal approved: within risk limits',
        adjustedSize: effectiveSize,
        riskMetrics,
      };
    } catch (err: any) {
      console.error('[RiskGuardian] Risk check failed:', err);
      return {
        approved: false,
        reason: `RISK_CHECK_ERROR: ${err.message}`,
        riskMetrics: this.getRiskMetrics(currentPositions),
      };
    }
  }

  /**
   * Continuous Throttling function for Alpha
   */
  private getAlphaThrottle(alpha: number): number {
    // Hill function logic:
    // Alpha >= 3.0 -> 1.0 (Stable)
    // Alpha <= 1.5 -> 0.1 (Survival)
    // Linear interpolated between 1.5 and 3.0
    if (alpha >= 3.0) return 1.0;
    if (alpha <= 1.5) return 0.1;

    // y = mx + b
    // (1.5, 0.1) -> (3.0, 1.0)
    // m = (1.0 - 0.1) / (3.0 - 1.5) = 0.9 / 1.5 = 0.6
    // y - 0.1 = 0.6 * (x - 1.5)
    // y = 0.6x - 0.9 + 0.1 = 0.6x - 0.8

    return 0.6 * alpha - 0.8;
  }

  /**
   * Cost-Aware Expectancy Check
   */
  private checkExpectancy(
    signal: IntentSignal,
    pWin: number,
  ): { passed: boolean; reason?: string } {
    if (!signal.targetPrice || !signal.stopLossPrice || !signal.entryPrice) {
      // If we lack structure, we cannot calculate expectancy.
      // Fail open or closed? If cost veto enabled, safest to fail closed.
      return {
        passed: false,
        reason: 'Missing targets/stops for expectancy calc',
      };
    }

    const reward = Math.abs(signal.targetPrice - signal.entryPrice);
    const risk = Math.abs(signal.entryPrice - signal.stopLossPrice);

    // Expected Gross Profit = (P * Reward) - ((1-P) * Risk)
    const expectedGross = pWin * reward - (1 - pWin) * risk;

    // Estimated Cost
    // Fees + Slippage + Spread
    const feesBps = this.config.costVeto?.baseFeeBps ?? 6; // Taker (approx 3-5bps) + Spread (1-2bps)
    // Slippage estimate based on size? Ignore for now, stick to base.
    const costPerUnit = signal.entryPrice * (feesBps / 10000); // round trip implied in baseFeeBps? Taker buy + Taker sell = 10bps?
    // Let's assume baseFeeBps is total roundtrip cost estimate (e.g. 10bps)
    const totalCost = costPerUnit * 1.5; // Safety factor

    // Requirement: Expectancy > ratio * Cost
    const ratio = this.config.costVeto?.minExpectancyRatio ?? 2.0;

    if (expectedGross < totalCost * ratio) {
      return {
        passed: false,
        reason: `Expectancy too low (${expectedGross.toFixed(
          4,
        )} < ${ratio}x Cost ${totalCost.toFixed(4)})`,
      };
    }

    return { passed: true };
  }

  /**
   * Calculate current risk metrics for a set of positions
   */

  /**
   * Calculate portfolio delta (net directional exposure)
   * Positive = net long, Negative = net short
   *
   * @param positions - Array of current positions
   * @returns Net delta in USD
   */
  calculatePortfolioDelta(positions: Position[]): number {
    return positions.reduce((delta, pos) => {
      const positionDelta = pos.side === 'LONG' ? pos.size : -pos.size;
      return delta + positionDelta;
    }, 0);
  }

  /**
   * Calculate combined leverage across all positions
   * Combined Leverage = Total Notional / Equity
   *
   * @param positions - Array of current positions
   * @returns Combined leverage ratio
   */
  calculateCombinedLeverage(positions: Position[]): number {
    if (this.currentEquity <= 0) {
      return 0;
    }

    const totalNotional = positions.reduce((sum, pos) => sum + pos.size, 0);
    return totalNotional / this.currentEquity;
  }

  /**
   * Calculate projected leverage if a signal is executed
   *
   * @param signal - Intent signal to evaluate
   * @param currentPositions - Current open positions
   * @returns Projected leverage ratio
   */
  private calculateProjectedLeverage(signal: IntentSignal, currentPositions: Position[]): number {
    if (this.currentEquity <= 0) {
      return 0;
    }

    // Check if signal is for an existing position (same symbol)
    const existingPosition = currentPositions.find((p) => p.symbol === signal.symbol);

    let projectedNotional: number;

    if (existingPosition) {
      // If same direction, add to position
      // If opposite direction, reduce or flip position
      const existingSide = existingPosition.side === 'LONG' ? 'BUY' : 'SELL';

      if (signal.side === existingSide) {
        // Adding to position
        projectedNotional = currentPositions.reduce((sum, pos) => {
          if (pos.symbol === signal.symbol) {
            return sum + pos.size + signal.requestedSize;
          }
          return sum + pos.size;
        }, 0);
      } else {
        // Reducing or flipping position
        const netSize = Math.abs(existingPosition.size - signal.requestedSize);
        projectedNotional = currentPositions.reduce((sum, pos) => {
          if (pos.symbol === signal.symbol) {
            return sum + netSize;
          }
          return sum + pos.size;
        }, 0);
      }
    } else {
      // New position
      projectedNotional =
        currentPositions.reduce((sum, pos) => sum + pos.size, 0) + signal.requestedSize;
    }

    return projectedNotional / this.currentEquity;
  }

  /**
   * Calculate correlation between two assets using price history
   * Uses Pearson correlation coefficient
   *
   * @param assetA - First asset symbol
   * @param assetB - Second asset symbol
   * @returns Correlation coefficient (-1 to 1)
   */
  calculateCorrelation(assetA: string, assetB: string): number {
    // Check cache first
    const cacheKey = this.getCorrelationCacheKey(assetA, assetB);
    const cached = this.correlationCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.config.correlationUpdateInterval) {
      return cached.correlation;
    }

    const historyA = this.priceHistory.get(assetA) ?? [];
    const historyB = this.priceHistory.get(assetB) ?? [];

    if (historyA.length < 2 || historyB.length < 2) {
      // Insufficient data for strict correlation check - Fail Closed
      throw new Error(`Insufficient price history for correlation check: ${assetA} or ${assetB}`);
    }

    // Align timestamps and calculate returns
    const returnsA = this.calculateReturns(historyA);
    const returnsB = this.calculateReturns(historyB);

    // Need at least 2 data points for correlation
    const minLength = Math.min(returnsA.length, returnsB.length);
    if (minLength < 2) {
      return 0.5;
    }

    // Use the most recent aligned data
    const alignedA = returnsA.slice(-minLength);
    const alignedB = returnsB.slice(-minLength);

    const correlation = this.pearsonCorrelation(alignedA, alignedB);

    // Cache the result

    this.correlationCache.set(cacheKey, {
      correlation,
      timestamp: Date.now(),
    });

    return correlation;
  }

  /**
   * Get portfolio beta (correlation to BTC)
   * Beta measures how the portfolio moves relative to BTC
   *
   * @param positions - Current positions
   * @returns Portfolio beta coefficient
   */
  getPortfolioBeta(positions: Position[]): number {
    // Check cache
    if (
      this.portfolioBetaCache &&
      Date.now() - this.portfolioBetaCache.timestamp < this.config.betaUpdateInterval
    ) {
      return this.portfolioBetaCache.value;
    }

    if (positions.length === 0) {
      return 0;
    }

    const totalNotional = positions.reduce((sum, pos) => sum + pos.size, 0);
    if (totalNotional === 0) {
      return 0;
    }

    // Calculate weighted average beta

    let weightedBeta = 0;
    for (const pos of positions) {
      const weight = pos.size / totalNotional;
      const assetBeta = this.calculateCorrelation(pos.symbol, 'BTCUSDT');
      // Adjust for position direction
      const directionMultiplier = pos.side === 'LONG' ? 1 : -1;
      weightedBeta += weight * assetBeta * directionMultiplier;
    }

    // Cache the result

    this.portfolioBetaCache = {
      value: weightedBeta,
      timestamp: Date.now(),
    };

    return weightedBeta;
  }

  /**
   * Update price history for an asset
   *
   * @param symbol - Asset symbol
   * @param price - Current price
   * @param timestamp - Price timestamp
   */
  updatePriceHistory(symbol: string, price: number, timestamp?: number): void {
    const entry: PriceHistoryEntry = {
      symbol,
      price,
      timestamp: timestamp ?? Date.now(),
    };

    const history = this.priceHistory.get(symbol) ?? [];

    history.push(entry);

    // Keep only last 100 entries (for correlation calculation)
    if (history.length > 100) {
      history.shift();
    }

    this.priceHistory.set(symbol, history);

    // Feed price to ChangePointDetector (using BTC or Reference, or maybe all? defaulting to BTC typically)
    // For now, we only drive Regime from "BTCUSDT" or "ETHUSDT" acting as market proxy.
    // If the symbol is one of our reference assets:
    const referenceAssets = ['BTCUSDT', 'BTC-USD', 'ETHUSDT', 'ETH-USD'];
    if (referenceAssets.includes(symbol)) {
      const detection = this.changePointDetector.update(price, timestamp ?? Date.now());
      if (detection.regime !== this.currentRegime) {
        console.log(
          `RiskGuardian: Regime change detected for ${symbol}: ${this.currentRegime} -> ${detection.regime}`,
        );

        this.currentRegime = detection.regime;
      }
    }
  }

  /**
   * Clear correlation cache (for testing or forced recalculation)
   */
  clearCorrelationCache(): void {
    this.correlationCache.clear();

    this.portfolioBetaCache = null;
  }

  /**
   * Get current risk metrics snapshot
   *
   * @param positions - Current positions
   * @returns RiskMetrics object
   */
  getRiskMetrics(positions: Position[]): RiskMetrics {
    return {
      currentLeverage: this.calculateCombinedLeverage(positions),
      projectedLeverage: this.calculateCombinedLeverage(positions),
      correlation: this.getMaxCorrelationAcrossPositions(positions),
      portfolioDelta: this.calculatePortfolioDelta(positions),
      portfolioBeta: this.getPortfolioBeta(positions),
    };
  }

  /**
   * Get configuration
   */
  getConfig(): RiskGuardianConfig {
    return { ...this.config };
  }

  /**
   * Update configuration dynamically
   * @param newConfig - Partial configuration to update
   */
  updateConfig(newConfig: Partial<RiskGuardianConfig>): void {
    Object.assign(this.config, newConfig);
    console.log('[RiskGuardian] Configuration updated:', newConfig);
  }

  // ============ Private Helper Methods ============

  /**
   * Check if signal is a Phase 3 hedge that reduces global delta
   */
  private isPhase3HedgeThatReducesDelta(signal: IntentSignal, currentDelta: number): boolean {
    if (signal.phaseId !== 'phase3') {
      return false;
    }

    // Determine if signal reduces delta
    const signalDelta = signal.side === 'BUY' ? signal.requestedSize : -signal.requestedSize;
    const newDelta = currentDelta + signalDelta;

    // Signal reduces delta if it moves closer to zero
    return Math.abs(newDelta) < Math.abs(currentDelta);
  }

  /**
   * Calculate maximum correlation between signal and existing positions
   */
  private calculateMaxCorrelationWithPositions(
    signal: IntentSignal,
    positions: Position[],
  ): number {
    if (positions.length === 0) {
      return 0;
    }

    let maxCorrelation = 0;
    for (const pos of positions) {
      if (pos.symbol !== signal.symbol) {
        const correlation = Math.abs(this.calculateCorrelation(signal.symbol, pos.symbol));
        maxCorrelation = Math.max(maxCorrelation, correlation);
      }
    }

    // If same symbol exists, correlation is 1.0
    const sameSymbolExists = positions.some((p) => p.symbol === signal.symbol);
    if (sameSymbolExists) {
      maxCorrelation = 1.0;
    }

    return maxCorrelation;
  }

  /**
   * Check if there's a highly correlated position in the same direction
   */
  private hasCorrelatedSameDirectionPosition(signal: IntentSignal, positions: Position[]): boolean {
    const signalDirection = signal.side === 'BUY' ? 'LONG' : 'SHORT';

    for (const pos of positions) {
      // Same symbol, same direction
      if (pos.symbol === signal.symbol && pos.side === signalDirection) {
        return true;
      }

      // Different symbol but high correlation and same direction
      if (pos.symbol !== signal.symbol && pos.side === signalDirection) {
        const correlation = Math.abs(this.calculateCorrelation(signal.symbol, pos.symbol));
        if (correlation > this.config.maxCorrelation) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get maximum correlation across all position pairs
   */
  private getMaxCorrelationAcrossPositions(positions: Position[]): number {
    if (positions.length < 2) {
      return 0;
    }

    let maxCorrelation = 0;

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const correlation = Math.abs(
          this.calculateCorrelation(positions[i].symbol, positions[j].symbol),
        );
        maxCorrelation = Math.max(maxCorrelation, correlation);
      }
    }

    return maxCorrelation;
  }

  /**
   * Calculate returns from price history
   */
  private calculateReturns(history: PriceHistoryEntry[]): number[] {
    if (history.length < 2) {
      return [];
    }

    const returns: number[] = [];

    for (let i = 1; i < history.length; i++) {
      const prevPrice = history[i - 1].price;
      const currPrice = history[i].price;
      if (prevPrice > 0) {
        returns.push((currPrice - prevPrice) / prevPrice);
      }
    }

    return returns;
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) {
      return 0;
    }

    const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let numerator = 0;

    let denomX = 0;

    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    if (denominator === 0) {
      return 0;
    }

    return numerator / denominator;
  }

  /**
   * Generate cache key for correlation pair
   */
  private getCorrelationCacheKey(assetA: string, assetB: string): string {
    // Sort to ensure consistent key regardless of order
    const sorted = [assetA, assetB].sort();
    return `${sorted[0]}:${sorted[1]}`;
  }

  /**
   * Get list of positions that are correlated with the signal
   */
  private getCorrelatedPositions(signal: IntentSignal, positions: Position[]): string[] {
    const correlatedPositions: string[] = [];

    for (const pos of positions) {
      if (pos.symbol === signal.symbol) {
        correlatedPositions.push(pos.symbol);
      } else {
        const correlation = Math.abs(this.calculateCorrelation(signal.symbol, pos.symbol));
        if (correlation > this.config.maxCorrelation) {
          correlatedPositions.push(pos.symbol);
        }
      }
    }

    return correlatedPositions;
  }

  /**
   * Calculate Volatility (ATR-like or Standard Deviation) from price history
   * Using Simple Standard Deviation of returns for now as a proxy for volatility
   * if true ATR is not available.
   */
  private calculateVolatility(symbol: string): number {
    const history = this.priceHistory.get(symbol) ?? [];
    if (history.length < 10) {
      // Fallback if not enough data: assume 1% volatility of last price
      const lastPrice = history[history.length - 1]?.price ?? 1000;
      return lastPrice * 0.01;
    }

    const returns = this.calculateReturns(history);
    if (returns.length === 0) return 0;

    // Calculate Standard Deviation of returns
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualize or scale to price?
    // We want price-based volatility (e.g. $50 move).
    // StdDev is percentage. So Volatility = Price * StdDev
    const lastPrice = history[history.length - 1].price;
    return lastPrice * stdDev;
  }

  /**
   * Get estimated entry price from signal
   */
  private getSignalPrice(signal: IntentSignal): number {
    // IntentSignal doesn't have price, but we have priceHistory or we can infer
    // If signal.stopLossPrice is used, we need relative price.
    // Use last known price from history.
    const history = this.priceHistory.get(signal.symbol);
    if (history && history.length > 0) {
      return history[history.length - 1].price;
    }
    // Fallback?
    return signal.stopLossPrice
      ? signal.side === 'BUY'
        ? signal.stopLossPrice * 1.01
        : signal.stopLossPrice * 0.99
      : 0;
  }
}
