/* eslint-disable functional/immutable-data */
import {
    BotTrapConfig,
    ConvictionConfig,
    EmergencyConfig,
    Enhanced2026Config,
    Enhanced2026ValidationResult,
    EnhancedRiskConfig,
    FlowValidatorConfig,
    GlobalAggregatorConfig,
    OracleConfig,
} from "./EnhancedConfig.types";

export class EnhancedConfigValidator {
    /**
     * Validate configuration against requirements
     * Requirement 16.6: Validate parameter ranges and dependencies
     */
    public static validate(
        config: Enhanced2026Config,
    ): Enhanced2026ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        this.validateOracle(config.oracle, errors, warnings);
        this.validateFlowValidator(config.flowValidator, errors, warnings);
        this.validateBotTrap(config.botTrapDetector, errors, warnings);
        this.validateGlobalAggregator(
            config.globalAggregator,
            errors,
            warnings,
        );
        this.validateConviction(config.conviction, errors, warnings);
        this.validateEnhancedRisk(config.enhancedRisk, errors, warnings);
        this.validateEmergency(config.emergency, errors, warnings);

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    }

    private static validateOracle(
        config: OracleConfig,
        errors: string[],
        warnings: string[],
    ): void {
        if (!config) {
            errors.push("Missing oracle configuration");
            return;
        }

        const { vetoThreshold, convictionMultiplierMax, updateInterval } =
            config;

        // Requirement 16.1: Veto threshold 30-70%
        if (isNaN(vetoThreshold) || vetoThreshold < 30 || vetoThreshold > 70) {
            errors.push(
                `Oracle veto threshold must be 30-70%, got ${vetoThreshold}%`,
            );
        }

        if (
            isNaN(convictionMultiplierMax) ||
            convictionMultiplierMax < 1.0 ||
            convictionMultiplierMax > 2.0
        ) {
            errors.push(
                `Oracle conviction multiplier max must be 1.0-2.0, got ${convictionMultiplierMax}`,
            );
        }

        if (updateInterval < 10 || updateInterval > 300) {
            warnings.push(
                `Oracle update interval ${updateInterval}s may be suboptimal (recommended: 10-300s)`,
            );
        }
    }

    private static validateFlowValidator(
        config: FlowValidatorConfig,
        errors: string[],
        _warnings: string[],
    ): void {
        if (!config) {
            errors.push("Missing flowValidator configuration");
            return;
        }

        const {
            sweepThreshold,
            icebergDensityThreshold,
            institutionalThreshold,
        } = config;

        // Requirement 16.2: Sweep threshold 3-10 levels
        if (
            isNaN(sweepThreshold) || sweepThreshold < 3 || sweepThreshold > 10
        ) {
            errors.push(
                `Flow validator sweep threshold must be 3-10 levels, got ${sweepThreshold}`,
            );
        }

        if (
            isNaN(icebergDensityThreshold) || icebergDensityThreshold < 0 ||
            icebergDensityThreshold > 100
        ) {
            errors.push(
                `Iceberg density threshold must be 0-100, got ${icebergDensityThreshold}`,
            );
        }

        if (
            isNaN(institutionalThreshold) || institutionalThreshold < 0 ||
            institutionalThreshold > 100
        ) {
            errors.push(
                `Institutional threshold must be 0-100, got ${institutionalThreshold}`,
            );
        }
    }

    private static validateBotTrap(
        config: BotTrapConfig,
        errors: string[],
        _warnings: string[],
    ): void {
        if (!config) {
            errors.push("Missing botTrapDetector configuration");
            return;
        }

        const {
            precisionThreshold,
            suspicionThreshold,
            positionSizeReduction,
        } = config;

        // Requirement 16.3: Precision tolerance 0.1-1%
        if (
            isNaN(precisionThreshold) || precisionThreshold < 0.1 ||
            precisionThreshold > 1.0
        ) {
            errors.push(
                `Bot trap precision threshold must be 0.1-1.0%, got ${precisionThreshold}%`,
            );
        }

        if (
            isNaN(suspicionThreshold) || suspicionThreshold < 0 ||
            suspicionThreshold > 100
        ) {
            errors.push(
                `Suspicion threshold must be 0-100, got ${suspicionThreshold}`,
            );
        }

        if (
            isNaN(positionSizeReduction) || positionSizeReduction < 0.1 ||
            positionSizeReduction > 1.0
        ) {
            errors.push(
                `Position size reduction must be 0.1-1.0, got ${positionSizeReduction}`,
            );
        }
    }

    private static validateGlobalAggregator(
        config: GlobalAggregatorConfig,
        errors: string[],
        _warnings: string[],
    ): void {
        if (!config) {
            errors.push("Missing globalAggregator configuration");
            return;
        }

        const { exchangeWeights, consensusThreshold } = config;

        // Requirement 16.4: Exchange weights 20-50%
        for (const [exchange, weight] of Object.entries(exchangeWeights)) {
            if (weight < 20 || weight > 50) {
                errors.push(
                    `Exchange weight for ${exchange} must be 20-50%, got ${weight}%`,
                );
            }
        }

        // Validate weights sum to 100%
        const totalWeight = Object.values(exchangeWeights).reduce(
            (sum, w) => sum + w,
            0,
        );
        if (Math.abs(totalWeight - 100) > 0.1) {
            errors.push(
                `Exchange weights must sum to 100%, got ${totalWeight}%`,
            );
        }

        if (consensusThreshold < 0.5 || consensusThreshold > 1.0) {
            errors.push(
                `Consensus threshold must be 0.5-1.0, got ${consensusThreshold}`,
            );
        }
    }

    private static validateConviction(
        config: ConvictionConfig,
        errors: string[],
        _warnings: string[],
    ): void {
        if (!config) {
            errors.push("Missing conviction configuration");
            return;
        }

        const { minMultiplier, maxMultiplier } = config;

        // Requirement 16.5: Range 1.0x-2.0x
        if (
            isNaN(minMultiplier) || minMultiplier < 0.5 || minMultiplier > 1.5
        ) {
            errors.push(
                `Min conviction multiplier must be 0.5-1.5, got ${minMultiplier}`,
            );
        }

        if (
            isNaN(maxMultiplier) || maxMultiplier < 1.0 || maxMultiplier > 2.0
        ) {
            errors.push(
                `Max conviction multiplier must be 1.0-2.0, got ${maxMultiplier}`,
            );
        }

        if (minMultiplier >= maxMultiplier) {
            errors.push(
                `Min multiplier (${minMultiplier}) must be less than max (${maxMultiplier})`,
            );
        }
    }

    private static validateEnhancedRisk(
        config: EnhancedRiskConfig,
        errors: string[],
        warnings: string[],
    ): void {
        if (!config) {
            errors.push("Missing enhancedRisk configuration");
            return;
        }

        const { highImpactEventThreshold, highImpactPositionReduction } =
            config;

        if (highImpactEventThreshold < 50 || highImpactEventThreshold > 95) {
            warnings.push(
                `High impact event threshold ${highImpactEventThreshold}% may be suboptimal`,
            );
        }

        if (
            highImpactPositionReduction < 20 || highImpactPositionReduction > 80
        ) {
            warnings.push(
                `Position reduction ${highImpactPositionReduction}% may be too aggressive or too lenient`,
            );
        }
    }

    private static validateEmergency(
        config: EmergencyConfig,
        errors: string[],
        warnings: string[],
    ): void {
        if (!config) {
            errors.push("Missing emergency configuration");
            return;
        }

        const { predictionEmergencyThreshold, trapSaturationThreshold } =
            config;

        if (
            predictionEmergencyThreshold < 80 ||
            predictionEmergencyThreshold > 99
        ) {
            warnings.push(
                `Prediction emergency threshold ${predictionEmergencyThreshold}% may trigger too often or too rarely`,
            );
        }

        if (trapSaturationThreshold < 60 || trapSaturationThreshold > 95) {
            warnings.push(
                `Trap saturation threshold ${trapSaturationThreshold}% may be suboptimal`,
            );
        }
    }
}
