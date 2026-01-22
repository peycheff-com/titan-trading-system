import { EventCategory } from "../types";
import { Enhanced2026Config } from "./EnhancedConfig.types";

/**
 * Default configuration values for 2026 enhancements
 */
export const DEFAULT_ENHANCED_2026_CONFIG: Enhanced2026Config = {
    oracle: {
        enabled: true,
        polymarketApiKey: "",
        vetoThreshold: 40, // 40% conflict threshold for veto
        convictionMultiplierMax: 1.5,
        eventCategories: [
            EventCategory.CRYPTO_PRICE,
            EventCategory.FED_POLICY,
            EventCategory.REGULATORY,
        ],
        updateInterval: 60, // 60 seconds
        btcCrashVetoThreshold: 40, // Requirement 1.6
        btcAthBoostThreshold: 60, // Requirement 1.7
        conflictThreshold: 40, // Requirement 1.5
        probabilityChangeThreshold: 10, // Requirement 11.1
        monitoringInterval: 60,
    },
    flowValidator: {
        enabled: true,
        sweepThreshold: 5, // Requirement 2.2: 5+ levels
        icebergDensityThreshold: 70,
        footprintAnalysisDepth: 20,
        institutionalThreshold: 60,
        passiveAbsorptionMinRatio: 0.6,
    },
    botTrapDetector: {
        enabled: true,
        precisionThreshold: 0.5, // 0.5%
        suspicionThreshold: 70,
        learningEnabled: true,
        adaptiveAdjustments: true,
        positionSizeReduction: 0.5, // Requirement 3.5: 50% reduction
        stopLossTightening: 1.0, // Requirement 3.5: 1% stop loss
        confirmationThresholdIncrease: 50, // Requirement 3.6: 50% increase
    },
    globalAggregator: {
        enabled: true,
        exchanges: ["binance", "coinbase", "kraken"],
        exchangeWeights: {
            binance: 40,
            coinbase: 35,
            kraken: 25,
        },
        weightingMethod: "volume",
        consensusThreshold: 0.67, // Requirement 4.4: 2 out of 3
        manipulationSensitivity: 70,
        reconnectInterval: 5000,
    },
    conviction: {
        enabled: true,
        minMultiplier: 1.0,
        maxMultiplier: 2.0, // Requirement 7.5: cap at 2.0x
        oracleAlignmentBonus: 1.5, // Requirement 1.3, 1.4
        globalCVDBonus: 1.2, // Requirement 7.3
        trapReduction: 0.5, // Requirement 7.4
    },
    enhancedRisk: {
        highImpactEventThreshold: 70, // Requirement 8.1
        highImpactPositionReduction: 50, // Requirement 8.1
        extremeUncertaintyStopLoss: 1.0, // Requirement 8.2
        globalCVDMonitoringInterval: 5000, // Requirement 8.3
        botTrapFrequencyThreshold: 80, // Requirement 8.4
        multiExchangeFailureHalt: true, // Requirement 8.6
        oracleUnstableConservativeMode: true, // Requirement 8.5
        eventProximityThreshold: 60, // Requirement 11.3
    },
    emergency: {
        predictionEmergencyThreshold: 90, // Requirement 14.1
        liquidityEmergencyExchangeCount: 2, // Requirement 14.2
        flowEmergencyDivergenceThreshold: 80, // Requirement 14.4
        trapSaturationThreshold: 80, // Requirement 14.5
        autoFlattenOnEmergency: true,
        notifyOnEmergency: true,
    },
    version: 1,
    lastModified: Date.now(),
};
