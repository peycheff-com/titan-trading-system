import { z } from "zod";
import { EquityTier } from "../types/index.js";

// Brain Config
export const BrainSchema = z.object({
    signalTimeout: z.number().min(10).max(10000).default(100),
    metricUpdateInterval: z.number().min(1000).max(3600000).default(60000),
    dashboardCacheTTL: z.number().min(100).max(60000).default(5000),
    maxQueueSize: z.number().min(10).max(10000).default(100),
});

// Allocation Engine Config
export const AllocationEngineSchema = z.object({
    transitionPoints: z.object({
        startP2: z.number().min(100).max(100000).default(1500),
        fullP2: z.number().min(100).max(100000).default(5000),
        startP3: z.number().min(1000).max(1000000).default(25000),
    }).refine((data) => data.startP2 < data.fullP2, {
        message: "startP2 must be less than fullP2",
        path: ["startP2"],
    }).refine((data) => data.fullP2 < data.startP3, {
        message: "fullP2 must be less than startP3",
        path: ["fullP2"],
    }),
    leverageCaps: z.object({
        [EquityTier.MICRO]: z.number().default(20),
        [EquityTier.SMALL]: z.number().default(10),
        [EquityTier.MEDIUM]: z.number().default(5),
        [EquityTier.LARGE]: z.number().default(3),
        [EquityTier.INSTITUTIONAL]: z.number().default(2),
    }),
});

// Performance Tracker Config
export const PerformanceTrackerSchema = z.object({
    windowDays: z.number().min(1).max(365).default(7),
    minTradeCount: z.number().min(1).max(1000).default(10),
    malusMultiplier: z.number().min(0).max(1).default(0.5),
    bonusMultiplier: z.number().min(1).max(5).default(1.2),
    malusThreshold: z.number().min(-10).max(10).default(0),
    bonusThreshold: z.number().min(0).max(10).default(2.0),
}).refine((data) => data.malusThreshold < data.bonusThreshold, {
    message: "malusThreshold must be less than bonusThreshold",
    path: ["malusThreshold"],
});

// Risk Guardian Config
export const RiskGuardianSchema = z.object({
    maxCorrelation: z.number().min(0).max(1).default(0.8),
    correlationPenalty: z.number().min(0).max(1).default(0.5),
    betaUpdateInterval: z.number().min(1000).max(3600000).default(300000),
    correlationUpdateInterval: z.number().min(1000).max(3600000).default(
        300000,
    ),
    minStopDistanceMultiplier: z.number().default(1.5),
});

// Capital Flow Config
export const CapitalFlowSchema = z.object({
    sweepThreshold: z.number().min(1.01).max(2).default(1.2),
    reserveLimit: z.number().min(0).max(10000).default(200),
    sweepSchedule: z.string().regex(/^[\d\s\*\/\-,]+$/).default("0 0 * * *"),
    maxRetries: z.number().min(0).max(10).default(3),
    retryBaseDelay: z.number().min(100).max(60000).default(1000),
});

// Circuit Breaker Config
export const CircuitBreakerSchema = z.object({
    maxDailyDrawdown: z.number().min(0.01).max(1).default(0.15),
    minEquity: z.number().min(0).max(100000).default(150),
    consecutiveLossLimit: z.number().min(1).max(100).default(3),
    consecutiveLossWindow: z.number().min(60000).max(86400000).default(3600000),
    cooldownMinutes: z.number().min(1).max(1440).default(30),
});

// Database Config
export const DatabaseSchema = z.object({
    host: z.string().default("localhost"),
    port: z.union([z.string(), z.number()]).transform((val) => Number(val))
        .default(5432),
    database: z.string().default("titan_brain"),
    user: z.string().default("postgres"),
    password: z.string().default("postgres"),
    maxConnections: z.number().min(1).max(100).default(20),
    idleTimeout: z.number().min(1000).max(300000).default(30000),
    url: z.string().optional(),
});

// Redis Config
export const RedisSchema = z.object({
    url: z.string().regex(/^redis:\/\//).default("redis://localhost:6379"),
    maxRetries: z.number().min(0).max(10).default(3),
    retryDelay: z.number().min(100).max(60000).default(1000),
});

// Server Config
export const ServerSchema = z.object({
    host: z.string().default("0.0.0.0"),
    port: z.union([z.string(), z.number()]).transform((val) => Number(val))
        .default(3100),
    corsOrigins: z.array(z.string()).default(["http://localhost:3000"]),
});

// Notifications Config
export const NotificationSchema = z.object({
    telegram: z.object({
        enabled: z.boolean().default(false),
        botToken: z.string().optional(),
        chatId: z.string().optional(),
    }),
    email: z.object({
        enabled: z.boolean().default(false),
        smtpHost: z.string().optional(),
        smtpPort: z.number().optional(),
        from: z.string().optional(),
        to: z.array(z.string()).optional(),
    }),
});

// Active Inference Config
export const ActiveInferenceSchema = z.object({
    distributionBins: z.number().min(10).max(1000).default(50),
    windowSize: z.number().min(10).max(10000).default(100),
    minHistory: z.number().min(1).max(1000).default(20),
    sensitivity: z.number().min(0.1).max(20).default(1.0),
    surpriseOffset: z.number().min(0).max(1).default(0.1),
});

// Services Config
export const ServicesSchema = z.object({
    executionUrl: z.string().regex(/^http/).optional(),
    phase1WebhookUrl: z.string().regex(/^http/).optional(),
    phase2WebhookUrl: z.string().regex(/^http/).optional(),
    phase3WebhookUrl: z.string().regex(/^http/).optional(),
});

// Root Schema
export const TitanBrainConfigSchema = z.object({
    brain: BrainSchema,
    allocationEngine: AllocationEngineSchema,
    performanceTracker: PerformanceTrackerSchema,
    riskGuardian: RiskGuardianSchema,
    capitalFlow: CapitalFlowSchema,
    circuitBreaker: CircuitBreakerSchema,
    database: DatabaseSchema,
    redis: RedisSchema,
    server: ServerSchema,
    notifications: NotificationSchema,
    activeInference: ActiveInferenceSchema,
    services: ServicesSchema,
});
