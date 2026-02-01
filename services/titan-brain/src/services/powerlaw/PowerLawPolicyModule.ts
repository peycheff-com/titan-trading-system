/**
 * PowerLaw Policy Module
 *
 * Consumes canonical PowerLaw metrics and enforces execution constraints
 * based on configurable policy modes: SHADOW, ADVISORY, ENFORCEMENT.
 */

import type { NatsClient } from "@titan/shared";
import {
    type ExecutionConstraintsV1,
    type PolicyMode,
    POWER_LAW_SUBJECTS,
    type PowerLawMetricsV1,
    type RiskMode,
} from "@titan/shared";
import { Logger } from "../../logging/Logger.js";

const logger = Logger.getInstance("powerlaw-policy");

export interface PowerLawPolicyConfig {
    mode: PolicyMode;
    // Thresholds for constraint generation
    alphaWarning: number; // Alpha below this triggers warnings (e.g., 2.5)
    alphaCritical: number; // Alpha below this triggers hard constraints (e.g., 2.0)
    fitQualityMinimum: number; // Minimum confidence to trust metrics (e.g., 0.5)
    exceedanceWarning: number; // Exceedance probability warning threshold
    exceedanceCritical: number; // Exceedance probability critical threshold
    volatilityClusterMultiplier: number; // Scale reduction during clustering
    // Default constraints
    defaultMaxPosNotional: number;
    defaultMaxOrderNotional: number;
    defaultMaxLeverage: number;
    defaultSliceNotional: number;
    constraintsTTLMs: number; // Time-to-live for constraints
    accountId: string; // Account identifier for constraints
    codeHash: string; // For provenance
    configHash: string; // For provenance
}

export const DEFAULT_POLICY_CONFIG: PowerLawPolicyConfig = {
    mode: "SHADOW",
    alphaWarning: 2.5,
    alphaCritical: 2.0,
    fitQualityMinimum: 0.5,
    exceedanceWarning: 0.05,
    exceedanceCritical: 0.10,
    volatilityClusterMultiplier: 0.5,
    defaultMaxPosNotional: 500_000,
    defaultMaxOrderNotional: 100_000,
    defaultMaxLeverage: 3.0,
    defaultSliceNotional: 25_000,
    constraintsTTLMs: 60_000,
    accountId: "default",
    codeHash: "unknown",
    configHash: "unknown",
};

interface SymbolMetricsState {
    lastMetrics: PowerLawMetricsV1;
    lastConstraints: ExecutionConstraintsV1 | null;
    constraintsIssuedAt: number;
}

interface ImpactAssessment {
    type: "CONSTRAINT_TIGHTENED" | "CONSTRAINT_RELAXED" | "NO_CHANGE";
    severity: "CRITICAL" | "WARNING" | "INFO" | "NONE";
    reason: string;
    reasonCodes: string[];
}

export class PowerLawPolicyModule {
    private config: PowerLawPolicyConfig;
    private nats: NatsClient;
    private symbolState: Map<string, SymbolMetricsState> = new Map();
    private constraintsBuilder: ExecutionConstraintsBuilder;

    constructor(nats: NatsClient, config: Partial<PowerLawPolicyConfig> = {}) {
        this.nats = nats;
        this.config = { ...DEFAULT_POLICY_CONFIG, ...config };
        this.constraintsBuilder = new ExecutionConstraintsBuilder(this.config);
    }

    getConfig(): PowerLawPolicyConfig {
        return { ...this.config };
    }

    updateConfig(update: Partial<PowerLawPolicyConfig>): void {
        this.config = { ...this.config, ...update };
        this.constraintsBuilder = new ExecutionConstraintsBuilder(this.config);
        logger.info(`PowerLaw Policy config updated: mode=${this.config.mode}`);
    }

