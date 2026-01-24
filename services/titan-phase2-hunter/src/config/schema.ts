import { z } from "zod";
import { EventCategory } from "../types";

// Inline definition to avoid import issues during testing
export const ExchangeConfigBase = z.object({
  enabled: z.boolean(),
  executeOn: z.boolean(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  testnet: z.boolean().default(false),
  rateLimit: z.number().min(1).max(100).default(10),
  timeout: z.number().min(1000).max(30000).default(5000),
});

export const PhaseConfigBaseSchema = z.object({
  enabled: z.boolean().default(true),
  maxLeverage: z.number().min(1).max(200),
  maxDrawdown: z.number().min(0.01).max(1),
  maxPositionSize: z.number().min(0.01).max(1),
  riskPerTrade: z.number().min(0.001).max(0.1),
  exchanges: z.record(z.string(), ExchangeConfigBase),
  parameters: z.record(z.string(), z.unknown()).optional(),

  // Environment-specific overrides
  environments: z
    .record(
      z.string(),
      z
        .object({
          maxLeverage: z.number().min(1).max(200).optional(),
          maxDrawdown: z.number().min(0.01).max(1).optional(),
          maxPositionSize: z.number().min(0.01).max(1).optional(),
          riskPerTrade: z.number().min(0.001).max(0.1).optional(),
          exchanges: z.record(z.string(), ExchangeConfigBase.partial())
            .optional(),
          parameters: z.record(z.string(), z.unknown()).optional(),
        })
        .partial(),
    )
    .optional(),
});

/**
 * Hunter (Phase 2) Specific Schemas
 */

export const AlignmentWeightsSchema = z
  .object({
    daily: z.number().min(30).max(60), // 30-60%
    h4: z.number().min(20).max(40), // 20-40%
    m15: z.number().min(10).max(30), // 10-30%
  })
  .refine((data) => Math.abs(data.daily + data.h4 + data.m15 - 100) <= 0.1, {
    message: "Alignment weights must sum to 100%",
    path: ["daily"], // Highlight "daily" but applies to the whole object
  });

export const RSConfigSchema = z.object({
  threshold: z.number().min(0).max(5), // 0-5%
  lookbackPeriod: z.number().min(2).max(8), // 2-8 hours
});

export const RiskConfigSchema = z.object({
  maxLeverage: z.number().min(3).max(5), // 3-5x
  stopLossPercent: z.number().min(1).max(3), // 1-3%
  targetPercent: z.number().min(3).max(6), // 3-6%
});

export const PortfolioConfigSchema = z.object({
  maxConcurrentPositions: z.number().min(3).max(8), // 3-8
  maxPortfolioHeat: z.number().min(10).max(20), // 10-20%
  correlationThreshold: z.number().min(0.6).max(0.9), // 0.6-0.9
});

export const ForwardTestConfigSchema = z.object({
  enabled: z.boolean(),
  duration: z.number().min(1).max(168), // 1-168 hours
  logSignalsOnly: z.boolean(),
  compareToBacktest: z.boolean(),
});

// Enhanced 2026 Schemas

export const OracleConfigSchema = z.object({
  enabled: z.boolean(),
  polymarketApiKey: z.string(),
  vetoThreshold: z.number().min(30).max(70),
  convictionMultiplierMax: z.number().min(1.0).max(2.0),
  eventCategories: z.array(z.nativeEnum(EventCategory)),
  updateInterval: z.number().min(1),
  btcCrashVetoThreshold: z.number(),
  btcAthBoostThreshold: z.number(),
  conflictThreshold: z.number(),
  probabilityChangeThreshold: z.number(),
  monitoringInterval: z.number(),
});

export const FlowValidatorConfigSchema = z.object({
  enabled: z.boolean(),
  sweepThreshold: z.number().min(3).max(10),
  icebergDensityThreshold: z.number().min(0).max(100),
  footprintAnalysisDepth: z.number(),
  institutionalThreshold: z.number().min(0).max(100),
  passiveAbsorptionMinRatio: z.number().min(0).max(1),
});

export const BotTrapConfigSchema = z.object({
  enabled: z.boolean(),
  precisionThreshold: z.number().min(0.1).max(1.0),
  suspicionThreshold: z.number().min(0).max(100),
  learningEnabled: z.boolean(),
  adaptiveAdjustments: z.boolean(),
  positionSizeReduction: z.number().min(0.1).max(1.0),
  stopLossTightening: z.number(),
  confirmationThresholdIncrease: z.number(),
});

export const GlobalAggregatorConfigSchema = z.object({
  enabled: z.boolean(),
  exchanges: z.array(z.enum(["binance", "coinbase", "kraken"])),
  exchangeWeights: z.object({
    binance: z.number().min(20).max(50),
    coinbase: z.number().min(20).max(50),
    kraken: z.number().min(20).max(50),
  }).refine((weights) => {
    const sum = weights.binance + weights.coinbase + weights.kraken;
    return Math.abs(sum - 100) <= 0.1;
  }, { message: "Exchange weights must sum to 100%" }),
  weightingMethod: z.enum(["volume", "liquidity", "hybrid"]),
  consensusThreshold: z.number().min(0.5).max(1.0),
  manipulationSensitivity: z.number(),
  reconnectInterval: z.number(),
});

export const ConvictionConfigSchema = z.object({
  enabled: z.boolean(),
  minMultiplier: z.number().min(0.5).max(1.5),
  maxMultiplier: z.number().min(1.0).max(2.0), // Requirement 16.5 & 7.5
  oracleAlignmentBonus: z.number(),
  globalCVDBonus: z.number(),
  trapReduction: z.number(),
}).refine((data) => data.minMultiplier < data.maxMultiplier, {
  message: "Min multiplier must be less than max multiplier",
  path: ["minMultiplier"],
});

export const EnhancedRiskConfigSchema = z.object({
  highImpactEventThreshold: z.number(),
  highImpactPositionReduction: z.number(),
  extremeUncertaintyStopLoss: z.number(),
  globalCVDMonitoringInterval: z.number(),
  botTrapFrequencyThreshold: z.number(),
  multiExchangeFailureHalt: z.boolean(),
  oracleUnstableConservativeMode: z.boolean(),
  eventProximityThreshold: z.number(),
});

export const EmergencyConfigSchema = z.object({
  predictionEmergencyThreshold: z.number(),
  liquidityEmergencyExchangeCount: z.number(),
  flowEmergencyDivergenceThreshold: z.number(),
  trapSaturationThreshold: z.number(),
  autoFlattenOnEmergency: z.boolean(),
  notifyOnEmergency: z.boolean(),
});

/**
 * Complete Hunter Configuration Schema
 * Extends basic shared PhaseConfig with specific validation rules
 */
export const HunterConfigSchema = PhaseConfigBaseSchema.extend({
  alignmentWeights: AlignmentWeightsSchema,
  rsConfig: RSConfigSchema,
  riskConfig: RiskConfigSchema,
  portfolioConfig: PortfolioConfigSchema,
  forwardTestConfig: ForwardTestConfigSchema,

  // Enhanced 2026 Sections
  oracle: OracleConfigSchema.default({
    enabled: true,
    polymarketApiKey: "",
    vetoThreshold: 40,
    convictionMultiplierMax: 1.5,
    eventCategories: [
      EventCategory.CRYPTO_PRICE,
      EventCategory.FED_POLICY,
      EventCategory.REGULATORY,
    ],
    updateInterval: 60,
    btcCrashVetoThreshold: 40,
    btcAthBoostThreshold: 60,
    conflictThreshold: 40,
    probabilityChangeThreshold: 10,
    monitoringInterval: 60,
  }),
  flowValidator: FlowValidatorConfigSchema.default({
    enabled: true,
    sweepThreshold: 5,
    icebergDensityThreshold: 70,
    footprintAnalysisDepth: 20,
    institutionalThreshold: 60,
    passiveAbsorptionMinRatio: 0.6,
  }),
  botTrapDetector: BotTrapConfigSchema.default({
    enabled: true,
    precisionThreshold: 0.5,
    suspicionThreshold: 70,
    learningEnabled: true,
    adaptiveAdjustments: true,
    positionSizeReduction: 0.5,
    stopLossTightening: 1.0,
    confirmationThresholdIncrease: 50,
  }),
  globalAggregator: GlobalAggregatorConfigSchema.default({
    enabled: true,
    exchanges: ["binance", "coinbase", "kraken"],
    exchangeWeights: { binance: 40, coinbase: 35, kraken: 25 },
    weightingMethod: "volume",
    consensusThreshold: 0.67,
    manipulationSensitivity: 70,
    reconnectInterval: 5000,
  }),
  conviction: ConvictionConfigSchema.default({
    enabled: true,
    minMultiplier: 1.0,
    maxMultiplier: 2.0,
    oracleAlignmentBonus: 1.5,
    globalCVDBonus: 1.2,
    trapReduction: 0.5,
  }),
  enhancedRisk: EnhancedRiskConfigSchema.default({
    highImpactEventThreshold: 70,
    highImpactPositionReduction: 50,
    extremeUncertaintyStopLoss: 1.0,
    globalCVDMonitoringInterval: 5000,
    botTrapFrequencyThreshold: 80,
    multiExchangeFailureHalt: true,
    oracleUnstableConservativeMode: true,
    eventProximityThreshold: 60,
  }),
  emergency: EmergencyConfigSchema.default({
    predictionEmergencyThreshold: 90,
    liquidityEmergencyExchangeCount: 2,
    flowEmergencyDivergenceThreshold: 80,
    trapSaturationThreshold: 80,
    autoFlattenOnEmergency: true,
    notifyOnEmergency: true,
  }),

  version: z.number().optional(),
  lastModified: z.number().optional(),
});

export type HunterConfig = z.infer<typeof HunterConfigSchema>;
