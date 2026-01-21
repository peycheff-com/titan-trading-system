import {
    ExecutionClient,
    getNatsClient,
    IntentSignal,
    PhaseBudget,
    TitanSubject,
} from "@titan/shared";
import { Logger } from "../../logging/Logger.js";
import { ConfigManager, TrapConfig } from "../../config/ConfigManager.js";
import { EventEmitter } from "../../events/EventEmitter.js";
import { BybitPerpsClient } from "../../exchanges/BybitPerpsClient.js";
import { TrapStateManager } from "./TrapStateManager.js";
import { PositionSizeCalculator } from "../../calculators/PositionSizeCalculator.js";
import { VelocityCalculator } from "../../calculators/VelocityCalculator.js";
import { CVDCalculator } from "../../calculators/CVDCalculator.js";
import { LeadLagDetector } from "../../calculators/LeadLagDetector.js";
import { Tripwire } from "../../types/index.js";

interface TrapExecutorDependencies {
    logger: Logger;
    config: ConfigManager;
    eventEmitter: EventEmitter;
    bybitClient: BybitPerpsClient | null;
    stateManager: TrapStateManager;
    executionClient: ExecutionClient;
    positionSizeCalculator: PositionSizeCalculator;
    velocityCalculator: VelocityCalculator;
    cvdCalculator: CVDCalculator;
    leadLagDetector: LeadLagDetector;
}

/**
 * TrapExecutor (The Bite)
 *
 * Handles execution logic, position sizing, and communicating with the Execution Service.
 */
export class TrapExecutor {
    private logger: Logger;
    private config: ConfigManager;
    private eventEmitter: EventEmitter;
    private bybitClient: BybitPerpsClient | null;
    private stateManager: TrapStateManager;
    private executionClient: ExecutionClient;

    private positionSizeCalculator: PositionSizeCalculator;
    private velocityCalculator: VelocityCalculator;
    private cvdCalculator: CVDCalculator;
    private leadLagDetector: LeadLagDetector;

    private cachedEquity: number = 0;

    constructor(dependencies: TrapExecutorDependencies) {
        this.logger = dependencies.logger;
        this.config = dependencies.config;
        this.eventEmitter = dependencies.eventEmitter;
        this.bybitClient = dependencies.bybitClient;
        this.stateManager = dependencies.stateManager;
        this.executionClient = dependencies.executionClient;
        this.positionSizeCalculator = dependencies.positionSizeCalculator;
        this.velocityCalculator = dependencies.velocityCalculator;
        this.cvdCalculator = dependencies.cvdCalculator;
        this.leadLagDetector = dependencies.leadLagDetector;

        // Listen to budget updates
        this.setupBudgetListener();
    }

    getCachedEquity(): number {
        return this.cachedEquity;
    }

    /**
     * Setup Budget Listener (Truth Layer Integration)
     */
    private async setupBudgetListener(): Promise<void> {
        const nats = getNatsClient();
        if (!nats.isConnected()) {
            try {
                await nats.connect();
            } catch (e) {
                this.logger.error(
                    "Failed to connect NATS for Budget Listener",
                    e as Error,
                    undefined,
                    {
                        error: e,
                    },
                );
            }
        }

        nats.subscribe<PhaseBudget>(
            TitanSubject.EVT_BUDGET_UPDATE,
            (budget: PhaseBudget) => {
                if (budget.phaseId === "phase1") {
                    this.cachedEquity = budget.maxNotional;
                    if (Math.random() < 0.05) {
                        this.logger.info(
                            `💰 Budget Updated: $${
                                this.cachedEquity.toFixed(2)
                            } (State: ${budget.state})`,
                        );
                    }
                }
            },
        );

        this.logger.info("✅ Subscribed to Budget Updates");
    }

