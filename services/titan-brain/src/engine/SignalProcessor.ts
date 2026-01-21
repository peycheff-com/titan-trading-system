import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../logging/Logger.js';
import {
  AllocationVector,
  BrainDecision,
  IntentSignal,
  PhaseId,
  RiskDecision,
} from '../types/index.js';
import { EventType, TitanEvent } from '../events/EventTypes.js';
import { CircuitBreaker } from './CircuitBreaker.js';
import { ActiveInferenceEngine } from './ActiveInferenceEngine.js';
import { TradeGate } from './TradeGate.js';
import { PerformanceTracker } from './PerformanceTracker.js';
import { RiskGuardian } from './RiskGuardian.js';
import { AllocationEngine } from './AllocationEngine.js';
import { GovernanceEngine } from './GovernanceEngine.js';
import { EventStore } from '../persistence/EventStore.js';
import { BrainStateManager } from './BrainStateManager.js';
import { ManualOverrideService } from './ManualOverrideService.js';

const logger = Logger.getInstance('signal-processor');

export class SignalProcessor {
  constructor(
    private readonly circuitBreaker: CircuitBreaker,
    private readonly activeInferenceEngine: ActiveInferenceEngine,
    private readonly tradeGate: TradeGate,
    private readonly performanceTracker: PerformanceTracker,
    private readonly riskGuardian: RiskGuardian,
    private readonly allocationEngine: AllocationEngine,
    private readonly governanceEngine: GovernanceEngine,
    private readonly stateManager: BrainStateManager,
    private readonly eventStore: EventStore | null,
    private readonly manualOverrideService: ManualOverrideService | null,
  ) {}

  /**
   * Process an intent signal through the full pipeline
   * Requirement 7.5: Maximum latency of 100ms
   *
   * Pipeline:
   * 1. Check circuit breaker
   * 2. Get allocation weights
   * 3. Apply performance modifiers
   * 4. Check risk constraints
   * 5. Calculate authorized size
   * 6. Forward to execution or veto
   *
   * @param signal - Intent signal from a phase
   * @returns BrainDecision with approval status
   */
  async processSignal(signal: IntentSignal): Promise<BrainDecision> {
    const startTime = Date.now();
    const timestamp = startTime;

    // Emit INTENT_CREATED
    if (this.eventStore) {
      await this.eventStore
        .append({
          id: uuidv4(),
          type: EventType.INTENT_CREATED,
          aggregateId: signal.signalId,
          payload: signal,
          metadata: {
            traceId: signal.signalId, // Using signalId as traceId for now if not present
            version: 1,
            timestamp: new Date(timestamp),
          },
        })
        .catch((err) => logger.error('Failed to emit INTENT_CREATED', err));
    }

    // Check circuit breaker first
    if (this.circuitBreaker.isActive()) {
      const decision = this.createVetoDecision(
        signal,
        'Circuit breaker active: all signals rejected',
        timestamp,
      );
      this.stateManager.addDecision(decision);
      return decision;
    }

    // Check Active Inference (Cortisol Level)
    // Requirement 7.2: Freeze trading if market surprise is too high
    const cortisol = this.activeInferenceEngine.getCortisol();
    const FREEZE_THRESHOLD = 0.8; // Configurable?

    if (cortisol > FREEZE_THRESHOLD) {
      const decision = this.createVetoDecision(
        signal,
        `High Cortisol/Surprise Level (${cortisol.toFixed(
          2,
        )} > ${FREEZE_THRESHOLD}): Market Freeze`,
        timestamp,
      );
      this.stateManager.addDecision(decision);
      return decision;
    }

    // Check Trade Gate (Cost/Edge Viability)
    // Requirement: Positive Expectancy > Friction
    // Using TradeGate (imported/injected) to enforce cost model hard-stop.
    const viability = this.tradeGate.checkViability(signal);
    if (!viability.accepted) {
      const decision = this.createVetoDecision(
        signal,
        `TradeGate Rejection: ${viability.reason}`,
        timestamp,
      );
      this.stateManager.addDecision(decision);
      return decision;
    }

    // Check breaker conditions with current state
    const currentEquity = this.stateManager.getEquity();
    const currentPositions = this.stateManager.getPositions();
    const dailyStartEquity = this.stateManager.getDailyStartEquity();
    const recentTrades = this.stateManager.getRecentTrades();

    const breakerStatus = this.circuitBreaker.checkConditions({
      equity: currentEquity,
      positions: currentPositions,
      dailyStartEquity: dailyStartEquity,
      recentTrades: recentTrades,
    });

    if (breakerStatus.active) {
      const decision = this.createVetoDecision(
        signal,
        `Circuit breaker triggered: ${breakerStatus.reason}`,
        timestamp,
      );
      this.stateManager.addDecision(decision);
      return decision;
    }

    // Get allocation weights (with manual override if active)
    const allocation = this.getAllocation();

    // Get performance modifier for the phase
    const performance = await this.performanceTracker.getPhasePerformance(signal.phaseId);

    // Calculate base allocation for this phase
    const phaseWeight = this.getPhaseWeight(signal.phaseId, allocation);
    const adjustedWeight = phaseWeight * performance.modifier;

    // Calculate max position size based on allocation
    // Requirement 1.7: Cap position size at Equity * Phase_Weight
    const maxPositionSize = currentEquity * adjustedWeight;

    // Check risk constraints
    const riskDecision = await this.riskGuardian.checkSignal(signal, currentPositions);

    // Determine final authorized size
    let authorizedSize: number;
    let approved: boolean;
    let reason: string;

    if (!riskDecision.approved) {
      // Risk veto
      approved = false;
      authorizedSize = 0;
      reason = riskDecision.reason;
    } else {
      // Apply all constraints
      const riskAdjustedSize = riskDecision.adjustedSize ?? signal.requestedSize;
      authorizedSize = Math.min(signal.requestedSize, maxPositionSize, riskAdjustedSize);

      // Requirement 1.7: Position size consistency
      if (authorizedSize <= 0) {
        approved = false;
        authorizedSize = 0;
        reason = 'Authorized size is zero after applying constraints';
      } else {
        approved = true;
        reason = this.buildApprovalReason(
          signal.requestedSize,
          authorizedSize,
          maxPositionSize,
          riskDecision,
        );
      }
    }

    const decision: BrainDecision = {
      signalId: signal.signalId,
      approved,
      authorizedSize,
      reason,
      allocation,
      performance,
      risk: riskDecision,
      timestamp,
      context: {
        signal,
        marketState: {
          price: this.riskGuardian.getLatestPrice(signal.symbol) ?? signal.entryPrice,
          volatility: signal.volatility,
          regime: this.riskGuardian.getRegimeState(),
        },
        riskState: riskDecision.riskMetrics,
        governance: {
          defcon: this.governanceEngine.getDefconLevel().toString(),
        },
      },
    };

    this.stateManager.addDecision(decision);
    this.stateManager.updateSignalStats(signal.phaseId, approved);

    return decision;
  }