    /**
     * Process incoming canonical PowerLaw metrics
     */
    async processMetrics(metrics: PowerLawMetricsV1): Promise<void> {
        const key = `${metrics.venue}:${metrics.symbol}`;

        // Store latest metrics
        const state: SymbolMetricsState = this.symbolState.get(key) || {
            lastMetrics: metrics,
            lastConstraints: null,
            constraintsIssuedAt: 0,
        };
        state.lastMetrics = metrics;

        // Build new constraints
        const constraints = this.constraintsBuilder.build(metrics);
        const previousConstraints = state.lastConstraints;

        state.lastConstraints = constraints;
        state.constraintsIssuedAt = Date.now();
        this.symbolState.set(key, state);

        // Determine impact
        const impact = this.assessImpact(
            previousConstraints,
            constraints,
            metrics,
        );

        // Execute based on mode
        switch (this.config.mode) {
            case "SHADOW":
                // Log only, no publish
                logger.debug(
                    `[SHADOW] Constraints computed for ${key}: ` +
                        `maxOrderNotional=${constraints.limits.max_order_notional}, leverage=${constraints.limits.max_leverage}`,
                );
                break;

            case "ADVISORY":
                // Log warning but publish constraints
                if (impact.severity !== "NONE") {
                    logger.info(
                        `[ADVISORY] PowerLaw impact for ${key}: ${impact.reason}`,
                    );
                }
                await this.publishConstraints(constraints);
                await this.emitImpactEvent(metrics, constraints, impact);
                break;

            case "ENFORCEMENT":
                // Full enforcement - publish and audit
                await this.publishConstraints(constraints);
                await this.emitImpactEvent(metrics, constraints, impact);
                if (impact.severity === "CRITICAL") {
                    logger.warn(
                        `[ENFORCEMENT] Critical PowerLaw impact for ${key}: ${impact.reason}`,
                    );
                }
                break;
        }
    }

    private async publishConstraints(
        constraints: ExecutionConstraintsV1,
    ): Promise<void> {
        const subject = POWER_LAW_SUBJECTS.constraintsV1(
            constraints.venue,
            constraints.account,
            constraints.symbol,
        );
        await this.nats.publish(subject, constraints);
    }

    private async emitImpactEvent(
        metrics: PowerLawMetricsV1,
        constraints: ExecutionConstraintsV1,
        impact: ImpactAssessment,
    ): Promise<void> {
        if (impact.severity === "NONE") return;

        // Emit a structured impact event to the powerlaw impact stream
        const event = {
            timestamp: Date.now(),
            metricsProvenanceHash: metrics.provenance.data_fingerprint,
            symbol: metrics.symbol,
            venue: metrics.venue,
            impactType: impact.type,
            severity: impact.severity,
            reason: impact.reason,
            reasonCodes: impact.reasonCodes,
            metricsSnapshot: {
                alpha: metrics.tail.alpha,
                confidence: metrics.tail.confidence,
                exceedanceProbability: metrics.exceedance.prob,
                volClusterState: metrics.vol_cluster.state,
            },
            constraintsApplied: {
                maxOrderNotional: constraints.limits.max_order_notional,
                maxLeverage: constraints.limits.max_leverage,
                reduceOnly: constraints.limits.reduce_only,
            },
        };

        await this.nats.publish("titan.evt.powerlaw.impact.v1", event);
    }