    /**
     * EXECUTION LAYER (The Bite)
     */
    async fire(
        trap: Tripwire,
        microCVD?: number,
        burstVolume?: number,
    ): Promise<void> {
        let signalId: string | undefined;

        try {
            // 0. COOLDOWN CHECK (Anti-Gaming)
            const lastActive = this.stateManager.getLastActivationTime(
                trap.symbol,
            );
            if (Date.now() - lastActive < 1000) {
                this.logger.info(
                    `   ⏳ Cooldown active for ${trap.symbol}, skipping...`,
                );
                return;
            }

            // IDEMPOTENCY CHECK
            if (trap.activated) {
                this.logger.warn(`⚠️ Trap already activated: ${trap.symbol}`);
                return;
            }

            // COOLDOWN CHECK (5 mins)
            const timeSinceActivation = Date.now() - (trap.activatedAt || 0);
            if (trap.activatedAt && timeSinceActivation < 300000) {
                this.logger.warn(
                    `⚠️ Trap cooldown: ${trap.symbol} (${
                        Math.floor(
                            timeSinceActivation / 1000,
                        )
                    }s ago)`,
                );
                return;
            }

            // --- MICRO-CVD VALIDATION ---
            if (
                microCVD !== undefined &&
                burstVolume !== undefined &&
                burstVolume > 0
            ) {
                const isCVDAligned =
                    (trap.direction === "LONG" && microCVD > 0) ||
                    (trap.direction === "SHORT" && microCVD < 0);

                if (!isCVDAligned) {
                    this.logger.warn(
                        `🛑 MICRO-CVD VETO: Volume flow opposes trap. Direction: ${trap.direction}, CVD: ${
                            microCVD.toFixed(4)
                        }`,
                    );
                    return;
                }

                const directionalRatio = Math.abs(microCVD) / burstVolume;
                if (directionalRatio < 0.3) {
                    this.logger.warn(
                        `🛑 BURST QUALITY VETO: Low directional conviction. Ratio: ${
                            directionalRatio.toFixed(
                                2,
                            )
                        } < 0.3. (CVD: ${microCVD.toFixed(4)} / Vol: ${
                            burstVolume.toFixed(
                                4,
                            )
                        })`,
                    );
                    return;
                }

                this.logger.info(
                    `✅ MICRO-CVD CONFIRMED: ${
                        microCVD.toFixed(4)
                    } aligns with ${trap.direction} (Quality: ${
                        directionalRatio.toFixed(2)
                    })`,
                );
            }

            // Mark trap as activated
            trap.activated = true;
            trap.activatedAt = Date.now();
            this.stateManager.setLastActivationTime(trap.symbol, Date.now());

            this.logger.info(`🔥 FIRING TRAP: ${trap.symbol} ${trap.trapType}`);

            // --- CVD FILTER CHECK (Macro) ---
            const cvd = await this.cvdCalculator.calcCVD(trap.symbol, 60);
            const isCounterFlow = (trap.direction === "LONG" && cvd < 0) ||
                (trap.direction === "SHORT" && cvd > 0);

            if (!isCounterFlow) {
                this.logger.warn(
                    `⚠️ MACRO CVD INFO: Trend following detected (CVD: ${cvd}).`,
                );
            } else {
                this.logger.info(
                    `✅ MACRO CVD INFO: Counter-flow detected (CVD: ${cvd})`,
                );
            }

            // --- ACCELERATION CHECK ---
            const acceleration = this.velocityCalculator.getAcceleration(
                trap.symbol,
            );
            if (acceleration > 0) {
                this.logger.warn(
                    `🛑 KNIFE-CATCH VETO: Price is accelerating (${
                        acceleration.toFixed(
                            4,
                        )
                    }). Waiting for deceleration.`,
                );
                return;
            }
            this.logger.info(
                `✅ ACCELERATION CHECK: Safe (Acc: ${acceleration.toFixed(4)})`,
            );

            // --- TREND FILTER (ADX) ---
            if (trap.adx && trap.adx > 25) {
                const isFadingTrend =
                    (trap.direction === "LONG" && trap.trend === "DOWN") ||
                    (trap.direction === "SHORT" && trap.trend === "UP");

                if (isFadingTrend) {
                    this.logger.warn(
                        `🛑 TREND VETO: Strong Trend (ADX: ${
                            trap.adx.toFixed(
                                2,
                            )
                        }) is against us. Aborting fade.`,
                    );
                    return;
                }
            }

            // Calculate price and velocity
            const bybitPrice = this.bybitClient
                ? await this.bybitClient.getCurrentPrice(trap.symbol)
                : trap.triggerPrice;
            const velocity = this.velocityCalculator.calcVelocity(trap.symbol);

            // --- LEAD/LAG CHECK ---
            const leaderStatus = this.leadLagDetector.getLeader(trap.symbol);
            this.logger.info(`   🏁 Lead/Lag Status: ${leaderStatus} leads`);

            let maxSlippageBps = 50;
            if (leaderStatus === "BYBIT") {
                maxSlippageBps = 30;
                this.logger.warn(
                    `   ⚠️ Perps Leading: Tightening slippage to 30bps`,
                );
            }

            // --- DYNAMIC VELOCITY THRESHOLDS ---
            const config = this.config.getConfig();
            let extremeVelocity = config.extremeVelocityThreshold || 0.005;
            let moderateVelocity = config.moderateVelocityThreshold || 0.001;

            if (trap.volatilityMetrics?.atr) {
                if (trap.volatilityMetrics.regime === "HIGH_VOL") {
                    extremeVelocity *= 1.5;
                    moderateVelocity *= 1.5;
                    this.logger.info(
                        `   🌊 High Volatility Regime: Scaling velocity thresholds x1.5`,
                    );
                } else if (trap.volatilityMetrics.regime === "LOW_VOL") {
                    extremeVelocity *= 0.8;
                    moderateVelocity *= 0.8;
                    this.logger.info(
                        `   🧊 Low Volatility Regime: Scaling velocity thresholds x0.8`,
                    );
                }
            }

            // Determine order type
            let orderType: "MARKET" | "LIMIT";
            let limitPrice: number | undefined;
            const aggressiveMarkup = config.aggressiveLimitMarkup || 0.002;

            if (velocity > extremeVelocity) {
                orderType = "MARKET";
                this.logger.info(
                    `   🚀 Using MARKET order (velocity: ${
                        (velocity * 100).toFixed(
                            2,
                        )
                    }% > ${extremeVelocity * 100}%)`,
                );
            } else if (velocity > moderateVelocity) {
                orderType = "LIMIT";
                limitPrice = trap.direction === "LONG"
                    ? bybitPrice * (1 + aggressiveMarkup)
                    : bybitPrice * (1 - aggressiveMarkup);
                this.logger.info(
                    `   ⚡ Using AGGRESSIVE LIMIT at ${
                        limitPrice.toFixed(
                            2,
                        )
                    } (velocity: ${(velocity * 100).toFixed(2)}%)`,
                );
            } else {
                orderType = "LIMIT";
                limitPrice = trap.direction === "LONG"
                    ? bybitPrice * 1.0001
                    : bybitPrice * 0.9999;
                this.logger.info(
                    `   📍 Using LIMIT at ${limitPrice.toFixed(2)} (velocity: ${
                        (
                            velocity * 100
                        ).toFixed(2)
                    }%)`,
                );
            }

            // Calculate position size
            const positionSize = PositionSizeCalculator.calcPositionSize({
                equity: this.cachedEquity,
                confidence: trap.confidence,
                leverage: trap.leverage,
                stopLossPercent: config.stopLossPercent || 0.01,
                targetPercent: config.targetPercent || 0.03,
                maxPositionSizePercent: config.maxPositionSizePercent || 0.5,
            });

            // Adaptive Sizing
            const volMultiplier =
                trap.volatilityMetrics?.positionSizeMultiplier || 1;
            const adjustedPositionSize = positionSize * volMultiplier;

            if (volMultiplier !== 1) {
                this.logger.info(
                    `   📉 Volatility Adjustment: Size scaled by ${
                        volMultiplier.toFixed(
                            2,
                        )
                    }x -> ${adjustedPositionSize.toFixed(4)}`,
                );
            }

            // Stop Loss & Target
            const stopLossPercent = config.stopLossPercent || 0.01;
            const targetPercent = config.targetPercent || 0.03;

            const stopLoss = trap.stopLoss ||
                (trap.direction === "LONG"
                    ? bybitPrice * (1 - stopLossPercent)
                    : bybitPrice * (1 + stopLossPercent));

            const target = trap.targetPrice ||
                (trap.direction === "LONG"
                    ? bybitPrice * (1 + targetPercent)
                    : bybitPrice * (1 - targetPercent));

            // Create Intent Signal
            const intentSignal: IntentSignal = {
                signal_id: `scavenger-${trap.symbol}-${Date.now()}`,
                source: "scavenger",
                symbol: trap.symbol,
                direction: trap.direction,
                entry_zone: {
                    min: limitPrice ? limitPrice * 0.999 : bybitPrice * 0.999,
                    max: limitPrice ? limitPrice * 1.001 : bybitPrice * 1.001,
                },
                stop_loss: stopLoss,
                take_profits: [target],
                confidence: trap.confidence,
                leverage: trap.leverage,
                position_size: positionSize,
                velocity,
                trap_type: trap.trapType,
                max_slippage_bps: maxSlippageBps,
                timestamp: Date.now(),
            };

            // Ghost Mode
            if (config.ghostMode) {
                this.logger.info(
                    `👻 GHOST MODE ACTIVE: Skipping IPC execution for ${trap.symbol}`,
                );
                return;
            }

            // EXECUTE
            signalId = intentSignal.signal_id;
            const ipcStartTime = Date.now();

            try {
                if (!this.executionClient.isConnected()) {
                    throw new Error("IPC_NOT_CONNECTED");
                }

                const prepareResult = await this.executionClient.sendPrepare(
                    intentSignal,
                );
                if (prepareResult.rejected) {
                    throw new Error(
                        `PREPARE_REJECTED: ${prepareResult.reason}`,
                    );
                }

                this.logger.info(`   ✅ PREPARE acknowledged`, signalId);

                // Wait 100ms
                await new Promise((resolve) => setTimeout(resolve, 100));

                // Validation check delegated to Detector? No, Executor doesn't have Tick access.
                // The original code called isTrapStillValid(trap) here.
                // isTrapStillValid used values from VelocityCalculator (last price) and VolumeCounters (from map).
                // Since we have StateManager and VelocityCalculator, we can implement it here or inject a validator.
                // Let's implement isTrapStillValid here or moving it to Detector and calling it?
                // Detector owns "onBinanceTick", but TrapExecutor owns "fire".
                // It's cleaner if TrapExecutor calls a validator.
                // Or we replicate isTrapStillValid logic here since we have access to StateManager (volumeCounters) and VelocityCalculator (lastPrice).

                if (this.isTrapStillValid(trap)) {
                    // CONFIRM
                    await this.executionClient.sendConfirm(signalId);
                    this.stateManager.resetFailedAttempts(trap.symbol);

                    this.logger.info(
                        `✅ Trap execution complete: ${trap.symbol}`,
                        signalId,
                    );

                    this.eventEmitter.emit("EXECUTION_COMPLETE", {
                        signal_id: signalId,
                        symbol: trap.symbol,
                        trapType: trap.trapType,
                        fillPrice: bybitPrice, // Approximation if we don't capture confirm result here specifically
                    });
                } else {
                    // ABORT
                    await this.executionClient.sendAbort(signalId);
                    trap.activated = false;
                    trap.activatedAt = undefined;

                    this.eventEmitter.emit("TRAP_ABORTED", {
                        signal_id: signalId,
                        symbol: trap.symbol,
                        reason: "trap_invalidated",
                    });

                    this.handleFailure(trap.symbol);
                }
            } catch (ipcError) {
                // Fallback
                const errorMessage = ipcError instanceof Error
                    ? ipcError.message
                    : "Unknown IPC error";
                this.logger.warn(
                    `⚠️ IPC failed (${errorMessage}), falling back to HTTP`,
                    signalId,
                );

                await this.fallbackToHTTP(intentSignal);

                this.eventEmitter.emit("EXECUTION_COMPLETE", {
                    signal_id: signalId,
                    symbol: trap.symbol,
                    fallback: "HTTP",
                });
            }
        } catch (error) {
            this.logger.error(
                `❌ Trap execution failed: ${trap.symbol}`,
                error as Error,
                signalId,
            );
            this.handleFailure(trap.symbol);

            if (signalId) {
                try {
                    await this.executionClient.sendAbort(signalId);
                } catch {}
            }

            trap.activated = false;
            trap.activatedAt = undefined;
        }
    }

