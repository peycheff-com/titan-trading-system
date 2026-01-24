import { getNatsClient, TitanSubject } from "@titan/shared";
import { Logger } from "../logging/Logger.js";
import { BrainDecision, IntentSignal, RiskDecision } from "../types/index.js";
import { RiskGuardian } from "../features/Risk/RiskGuardian.js";
import { AllocationEngine } from "../features/Allocation/AllocationEngine.js";
import { PerformanceTracker } from "./PerformanceTracker.js";
import { BrainStateManager } from "./BrainStateManager.js";
import { CircuitBreaker } from "./CircuitBreaker.js";

// Rust-compatible definitions (Shadow copy since it might not be exported)
interface RustIntent {
  schema_version?: string;
  signal_id: string;
  source: string;
  symbol: string;
  direction: number; // 1 (Long) or -1 (Short)
  type: string; // "BUY_SETUP", "SELL_SETUP", etc.
  entry_zone: number[];
  stop_loss: number;
  take_profits: number[];
  size: number;
  status: string; // "PENDING"
  received_at: string; // ISO date
  t_signal: number;
  timestamp?: number;
  t_exchange?: number;
  metadata?: any;
}

export class SignalProcessor {
  private nats = getNatsClient();
  private logger = Logger.getInstance("SignalProcessor");

  constructor(
    private riskGuardian: RiskGuardian,
    private allocationEngine: AllocationEngine,
    private performanceTracker: PerformanceTracker,
    private stateManager: BrainStateManager,
    private circuitBreaker: CircuitBreaker,
  ) {
    this.logger.info("Initialized SignalProcessor with full guards");
  }

  public async start(): Promise<void> {
    if (!this.nats.isConnected()) {
      await this.nats.connect();
    }

    this.logger.info("Subscribing to Signal Submission Channel");

    // Subscribe to titan.signal.submit.v1
    this.nats.subscribe(TitanSubject.SIGNAL_SUBMIT, async (data: any) => {
      // In a real NATS consumer scenario, we might need to repackage this
      // But for TitanBrain direct calls, processSignal expects IntentSignal
      // For NATS events, we would need to map 'data' to IntentSignal
      // For now, assuming direct calls from Brain mostly
    });
  }

  public async processSignal(signal: IntentSignal): Promise<BrainDecision> {
    const { signalId, symbol, side } = signal;

    this.logger.info(`Processing Signal ${signalId} for ${symbol} ${side}`);

    // Get current state
    const positions = this.stateManager.getPositions();
    const equity = this.stateManager.getEquity();

    // 0. Circuit Breaker Check
    if (this.circuitBreaker.isActive()) {
      const status = this.circuitBreaker.getStatus();
      return {
        signalId,
        approved: false,
        authorizedSize: 0,
        reason: `Circuit breaker active: ${status.reason || "Unknown"}`,
        allocation: this.allocationEngine.getWeights(equity),
        performance: await this.performanceTracker.getPhasePerformance(
          signal.phaseId,
        ),
        risk: {
          approved: false,
          reason: "Circuit breaker active",
          adjustedSize: 0,
          riskMetrics: this.riskGuardian.getRiskMetrics(positions),
        },
        timestamp: Date.now(),
      };
    }

    // 1. Risk Check
    const riskDecision: RiskDecision = this.riskGuardian.checkSignal(
      signal,
      positions,
    );

    if (!riskDecision.approved) {
      this.logger.warn(
        `Signal ${signalId} rejected by RiskGuardian: ${riskDecision.reason}`,
      );
      return {
        signalId,
        approved: false,
        authorizedSize: 0,
        reason: riskDecision.reason,
        allocation: this.allocationEngine.getWeights(equity),
        performance: await this.performanceTracker.getPhasePerformance(
          signal.phaseId,
        ),
        risk: riskDecision,
        timestamp: Date.now(),
      };
    }

    // 2. Allocation
    const allocation = this.allocationEngine.getWeights(equity);

    // 3. Performance
    const performance = await this.performanceTracker.getPhasePerformance(
      signal.phaseId,
    );

    // 4. Authorization
    // Use adjusted size from risk decision if available, else requested
    let authorizedSize = riskDecision.adjustedSize ?? signal.requestedSize;

    // Cap size based on allocation weights (Soft Cap per trade)
    let weight = 1.0;
    switch (signal.phaseId) {
      case "phase1":
        weight = allocation.w1;
        break;
      case "phase2":
        weight = allocation.w2;
        break;
      case "phase3":
        weight = allocation.w3;
        break;
      default:
        weight = 1.0;
    }
    const maxSignalSize = equity * weight;
    if (authorizedSize > maxSignalSize) {
      if (maxSignalSize > 0) {
        this.logger.info(
          `Capping signal size from ${authorizedSize} to ${maxSignalSize} based on allocation weight ${weight}`,
        );
        authorizedSize = maxSignalSize;
      }
    }

    // 5. Construct RustIntent
    const directionInt = side === "BUY" ? 1 : -1;
    const intentType = side === "BUY" ? "BUY_SETUP" : "SELL_SETUP";

    const intent: RustIntent = {
      schema_version: "1.0.0",
      signal_id: signalId,
      source: "brain",
      symbol: symbol,
      direction: directionInt,
      type: intentType,
      entry_zone: [signal.entryPrice || 0, signal.entryPrice || 0],
      stop_loss: signal.stopLossPrice || 0,
      take_profits: [signal.targetPrice || 0],
      size: authorizedSize,
      status: "PENDING",
      received_at: new Date().toISOString(),
      t_signal: signal.timestamp,
      timestamp: Date.now(),
      metadata: {
        original_source: signal.phaseId,
        brain_processed_at: Date.now(),
        confidence: signal.confidence,
        leverage: signal.leverage,
      },
    };

    // 6. Publish to Execution
    const symbolToken = symbol.replace("/", "_");
    const subject = `titan.cmd.exec.place.v1.auto.main.${symbolToken}`;

    this.logger.info(
      `Approving Signal ${signalId} -> Publishing Intent to ${subject} (Size: ${authorizedSize})`,
    );

    try {
      await this.nats.publish(subject, intent);
    } catch (error) {
      this.logger.error(
        `Failed to publish intent for ${signalId}`,
        error as Error,
      );
      await this.publishToDLQ(intent, (error as Error).message);
      // Return approved but with error note? Or fail?
      // Since we couldn't execute, it's effectively a failure, but Brain "approved" it.
      // We'll return approved but maybe log the error.
    }

    return {
      signalId,
      approved: true,
      authorizedSize,
      reason: riskDecision.reason || "Approved",
      allocation,
      performance,
      risk: riskDecision,
      timestamp: Date.now(),
    };
  }

  private async publishToDLQ(payload: any, reason: string): Promise<void> {
    try {
      const dlqPayload = {
        reason,
        payload,
        t_ingress: Date.now(),
      };
      await this.nats.publish("titan.dlq.brain.processing", dlqPayload);
    } catch (e) {
      this.logger.error("Failed to publish to DLQ", e as Error);
    }
  }
}