    private assessImpact(
        previous: ExecutionConstraintsV1 | null,
        current: ExecutionConstraintsV1,
        metrics: PowerLawMetricsV1,
    ): ImpactAssessment {
        const alpha = metrics.tail.alpha;
        const exceedance = metrics.exceedance.prob ?? 0;
        const reasonCodes: string[] = [];

        // Check for critical conditions
        if (alpha !== null && alpha < this.config.alphaCritical) {
            reasonCodes.push("ALPHA_CRITICAL");
            return {
                type: "CONSTRAINT_TIGHTENED",
                severity: "CRITICAL",
                reason: `Tail alpha ${
                    alpha.toFixed(3)
                } below critical threshold ${this.config.alphaCritical}`,
                reasonCodes,
            };
        }

        if (exceedance >= this.config.exceedanceCritical) {
            reasonCodes.push("EXCEEDANCE_CRITICAL");
            return {
                type: "CONSTRAINT_TIGHTENED",
                severity: "CRITICAL",
                reason: `Exceedance probability ${
                    (exceedance * 100).toFixed(1)
                }% above critical threshold`,
                reasonCodes,
            };
        }

        // Check for warnings
        if (alpha !== null && alpha < this.config.alphaWarning) {
            reasonCodes.push("ALPHA_WARNING");
            return {
                type: "CONSTRAINT_TIGHTENED",
                severity: "WARNING",
                reason: `Tail alpha ${
                    alpha.toFixed(3)
                } below warning threshold ${this.config.alphaWarning}`,
                reasonCodes,
            };
        }

        // Check for changes from previous
        if (previous) {
            if (
                current.limits.max_order_notional <
                    previous.limits.max_order_notional
            ) {
                reasonCodes.push("NOTIONAL_REDUCED");
                return {
                    type: "CONSTRAINT_TIGHTENED",
                    severity: "INFO",
                    reason:
                        `Max notional reduced from ${previous.limits.max_order_notional} to ${current.limits.max_order_notional}`,
                    reasonCodes,
                };
            }
            if (
                current.limits.max_order_notional >
                    previous.limits.max_order_notional
            ) {
                reasonCodes.push("NOTIONAL_INCREASED");
                return {
                    type: "CONSTRAINT_RELAXED",
                    severity: "INFO",
                    reason:
                        `Max notional increased from ${previous.limits.max_order_notional} to ${current.limits.max_order_notional}`,
                    reasonCodes,
                };
            }
        }

        return {
            type: "NO_CHANGE",
            severity: "NONE",
            reason: "",
            reasonCodes: [],
        };
    }

    /**
     * Get current constraints for a symbol
     */
    getConstraints(
        venue: string,
        symbol: string,
    ): ExecutionConstraintsV1 | null {
        const state = this.symbolState.get(`${venue}:${symbol}`);
        if (!state?.lastConstraints) return null;

        // Check TTL
        if (
            Date.now() - state.constraintsIssuedAt >
                this.config.constraintsTTLMs
        ) {
            return null; // Expired
        }
        return state.lastConstraints;
    }

    /**
     * Get all active constraints
     */
    getAllConstraints(): ExecutionConstraintsV1[] {
        const now = Date.now();
        const active: ExecutionConstraintsV1[] = [];
        for (const state of this.symbolState.values()) {
            if (
                state.lastConstraints &&
                now - state.constraintsIssuedAt < this.config.constraintsTTLMs
            ) {
                active.push(state.lastConstraints);
            }
        }
        return active;
    }
}

/**
 * Builds ExecutionConstraints from PowerLaw metrics.
 * Converts tail risk analysis into executable limits.
 */
export class ExecutionConstraintsBuilder {
    private config: PowerLawPolicyConfig;

    constructor(config: PowerLawPolicyConfig) {
        this.config = config;
    }