    private isTrapStillValid(trap: Tripwire): boolean {
        if (!trap.activated) return false;

        const currentPrice = this.velocityCalculator.getLastPrice(trap.symbol);
        if (!currentPrice) return false;

        const priceDistance = Math.abs(currentPrice - trap.triggerPrice) /
            trap.triggerPrice;
        if (priceDistance > 0.001) return false;

        const volumeCounter = this.stateManager.getVolumeCounter(trap.symbol);
        if (!volumeCounter) return false;

        const timeSinceVolumeStart = Date.now() - volumeCounter.startTime;
        if (timeSinceVolumeStart > 200) return false;

        return true;
    }

    private async fallbackToHTTP(signal: IntentSignal): Promise<void> {
        const executionServiceUrl = process.env.TITAN_EXECUTION_URL ||
            "http://localhost:8080";
        const response = await fetch(`${executionServiceUrl}/webhook`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Titan-Source": "scavenger",
            },
            body: JSON.stringify(signal),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    }

    private handleFailure(symbol: string): void {
        const failures = this.stateManager.incrementFailedAttempts(symbol);
        if (failures >= 3) {
            this.logger.warn(`   ⛔ BLACKLISTING ${symbol} for 5 minutes`);
            this.stateManager.blacklistSymbol(symbol, Date.now() + 300000);
            this.stateManager.resetFailedAttempts(symbol);

            this.eventEmitter.emit("SYMBOL_BLACKLISTED", {
                symbol,
                reason: "too_many_failures",
                durationMs: 300000,
            });
        }
    }
}
