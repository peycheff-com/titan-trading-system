import {
  createIntentMessage,
  getNatsClient,
  TitanSubject,
} from "@titan/shared";
import { canonicalRiskHash } from "../config/index.js";
import { Subscription } from "nats";
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

  private subscription: Subscription | null = null;

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
    if (this.subscription) {
      this.logger.warn("SignalProcessor already started");
      return;
    }

    if (!this.nats.isConnected()) {
      await this.nats.connect();
    }

    this.logger.info("Subscribing to Signal Submission Channel");

    // Subscribe to titan.signal.submit.v1
    this.subscription = this.nats.subscribe(
      TitanSubject.SIGNAL_SUBMIT,
      async (data: any) => {
        try {
          // Handle envelope or raw payload
          const signal = data.payload || data;

          // Ensure proper ID mapping if needed (NatsClient uses signal_id, IntentSignal expects signalId)
          // We might need a mapper here.
          const mappedSignal: IntentSignal = {
            signalId: signal.signal_id || signal.signalId,
            symbol: signal.symbol,
            side: signal.direction === 1
              ? "BUY"
              : signal.direction === -1
              ? "SELL"
              : signal.side,
            type: signal.type || "MARKET",
            confidence: signal.confidence || 1.0,
            phaseId: signal.source === "scavenger"
              ? "phase1"
              : signal.phase_id || "phase1",
            requestedSize: signal.size || 0,
            leverage: signal.leverage || 1,
            timestamp: signal.timestamp || Date.now(),
            entryPrice: signal.entry_zone?.[0] || signal.entryPrice,
            stopLossPrice: signal.stop_loss || signal.stopLossPrice,
            takeProfitPrice: signal.take_profits?.[0] || signal.takeProfitPrice, // Optional mapping
            // Spread other props just in case
            ...signal,
          };

          this.logger.info(
            `📨 Received Signal from NATS: ${mappedSignal.signalId} (${mappedSignal.phaseId})`,
          );

          await this.processSignal(mappedSignal);
        } catch (err) {
          this.logger.error("Failed to process NATS signal", err as Error);
        }
      },
    );
  }

  public async stop(): Promise<void> {
    if (this.subscription) {
      this.logger.info("Stopping SignalProcessor (Unsubscribing)");
      this.subscription.unsubscribe();
      this.subscription = null;
    }
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

    // 0.5 System Armed Check (P2)
    if (!this.stateManager.isArmed()) {
      const reason = "System Disarmed (Operator Action)";
      this.logger.warn(`Signal ${signalId} rejected: ${reason}`);
      return {
        signalId,
        approved: false,
        authorizedSize: 0,
        reason,
        allocation: this.allocationEngine.getWeights(equity),
        performance: await this.performanceTracker.getPhasePerformance(
          signal.phaseId,
        ),
        risk: {
          approved: false,
          reason,
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

    // 5. Construct Intent Envelope
    const directionInt = side === "BUY" ? 1 : -1;
    const intentType = side === "BUY" ? "BUY_SETUP" : "SELL_SETUP";

    const payload = {
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
      policy_hash: canonicalRiskHash, // P0 Enforcement
      metadata: {
        original_source: signal.phaseId,
        brain_processed_at: Date.now(),
        confidence: signal.confidence,
        leverage: signal.leverage,
      },
      child_fills: [],
    };

    // Use shared factory to create signed envelope
    const envelope = createIntentMessage(payload as any, "brain", signalId);

    // 6. Publish to Execution
    const symbolToken = symbol.replace("/", "_");
    const subject = `titan.cmd.exec.place.v1.auto.main.${symbolToken}`;

    this.logger.info(
      `Approving Signal ${signalId} -> Publishing Envelope to ${subject} (Size: ${authorizedSize}, Hash: ${canonicalRiskHash})`,
    );

    try {
      await this.nats.publish(subject, envelope);
    } catch (error) {
      this.logger.error(
        `Failed to publish intent for ${signalId}`,
        error as Error,
      );
      await this.publishToDLQ(envelope, (error as Error).message);
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