    build(metrics: PowerLawMetricsV1): ExecutionConstraintsV1 {
        const alpha = metrics.tail.alpha ?? 3.0; // Default safe alpha
        const confidence = metrics.tail.confidence;
        const exceedance = metrics.exceedance.prob ?? 0;
        const inCluster = metrics.vol_cluster.state === "expanding";

        // Determine scaling factors based on risk
        let notionalScale = 1.0;
        let leverageScale = 1.0;

        // Alpha-based scaling (lower alpha = fatter tails = more risk)
        if (alpha < this.config.alphaCritical) {
            notionalScale *= 0.25;
            leverageScale *= 0.5;
        } else if (alpha < this.config.alphaWarning) {
            notionalScale *= 0.5;
            leverageScale *= 0.75;
        }

        // Confidence check - if low, reduce constraints
        if (confidence < this.config.fitQualityMinimum) {
            notionalScale *= 0.75;
            leverageScale *= 0.75;
        }

        // Exceedance probability scaling
        if (exceedance >= this.config.exceedanceCritical) {
            notionalScale *= 0.25;
        } else if (exceedance >= this.config.exceedanceWarning) {
            notionalScale *= 0.5;
        }

        // Volatility cluster reduction
        if (inCluster) {
            notionalScale *= this.config.volatilityClusterMultiplier;
        }

        // Determine risk mode
        let riskMode: RiskMode = "NORMAL";
        if (
            alpha < this.config.alphaCritical ||
            exceedance >= this.config.exceedanceCritical
        ) {
            riskMode = "EMERGENCY";
        } else if (
            alpha < this.config.alphaWarning ||
            exceedance >= this.config.exceedanceWarning
        ) {
            riskMode = "CAUTION";
        } else if (inCluster) {
            riskMode = "DEFENSIVE";
        }

        const now = Date.now();
        const reasonCodes = this.buildReasonCodes(
            alpha,
            confidence,
            exceedance,
            inCluster,
        );

        const constraints: ExecutionConstraintsV1 = {
            schema_version: "1",
            venue: metrics.venue,
            account: this.config.accountId,
            symbol: metrics.symbol,
            ttl_ms: this.config.constraintsTTLMs,
            issued_ts: now,
            risk_mode: riskMode,
            mode: this.config.mode,
            limits: {
                max_pos_notional: Math.round(
                    this.config.defaultMaxPosNotional * notionalScale,
                ),
                max_order_notional: Math.round(
                    this.config.defaultMaxOrderNotional * notionalScale,
                ),
                max_leverage: parseFloat(
                    (this.config.defaultMaxLeverage * leverageScale).toFixed(2),
                ),
                reduce_only: riskMode === "EMERGENCY",
            },
            execution_profile: {
                slicing: {
                    max_slice_notional: Math.round(
                        this.config.defaultSliceNotional * notionalScale,
                    ),
                    min_slice_notional: 100,
                    cadence_ms: inCluster ? 10_000 : 2_000,
                },
                maker_bias: inCluster ? 1.0 : 0.5,
                cancel_on_burst: {
                    enabled: inCluster,
                    timeout_ms: 5000,
                },
                price_band_bps: inCluster ? 10 : 50,
                tif: {
                    type: inCluster ? "IOC" : "GTC",
                    ttl_ms: inCluster ? 5000 : 60000,
                },
            },
            origin: {
                derived_from_metrics: {
                    provenance_hash: metrics.provenance.data_fingerprint,
                    window_end_ts: metrics.window.end_ts,
                    model_id: metrics.model.model_id,
                },
                brain_decision_id: `powerlaw-${now}`,
                reason_codes: reasonCodes,
            },
            provenance: {
                code_hash: this.config.codeHash,
                config_hash: this.config.configHash,
                calc_ts: now,
                trace_id: metrics.provenance.trace_id,
            },
        };

        return constraints;
    }

    private buildReasonCodes(
        alpha: number,
        confidence: number,
        exceedance: number,
        inCluster: boolean,
    ): string[] {
        const codes: string[] = [];

        if (alpha < this.config.alphaCritical) {
            codes.push("ALPHA_CRITICAL");
        } else if (alpha < this.config.alphaWarning) {
            codes.push("ALPHA_WARNING");
        }

        if (confidence < this.config.fitQualityMinimum) {
            codes.push("LOW_CONFIDENCE");
        }

        if (exceedance >= this.config.exceedanceCritical) {
            codes.push("EXCEEDANCE_CRITICAL");
        } else if (exceedance >= this.config.exceedanceWarning) {
            codes.push("EXCEEDANCE_WARNING");
        }

        if (inCluster) {
            codes.push("VOL_EXPANDING");
        }

        if (codes.length === 0) {
            codes.push("NOMINAL");
        }

        return codes;
    }
}