  /**
   * Get current allocation weights (checking overrides)
   */
  private getAllocation(): AllocationVector {
    // Check manual override
    if (this.manualOverrideService) {
      const override = this.manualOverrideService.getCurrentOverride();
      if (override) {
        return override.overrideAllocation;
      }
    }

    // Default: use allocation engine with current equity
    return this.allocationEngine.getWeights(this.stateManager.getEquity());
  }

  /**
   * Create a veto decision
   */
  private createVetoDecision(
    signal: IntentSignal,
    reason: string,
    timestamp: number,
  ): BrainDecision {
    const allocation = this.allocationEngine.getWeights(this.stateManager.getEquity());
    const riskMetrics = this.riskGuardian.getRiskMetrics(this.stateManager.getPositions());

    return {
      signalId: signal.signalId,
      approved: false,
      authorizedSize: 0,
      reason,
      allocation,
      performance: {
        phaseId: signal.phaseId,
        sharpeRatio: 0,
        totalPnL: 0,
        tradeCount: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        modifier: 1.0,
      },
      risk: {
        approved: false,
        reason,
        riskMetrics,
      },
      timestamp,
      context: {
        signal,
        marketState: {
          price: this.riskGuardian.getLatestPrice(signal.symbol) ?? signal.entryPrice,
          volatility: signal.volatility,
          regime: this.riskGuardian.getRegimeState(),
        },
        riskState: riskMetrics,
        governance: {
          defcon: this.governanceEngine.getDefconLevel().toString(),
        },
      },
    };
  }

  /**
   * Build approval reason string
   */
  private buildApprovalReason(
    requestedSize: number,
    authorizedSize: number,
    maxPositionSize: number,
    riskDecision: RiskDecision,
  ): string {
    const parts: string[] = ['Signal approved'];

    if (authorizedSize < requestedSize) {
      const reductions: string[] = [];

      if (authorizedSize <= maxPositionSize && requestedSize > maxPositionSize) {
        reductions.push(`allocation cap (${maxPositionSize.toFixed(2)})`);
      }

      if (riskDecision.adjustedSize && riskDecision.adjustedSize < requestedSize) {
        reductions.push(`risk adjustment`);
      }

      if (reductions.length > 0) {
        parts.push(`with size reduction due to ${reductions.join(', ')}`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Get phase weight from allocation vector
   */
  private getPhaseWeight(phaseId: PhaseId, allocation: AllocationVector): number {
    switch (phaseId) {
      case 'phase1':
        return allocation.w1;
      case 'phase2':
        return allocation.w2;
      case 'phase3':
        return allocation.w3;
      default:
        return 0;
    }
  }
}
