/**
 * Configuration Schema Definitions for Titan Production Deployment
 *
 * Provides comprehensive schema validation for all configuration types
 * across the Titan system with environment-specific support.
 *
 * Requirements: 3.1, 3.3 - Configuration schema validation and environment-specific loading
 */
import { z } from 'zod';
/**
 * Environment types
 */
export declare const EnvironmentSchema: z.ZodEnum<["development", "staging", "production"]>;
export type Environment = z.infer<typeof EnvironmentSchema>;
/**
 * Exchange configuration schema
 */
export declare const ExchangeConfigBase: z.ZodObject<{
    enabled: z.ZodBoolean;
    executeOn: z.ZodBoolean;
    apiKey: z.ZodOptional<z.ZodString>;
    apiSecret: z.ZodOptional<z.ZodString>;
    testnet: z.ZodDefault<z.ZodBoolean>;
    rateLimit: z.ZodDefault<z.ZodNumber>;
    timeout: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    executeOn: boolean;
    testnet: boolean;
    rateLimit: number;
    timeout: number;
    apiKey?: string | undefined;
    apiSecret?: string | undefined;
}, {
    enabled: boolean;
    executeOn: boolean;
    apiKey?: string | undefined;
    apiSecret?: string | undefined;
    testnet?: boolean | undefined;
    rateLimit?: number | undefined;
    timeout?: number | undefined;
}>;
export declare const PartialExchangeConfigSchema: z.ZodObject<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    executeOn: z.ZodOptional<z.ZodBoolean>;
    apiKey: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    apiSecret: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    testnet: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    rateLimit: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    timeout: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    enabled?: boolean | undefined;
    executeOn?: boolean | undefined;
    apiKey?: string | undefined;
    apiSecret?: string | undefined;
    testnet?: boolean | undefined;
    rateLimit?: number | undefined;
    timeout?: number | undefined;
}, {
    enabled?: boolean | undefined;
    executeOn?: boolean | undefined;
    apiKey?: string | undefined;
    apiSecret?: string | undefined;
    testnet?: boolean | undefined;
    rateLimit?: number | undefined;
    timeout?: number | undefined;
}>;
export declare const ExchangeConfigSchema: z.ZodEffects<z.ZodObject<{
    enabled: z.ZodBoolean;
    executeOn: z.ZodBoolean;
    apiKey: z.ZodOptional<z.ZodString>;
    apiSecret: z.ZodOptional<z.ZodString>;
    testnet: z.ZodDefault<z.ZodBoolean>;
    rateLimit: z.ZodDefault<z.ZodNumber>;
    timeout: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    executeOn: boolean;
    testnet: boolean;
    rateLimit: number;
    timeout: number;
    apiKey?: string | undefined;
    apiSecret?: string | undefined;
}, {
    enabled: boolean;
    executeOn: boolean;
    apiKey?: string | undefined;
    apiSecret?: string | undefined;
    testnet?: boolean | undefined;
    rateLimit?: number | undefined;
    timeout?: number | undefined;
}>, {
    enabled: boolean;
    executeOn: boolean;
    testnet: boolean;
    rateLimit: number;
    timeout: number;
    apiKey?: string | undefined;
    apiSecret?: string | undefined;
}, {
    enabled: boolean;
    executeOn: boolean;
    apiKey?: string | undefined;
    apiSecret?: string | undefined;
    testnet?: boolean | undefined;
    rateLimit?: number | undefined;
    timeout?: number | undefined;
}>;
/**
 * Phase configuration schema
 */
/**
 * Phase configuration schema base (unrefined)
 * Exported for extension by specific phases
 */
export declare const PhaseConfigBaseSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    maxLeverage: z.ZodNumber;
    maxDrawdown: z.ZodNumber;
    maxPositionSize: z.ZodNumber;
    riskPerTrade: z.ZodNumber;
    exchanges: z.ZodRecord<z.ZodString, z.ZodObject<{
        enabled: z.ZodBoolean;
        executeOn: z.ZodBoolean;
        apiKey: z.ZodOptional<z.ZodString>;
        apiSecret: z.ZodOptional<z.ZodString>;
        testnet: z.ZodDefault<z.ZodBoolean>;
        rateLimit: z.ZodDefault<z.ZodNumber>;
        timeout: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        executeOn: boolean;
        testnet: boolean;
        rateLimit: number;
        timeout: number;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
    }, {
        enabled: boolean;
        executeOn: boolean;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
        testnet?: boolean | undefined;
        rateLimit?: number | undefined;
        timeout?: number | undefined;
    }>>;
    parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    environments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        maxLeverage: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        maxDrawdown: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        maxPositionSize: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        riskPerTrade: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        exchanges: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            executeOn: z.ZodOptional<z.ZodBoolean>;
            apiKey: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            apiSecret: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            testnet: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
            rateLimit: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
            timeout: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }>>>>;
        parameters: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, "strip", z.ZodTypeAny, {
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
    }, {
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    maxLeverage: number;
    maxDrawdown: number;
    maxPositionSize: number;
    riskPerTrade: number;
    exchanges: Record<string, {
        enabled: boolean;
        executeOn: boolean;
        testnet: boolean;
        rateLimit: number;
        timeout: number;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
    }>;
    parameters?: Record<string, unknown> | undefined;
    environments?: Record<string, {
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
    }> | undefined;
}, {
    maxLeverage: number;
    maxDrawdown: number;
    maxPositionSize: number;
    riskPerTrade: number;
    exchanges: Record<string, {
        enabled: boolean;
        executeOn: boolean;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
        testnet?: boolean | undefined;
        rateLimit?: number | undefined;
        timeout?: number | undefined;
    }>;
    enabled?: boolean | undefined;
    parameters?: Record<string, unknown> | undefined;
    environments?: Record<string, {
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
    }> | undefined;
}>;
export declare const PhaseConfigSchema: z.ZodEffects<z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    maxLeverage: z.ZodNumber;
    maxDrawdown: z.ZodNumber;
    maxPositionSize: z.ZodNumber;
    riskPerTrade: z.ZodNumber;
    exchanges: z.ZodRecord<z.ZodString, z.ZodObject<{
        enabled: z.ZodBoolean;
        executeOn: z.ZodBoolean;
        apiKey: z.ZodOptional<z.ZodString>;
        apiSecret: z.ZodOptional<z.ZodString>;
        testnet: z.ZodDefault<z.ZodBoolean>;
        rateLimit: z.ZodDefault<z.ZodNumber>;
        timeout: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        executeOn: boolean;
        testnet: boolean;
        rateLimit: number;
        timeout: number;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
    }, {
        enabled: boolean;
        executeOn: boolean;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
        testnet?: boolean | undefined;
        rateLimit?: number | undefined;
        timeout?: number | undefined;
    }>>;
    parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    environments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        maxLeverage: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        maxDrawdown: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        maxPositionSize: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        riskPerTrade: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        exchanges: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            executeOn: z.ZodOptional<z.ZodBoolean>;
            apiKey: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            apiSecret: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            testnet: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
            rateLimit: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
            timeout: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }>>>>;
        parameters: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, "strip", z.ZodTypeAny, {
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
    }, {
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    maxLeverage: number;
    maxDrawdown: number;
    maxPositionSize: number;
    riskPerTrade: number;
    exchanges: Record<string, {
        enabled: boolean;
        executeOn: boolean;
        testnet: boolean;
        rateLimit: number;
        timeout: number;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
    }>;
    parameters?: Record<string, unknown> | undefined;
    environments?: Record<string, {
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
    }> | undefined;
}, {
    maxLeverage: number;
    maxDrawdown: number;
    maxPositionSize: number;
    riskPerTrade: number;
    exchanges: Record<string, {
        enabled: boolean;
        executeOn: boolean;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
        testnet?: boolean | undefined;
        rateLimit?: number | undefined;
        timeout?: number | undefined;
    }>;
    enabled?: boolean | undefined;
    parameters?: Record<string, unknown> | undefined;
    environments?: Record<string, {
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
    }> | undefined;
}>, {
    enabled: boolean;
    maxLeverage: number;
    maxDrawdown: number;
    maxPositionSize: number;
    riskPerTrade: number;
    exchanges: Record<string, {
        enabled: boolean;
        executeOn: boolean;
        testnet: boolean;
        rateLimit: number;
        timeout: number;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
    }>;
    parameters?: Record<string, unknown> | undefined;
    environments?: Record<string, {
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
    }> | undefined;
}, {
    maxLeverage: number;
    maxDrawdown: number;
    maxPositionSize: number;
    riskPerTrade: number;
    exchanges: Record<string, {
        enabled: boolean;
        executeOn: boolean;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
        testnet?: boolean | undefined;
        rateLimit?: number | undefined;
        timeout?: number | undefined;
    }>;
    enabled?: boolean | undefined;
    parameters?: Record<string, unknown> | undefined;
    environments?: Record<string, {
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
    }> | undefined;
}>;
/**
 * Brain configuration schema
 */
/**
 * Schema for Phase Configuration Overrides (Deep Partial)
 * Allows overriding individual properties including partial exchange configs
 */
export declare const PhaseConfigOverridesSchema: z.ZodObject<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    maxLeverage: z.ZodOptional<z.ZodNumber>;
    maxDrawdown: z.ZodOptional<z.ZodNumber>;
    maxPositionSize: z.ZodOptional<z.ZodNumber>;
    riskPerTrade: z.ZodOptional<z.ZodNumber>;
    exchanges: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        enabled: z.ZodOptional<z.ZodBoolean>;
        executeOn: z.ZodOptional<z.ZodBoolean>;
        apiKey: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        apiSecret: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        testnet: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        rateLimit: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        timeout: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        enabled?: boolean | undefined;
        executeOn?: boolean | undefined;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
        testnet?: boolean | undefined;
        rateLimit?: number | undefined;
        timeout?: number | undefined;
    }, {
        enabled?: boolean | undefined;
        executeOn?: boolean | undefined;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
        testnet?: boolean | undefined;
        rateLimit?: number | undefined;
        timeout?: number | undefined;
    }>>>;
    parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    environments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    enabled?: boolean | undefined;
    maxLeverage?: number | undefined;
    maxDrawdown?: number | undefined;
    maxPositionSize?: number | undefined;
    riskPerTrade?: number | undefined;
    exchanges?: Record<string, {
        enabled?: boolean | undefined;
        executeOn?: boolean | undefined;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
        testnet?: boolean | undefined;
        rateLimit?: number | undefined;
        timeout?: number | undefined;
    }> | undefined;
    parameters?: Record<string, unknown> | undefined;
    environments?: Record<string, any> | undefined;
}, {
    enabled?: boolean | undefined;
    maxLeverage?: number | undefined;
    maxDrawdown?: number | undefined;
    maxPositionSize?: number | undefined;
    riskPerTrade?: number | undefined;
    exchanges?: Record<string, {
        enabled?: boolean | undefined;
        executeOn?: boolean | undefined;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
        testnet?: boolean | undefined;
        rateLimit?: number | undefined;
        timeout?: number | undefined;
    }> | undefined;
    parameters?: Record<string, unknown> | undefined;
    environments?: Record<string, any> | undefined;
}>;
/**
 * Brain configuration schema
 */
export declare const BrainConfigSchema: z.ZodObject<{
    maxTotalLeverage: z.ZodNumber;
    maxGlobalDrawdown: z.ZodNumber;
    emergencyFlattenThreshold: z.ZodNumber;
    phaseTransitionRules: z.ZodObject<{
        phase1ToPhase2: z.ZodNumber;
        phase2ToPhase3: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        phase1ToPhase2: number;
        phase2ToPhase3: number;
    }, {
        phase1ToPhase2: number;
        phase2ToPhase3: number;
    }>;
    overrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        enabled: z.ZodOptional<z.ZodBoolean>;
        maxLeverage: z.ZodOptional<z.ZodNumber>;
        maxDrawdown: z.ZodOptional<z.ZodNumber>;
        maxPositionSize: z.ZodOptional<z.ZodNumber>;
        riskPerTrade: z.ZodOptional<z.ZodNumber>;
        exchanges: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            executeOn: z.ZodOptional<z.ZodBoolean>;
            apiKey: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            apiSecret: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            testnet: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
            rateLimit: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
            timeout: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }>>>;
        parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        environments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        enabled?: boolean | undefined;
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
        environments?: Record<string, any> | undefined;
    }, {
        enabled?: boolean | undefined;
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
        environments?: Record<string, any> | undefined;
    }>>>;
    environments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        maxTotalLeverage: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        maxGlobalDrawdown: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        emergencyFlattenThreshold: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        phaseTransitionRules: z.ZodOptional<z.ZodOptional<z.ZodObject<{
            phase1ToPhase2: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
            phase2ToPhase3: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        }, "strip", z.ZodTypeAny, {
            phase1ToPhase2?: number | undefined;
            phase2ToPhase3?: number | undefined;
        }, {
            phase1ToPhase2?: number | undefined;
            phase2ToPhase3?: number | undefined;
        }>>>;
        overrides: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            maxLeverage: z.ZodOptional<z.ZodNumber>;
            maxDrawdown: z.ZodOptional<z.ZodNumber>;
            maxPositionSize: z.ZodOptional<z.ZodNumber>;
            riskPerTrade: z.ZodOptional<z.ZodNumber>;
            exchanges: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
                enabled: z.ZodOptional<z.ZodBoolean>;
                executeOn: z.ZodOptional<z.ZodBoolean>;
                apiKey: z.ZodOptional<z.ZodOptional<z.ZodString>>;
                apiSecret: z.ZodOptional<z.ZodOptional<z.ZodString>>;
                testnet: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
                rateLimit: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
                timeout: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
            }, "strip", z.ZodTypeAny, {
                enabled?: boolean | undefined;
                executeOn?: boolean | undefined;
                apiKey?: string | undefined;
                apiSecret?: string | undefined;
                testnet?: boolean | undefined;
                rateLimit?: number | undefined;
                timeout?: number | undefined;
            }, {
                enabled?: boolean | undefined;
                executeOn?: boolean | undefined;
                apiKey?: string | undefined;
                apiSecret?: string | undefined;
                testnet?: boolean | undefined;
                rateLimit?: number | undefined;
                timeout?: number | undefined;
            }>>>;
            parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            environments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            enabled?: boolean | undefined;
            maxLeverage?: number | undefined;
            maxDrawdown?: number | undefined;
            maxPositionSize?: number | undefined;
            riskPerTrade?: number | undefined;
            exchanges?: Record<string, {
                enabled?: boolean | undefined;
                executeOn?: boolean | undefined;
                apiKey?: string | undefined;
                apiSecret?: string | undefined;
                testnet?: boolean | undefined;
                rateLimit?: number | undefined;
                timeout?: number | undefined;
            }> | undefined;
            parameters?: Record<string, unknown> | undefined;
            environments?: Record<string, any> | undefined;
        }, {
            enabled?: boolean | undefined;
            maxLeverage?: number | undefined;
            maxDrawdown?: number | undefined;
            maxPositionSize?: number | undefined;
            riskPerTrade?: number | undefined;
            exchanges?: Record<string, {
                enabled?: boolean | undefined;
                executeOn?: boolean | undefined;
                apiKey?: string | undefined;
                apiSecret?: string | undefined;
                testnet?: boolean | undefined;
                rateLimit?: number | undefined;
                timeout?: number | undefined;
            }> | undefined;
            parameters?: Record<string, unknown> | undefined;
            environments?: Record<string, any> | undefined;
        }>>>>;
    }, "strip", z.ZodTypeAny, {
        maxTotalLeverage?: number | undefined;
        maxGlobalDrawdown?: number | undefined;
        emergencyFlattenThreshold?: number | undefined;
        phaseTransitionRules?: {
            phase1ToPhase2?: number | undefined;
            phase2ToPhase3?: number | undefined;
        } | undefined;
        overrides?: Record<string, {
            enabled?: boolean | undefined;
            maxLeverage?: number | undefined;
            maxDrawdown?: number | undefined;
            maxPositionSize?: number | undefined;
            riskPerTrade?: number | undefined;
            exchanges?: Record<string, {
                enabled?: boolean | undefined;
                executeOn?: boolean | undefined;
                apiKey?: string | undefined;
                apiSecret?: string | undefined;
                testnet?: boolean | undefined;
                rateLimit?: number | undefined;
                timeout?: number | undefined;
            }> | undefined;
            parameters?: Record<string, unknown> | undefined;
            environments?: Record<string, any> | undefined;
        }> | undefined;
    }, {
        maxTotalLeverage?: number | undefined;
        maxGlobalDrawdown?: number | undefined;
        emergencyFlattenThreshold?: number | undefined;
        phaseTransitionRules?: {
            phase1ToPhase2?: number | undefined;
            phase2ToPhase3?: number | undefined;
        } | undefined;
        overrides?: Record<string, {
            enabled?: boolean | undefined;
            maxLeverage?: number | undefined;
            maxDrawdown?: number | undefined;
            maxPositionSize?: number | undefined;
            riskPerTrade?: number | undefined;
            exchanges?: Record<string, {
                enabled?: boolean | undefined;
                executeOn?: boolean | undefined;
                apiKey?: string | undefined;
                apiSecret?: string | undefined;
                testnet?: boolean | undefined;
                rateLimit?: number | undefined;
                timeout?: number | undefined;
            }> | undefined;
            parameters?: Record<string, unknown> | undefined;
            environments?: Record<string, any> | undefined;
        }> | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    maxTotalLeverage: number;
    maxGlobalDrawdown: number;
    emergencyFlattenThreshold: number;
    phaseTransitionRules: {
        phase1ToPhase2: number;
        phase2ToPhase3: number;
    };
    environments?: Record<string, {
        maxTotalLeverage?: number | undefined;
        maxGlobalDrawdown?: number | undefined;
        emergencyFlattenThreshold?: number | undefined;
        phaseTransitionRules?: {
            phase1ToPhase2?: number | undefined;
            phase2ToPhase3?: number | undefined;
        } | undefined;
        overrides?: Record<string, {
            enabled?: boolean | undefined;
            maxLeverage?: number | undefined;
            maxDrawdown?: number | undefined;
            maxPositionSize?: number | undefined;
            riskPerTrade?: number | undefined;
            exchanges?: Record<string, {
                enabled?: boolean | undefined;
                executeOn?: boolean | undefined;
                apiKey?: string | undefined;
                apiSecret?: string | undefined;
                testnet?: boolean | undefined;
                rateLimit?: number | undefined;
                timeout?: number | undefined;
            }> | undefined;
            parameters?: Record<string, unknown> | undefined;
            environments?: Record<string, any> | undefined;
        }> | undefined;
    }> | undefined;
    overrides?: Record<string, {
        enabled?: boolean | undefined;
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
        environments?: Record<string, any> | undefined;
    }> | undefined;
}, {
    maxTotalLeverage: number;
    maxGlobalDrawdown: number;
    emergencyFlattenThreshold: number;
    phaseTransitionRules: {
        phase1ToPhase2: number;
        phase2ToPhase3: number;
    };
    environments?: Record<string, {
        maxTotalLeverage?: number | undefined;
        maxGlobalDrawdown?: number | undefined;
        emergencyFlattenThreshold?: number | undefined;
        phaseTransitionRules?: {
            phase1ToPhase2?: number | undefined;
            phase2ToPhase3?: number | undefined;
        } | undefined;
        overrides?: Record<string, {
            enabled?: boolean | undefined;
            maxLeverage?: number | undefined;
            maxDrawdown?: number | undefined;
            maxPositionSize?: number | undefined;
            riskPerTrade?: number | undefined;
            exchanges?: Record<string, {
                enabled?: boolean | undefined;
                executeOn?: boolean | undefined;
                apiKey?: string | undefined;
                apiSecret?: string | undefined;
                testnet?: boolean | undefined;
                rateLimit?: number | undefined;
                timeout?: number | undefined;
            }> | undefined;
            parameters?: Record<string, unknown> | undefined;
            environments?: Record<string, any> | undefined;
        }> | undefined;
    }> | undefined;
    overrides?: Record<string, {
        enabled?: boolean | undefined;
        maxLeverage?: number | undefined;
        maxDrawdown?: number | undefined;
        maxPositionSize?: number | undefined;
        riskPerTrade?: number | undefined;
        exchanges?: Record<string, {
            enabled?: boolean | undefined;
            executeOn?: boolean | undefined;
            apiKey?: string | undefined;
            apiSecret?: string | undefined;
            testnet?: boolean | undefined;
            rateLimit?: number | undefined;
            timeout?: number | undefined;
        }> | undefined;
        parameters?: Record<string, unknown> | undefined;
        environments?: Record<string, any> | undefined;
    }> | undefined;
}>;
/**
 * Infrastructure configuration schema
 */
export declare const InfrastructureConfigSchema: z.ZodObject<{
    infrastructure: z.ZodObject<{
        requirements: z.ZodObject<{
            minRAM: z.ZodString;
            minCPU: z.ZodNumber;
            minDisk: z.ZodString;
            operatingSystem: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            minRAM: string;
            minCPU: number;
            minDisk: string;
            operatingSystem: string;
        }, {
            minRAM: string;
            minCPU: number;
            minDisk: string;
            operatingSystem: string;
        }>;
        dependencies: z.ZodObject<{
            nodejs: z.ZodObject<{
                version: z.ZodString;
                globalPackages: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodTypeAny, {
                version: string;
                globalPackages: string[];
            }, {
                version: string;
                globalPackages: string[];
            }>;
            redis: z.ZodObject<{
                version: z.ZodString;
                port: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
                maxMemory: z.ZodString;
                maxMemoryPolicy: z.ZodString;
                bindAddress: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                version: string;
                port: string | number;
                maxMemory: string;
                maxMemoryPolicy: string;
                bindAddress: string;
            }, {
                version: string;
                port: string | number;
                maxMemory: string;
                maxMemoryPolicy: string;
                bindAddress: string;
            }>;
            nginx: z.ZodObject<{
                version: z.ZodString;
                enableGzip: z.ZodBoolean;
                clientMaxBodySize: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                version: string;
                enableGzip: boolean;
                clientMaxBodySize: string;
            }, {
                version: string;
                enableGzip: boolean;
                clientMaxBodySize: string;
            }>;
            certbot: z.ZodOptional<z.ZodObject<{
                email: z.ZodString;
                domains: z.ZodArray<z.ZodString, "many">;
                autoRenewal: z.ZodBoolean;
            }, "strip", z.ZodTypeAny, {
                email: string;
                domains: string[];
                autoRenewal: boolean;
            }, {
                email: string;
                domains: string[];
                autoRenewal: boolean;
            }>>;
        }, "strip", z.ZodTypeAny, {
            nodejs: {
                version: string;
                globalPackages: string[];
            };
            redis: {
                version: string;
                port: string | number;
                maxMemory: string;
                maxMemoryPolicy: string;
                bindAddress: string;
            };
            nginx: {
                version: string;
                enableGzip: boolean;
                clientMaxBodySize: string;
            };
            certbot?: {
                email: string;
                domains: string[];
                autoRenewal: boolean;
            } | undefined;
        }, {
            nodejs: {
                version: string;
                globalPackages: string[];
            };
            redis: {
                version: string;
                port: string | number;
                maxMemory: string;
                maxMemoryPolicy: string;
                bindAddress: string;
            };
            nginx: {
                version: string;
                enableGzip: boolean;
                clientMaxBodySize: string;
            };
            certbot?: {
                email: string;
                domains: string[];
                autoRenewal: boolean;
            } | undefined;
        }>;
        security: z.ZodObject<{
            firewall: z.ZodObject<{
                defaultIncoming: z.ZodString;
                defaultOutgoing: z.ZodString;
                allowedPorts: z.ZodArray<z.ZodObject<{
                    port: z.ZodNumber;
                    protocol: z.ZodString;
                    comment: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    port: number;
                    protocol: string;
                    comment: string;
                }, {
                    port: number;
                    protocol: string;
                    comment: string;
                }>, "many">;
                restrictedPorts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    port: z.ZodNumber;
                    protocol: z.ZodString;
                    allowFrom: z.ZodString;
                    comment: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    port: number;
                    protocol: string;
                    comment: string;
                    allowFrom: string;
                }, {
                    port: number;
                    protocol: string;
                    comment: string;
                    allowFrom: string;
                }>, "many">>;
            }, "strip", z.ZodTypeAny, {
                defaultIncoming: string;
                defaultOutgoing: string;
                allowedPorts: {
                    port: number;
                    protocol: string;
                    comment: string;
                }[];
                restrictedPorts?: {
                    port: number;
                    protocol: string;
                    comment: string;
                    allowFrom: string;
                }[] | undefined;
            }, {
                defaultIncoming: string;
                defaultOutgoing: string;
                allowedPorts: {
                    port: number;
                    protocol: string;
                    comment: string;
                }[];
                restrictedPorts?: {
                    port: number;
                    protocol: string;
                    comment: string;
                    allowFrom: string;
                }[] | undefined;
            }>;
            fail2ban: z.ZodObject<{
                enabled: z.ZodBoolean;
                banTime: z.ZodNumber;
                findTime: z.ZodNumber;
                maxRetry: z.ZodNumber;
                jails: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    name: z.ZodString;
                    enabled: z.ZodBoolean;
                    port: z.ZodString;
                    filter: z.ZodString;
                    logPath: z.ZodString;
                    maxRetry: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    name: string;
                    filter: string;
                    enabled: boolean;
                    port: string;
                    logPath: string;
                    maxRetry?: number | undefined;
                }, {
                    name: string;
                    filter: string;
                    enabled: boolean;
                    port: string;
                    logPath: string;
                    maxRetry?: number | undefined;
                }>, "many">>;
            }, "strip", z.ZodTypeAny, {
                enabled: boolean;
                banTime: number;
                findTime: number;
                maxRetry: number;
                jails?: {
                    name: string;
                    filter: string;
                    enabled: boolean;
                    port: string;
                    logPath: string;
                    maxRetry?: number | undefined;
                }[] | undefined;
            }, {
                enabled: boolean;
                banTime: number;
                findTime: number;
                maxRetry: number;
                jails?: {
                    name: string;
                    filter: string;
                    enabled: boolean;
                    port: string;
                    logPath: string;
                    maxRetry?: number | undefined;
                }[] | undefined;
            }>;
            automaticUpdates: z.ZodOptional<z.ZodObject<{
                enabled: z.ZodBoolean;
                securityOnly: z.ZodBoolean;
                autoReboot: z.ZodBoolean;
                rebootTime: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                enabled: boolean;
                securityOnly: boolean;
                autoReboot: boolean;
                rebootTime: string;
            }, {
                enabled: boolean;
                securityOnly: boolean;
                autoReboot: boolean;
                rebootTime: string;
            }>>;
        }, "strip", z.ZodTypeAny, {
            firewall: {
                defaultIncoming: string;
                defaultOutgoing: string;
                allowedPorts: {
                    port: number;
                    protocol: string;
                    comment: string;
                }[];
                restrictedPorts?: {
                    port: number;
                    protocol: string;
                    comment: string;
                    allowFrom: string;
                }[] | undefined;
            };
            fail2ban: {
                enabled: boolean;
                banTime: number;
                findTime: number;
                maxRetry: number;
                jails?: {
                    name: string;
                    filter: string;
                    enabled: boolean;
                    port: string;
                    logPath: string;
                    maxRetry?: number | undefined;
                }[] | undefined;
            };
            automaticUpdates?: {
                enabled: boolean;
                securityOnly: boolean;
                autoReboot: boolean;
                rebootTime: string;
            } | undefined;
        }, {
            firewall: {
                defaultIncoming: string;
                defaultOutgoing: string;
                allowedPorts: {
                    port: number;
                    protocol: string;
                    comment: string;
                }[];
                restrictedPorts?: {
                    port: number;
                    protocol: string;
                    comment: string;
                    allowFrom: string;
                }[] | undefined;
            };
            fail2ban: {
                enabled: boolean;
                banTime: number;
                findTime: number;
                maxRetry: number;
                jails?: {
                    name: string;
                    filter: string;
                    enabled: boolean;
                    port: string;
                    logPath: string;
                    maxRetry?: number | undefined;
                }[] | undefined;
            };
            automaticUpdates?: {
                enabled: boolean;
                securityOnly: boolean;
                autoReboot: boolean;
                rebootTime: string;
            } | undefined;
        }>;
        systemLimits: z.ZodOptional<z.ZodAny>;
        directories: z.ZodOptional<z.ZodAny>;
        monitoring: z.ZodOptional<z.ZodAny>;
        environments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        requirements: {
            minRAM: string;
            minCPU: number;
            minDisk: string;
            operatingSystem: string;
        };
        dependencies: {
            nodejs: {
                version: string;
                globalPackages: string[];
            };
            redis: {
                version: string;
                port: string | number;
                maxMemory: string;
                maxMemoryPolicy: string;
                bindAddress: string;
            };
            nginx: {
                version: string;
                enableGzip: boolean;
                clientMaxBodySize: string;
            };
            certbot?: {
                email: string;
                domains: string[];
                autoRenewal: boolean;
            } | undefined;
        };
        security: {
            firewall: {
                defaultIncoming: string;
                defaultOutgoing: string;
                allowedPorts: {
                    port: number;
                    protocol: string;
                    comment: string;
                }[];
                restrictedPorts?: {
                    port: number;
                    protocol: string;
                    comment: string;
                    allowFrom: string;
                }[] | undefined;
            };
            fail2ban: {
                enabled: boolean;
                banTime: number;
                findTime: number;
                maxRetry: number;
                jails?: {
                    name: string;
                    filter: string;
                    enabled: boolean;
                    port: string;
                    logPath: string;
                    maxRetry?: number | undefined;
                }[] | undefined;
            };
            automaticUpdates?: {
                enabled: boolean;
                securityOnly: boolean;
                autoReboot: boolean;
                rebootTime: string;
            } | undefined;
        };
        environments?: Record<string, any> | undefined;
        systemLimits?: any;
        directories?: any;
        monitoring?: any;
    }, {
        requirements: {
            minRAM: string;
            minCPU: number;
            minDisk: string;
            operatingSystem: string;
        };
        dependencies: {
            nodejs: {
                version: string;
                globalPackages: string[];
            };
            redis: {
                version: string;
                port: string | number;
                maxMemory: string;
                maxMemoryPolicy: string;
                bindAddress: string;
            };
            nginx: {
                version: string;
                enableGzip: boolean;
                clientMaxBodySize: string;
            };
            certbot?: {
                email: string;
                domains: string[];
                autoRenewal: boolean;
            } | undefined;
        };
        security: {
            firewall: {
                defaultIncoming: string;
                defaultOutgoing: string;
                allowedPorts: {
                    port: number;
                    protocol: string;
                    comment: string;
                }[];
                restrictedPorts?: {
                    port: number;
                    protocol: string;
                    comment: string;
                    allowFrom: string;
                }[] | undefined;
            };
            fail2ban: {
                enabled: boolean;
                banTime: number;
                findTime: number;
                maxRetry: number;
                jails?: {
                    name: string;
                    filter: string;
                    enabled: boolean;
                    port: string;
                    logPath: string;
                    maxRetry?: number | undefined;
                }[] | undefined;
            };
            automaticUpdates?: {
                enabled: boolean;
                securityOnly: boolean;
                autoReboot: boolean;
                rebootTime: string;
            } | undefined;
        };
        environments?: Record<string, any> | undefined;
        systemLimits?: any;
        directories?: any;
        monitoring?: any;
    }>;
    deployment: z.ZodOptional<z.ZodAny>;
    validation: z.ZodOptional<z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    infrastructure: {
        requirements: {
            minRAM: string;
            minCPU: number;
            minDisk: string;
            operatingSystem: string;
        };
        dependencies: {
            nodejs: {
                version: string;
                globalPackages: string[];
            };
            redis: {
                version: string;
                port: string | number;
                maxMemory: string;
                maxMemoryPolicy: string;
                bindAddress: string;
            };
            nginx: {
                version: string;
                enableGzip: boolean;
                clientMaxBodySize: string;
            };
            certbot?: {
                email: string;
                domains: string[];
                autoRenewal: boolean;
            } | undefined;
        };
        security: {
            firewall: {
                defaultIncoming: string;
                defaultOutgoing: string;
                allowedPorts: {
                    port: number;
                    protocol: string;
                    comment: string;
                }[];
                restrictedPorts?: {
                    port: number;
                    protocol: string;
                    comment: string;
                    allowFrom: string;
                }[] | undefined;
            };
            fail2ban: {
                enabled: boolean;
                banTime: number;
                findTime: number;
                maxRetry: number;
                jails?: {
                    name: string;
                    filter: string;
                    enabled: boolean;
                    port: string;
                    logPath: string;
                    maxRetry?: number | undefined;
                }[] | undefined;
            };
            automaticUpdates?: {
                enabled: boolean;
                securityOnly: boolean;
                autoReboot: boolean;
                rebootTime: string;
            } | undefined;
        };
        environments?: Record<string, any> | undefined;
        systemLimits?: any;
        directories?: any;
        monitoring?: any;
    };
    validation?: any;
    deployment?: any;
}, {
    infrastructure: {
        requirements: {
            minRAM: string;
            minCPU: number;
            minDisk: string;
            operatingSystem: string;
        };
        dependencies: {
            nodejs: {
                version: string;
                globalPackages: string[];
            };
            redis: {
                version: string;
                port: string | number;
                maxMemory: string;
                maxMemoryPolicy: string;
                bindAddress: string;
            };
            nginx: {
                version: string;
                enableGzip: boolean;
                clientMaxBodySize: string;
            };
            certbot?: {
                email: string;
                domains: string[];
                autoRenewal: boolean;
            } | undefined;
        };
        security: {
            firewall: {
                defaultIncoming: string;
                defaultOutgoing: string;
                allowedPorts: {
                    port: number;
                    protocol: string;
                    comment: string;
                }[];
                restrictedPorts?: {
                    port: number;
                    protocol: string;
                    comment: string;
                    allowFrom: string;
                }[] | undefined;
            };
            fail2ban: {
                enabled: boolean;
                banTime: number;
                findTime: number;
                maxRetry: number;
                jails?: {
                    name: string;
                    filter: string;
                    enabled: boolean;
                    port: string;
                    logPath: string;
                    maxRetry?: number | undefined;
                }[] | undefined;
            };
            automaticUpdates?: {
                enabled: boolean;
                securityOnly: boolean;
                autoReboot: boolean;
                rebootTime: string;
            } | undefined;
        };
        environments?: Record<string, any> | undefined;
        systemLimits?: any;
        directories?: any;
        monitoring?: any;
    };
    validation?: any;
    deployment?: any;
}>;
/**
 * Deployment configuration schema
 */
export declare const DeploymentConfigSchema: z.ZodObject<{
    environment: z.ZodEnum<["development", "staging", "production"]>;
    services: z.ZodRecord<z.ZodString, z.ZodObject<{
        enabled: z.ZodBoolean;
        instances: z.ZodNumber;
        memory: z.ZodString;
        cpu: z.ZodNumber;
        env: z.ZodRecord<z.ZodString, z.ZodString>;
        dependencies: z.ZodArray<z.ZodString, "many">;
        healthCheck: z.ZodObject<{
            endpoint: z.ZodOptional<z.ZodString>;
            timeout: z.ZodNumber;
            retries: z.ZodNumber;
            interval: z.ZodNumber;
            expectedStatus: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            timeout: number;
            retries: number;
            interval: number;
            endpoint?: string | undefined;
            expectedStatus?: number | undefined;
        }, {
            timeout: number;
            retries: number;
            interval: number;
            endpoint?: string | undefined;
            expectedStatus?: number | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        memory: string;
        cpu: number;
        enabled: boolean;
        dependencies: string[];
        instances: number;
        env: Record<string, string>;
        healthCheck: {
            timeout: number;
            retries: number;
            interval: number;
            endpoint?: string | undefined;
            expectedStatus?: number | undefined;
        };
    }, {
        memory: string;
        cpu: number;
        enabled: boolean;
        dependencies: string[];
        instances: number;
        env: Record<string, string>;
        healthCheck: {
            timeout: number;
            retries: number;
            interval: number;
            endpoint?: string | undefined;
            expectedStatus?: number | undefined;
        };
    }>>;
    monitoring: z.ZodObject<{
        enabled: z.ZodBoolean;
        metricsPort: z.ZodNumber;
        alerting: z.ZodObject<{
            enabled: z.ZodBoolean;
            channels: z.ZodArray<z.ZodEnum<["email", "slack", "webhook", "sms"]>, "many">;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            channels: ("email" | "slack" | "webhook" | "sms")[];
        }, {
            enabled: boolean;
            channels: ("email" | "slack" | "webhook" | "sms")[];
        }>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        metricsPort: number;
        alerting: {
            enabled: boolean;
            channels: ("email" | "slack" | "webhook" | "sms")[];
        };
    }, {
        enabled: boolean;
        metricsPort: number;
        alerting: {
            enabled: boolean;
            channels: ("email" | "slack" | "webhook" | "sms")[];
        };
    }>;
    backup: z.ZodObject<{
        enabled: z.ZodBoolean;
        schedule: z.ZodString;
        retention: z.ZodObject<{
            days: z.ZodNumber;
            maxFiles: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            days: number;
            maxFiles: number;
        }, {
            days: number;
            maxFiles: number;
        }>;
        encryption: z.ZodObject<{
            enabled: z.ZodBoolean;
            algorithm: z.ZodEnum<["AES-256-GCM", "AES-256-CBC"]>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            algorithm: "AES-256-GCM" | "AES-256-CBC";
        }, {
            enabled: boolean;
            algorithm: "AES-256-GCM" | "AES-256-CBC";
        }>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        schedule: string;
        retention: {
            days: number;
            maxFiles: number;
        };
        encryption: {
            enabled: boolean;
            algorithm: "AES-256-GCM" | "AES-256-CBC";
        };
    }, {
        enabled: boolean;
        schedule: string;
        retention: {
            days: number;
            maxFiles: number;
        };
        encryption: {
            enabled: boolean;
            algorithm: "AES-256-GCM" | "AES-256-CBC";
        };
    }>;
    environments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    monitoring: {
        enabled: boolean;
        metricsPort: number;
        alerting: {
            enabled: boolean;
            channels: ("email" | "slack" | "webhook" | "sms")[];
        };
    };
    environment: "development" | "staging" | "production";
    services: Record<string, {
        memory: string;
        cpu: number;
        enabled: boolean;
        dependencies: string[];
        instances: number;
        env: Record<string, string>;
        healthCheck: {
            timeout: number;
            retries: number;
            interval: number;
            endpoint?: string | undefined;
            expectedStatus?: number | undefined;
        };
    }>;
    backup: {
        enabled: boolean;
        schedule: string;
        retention: {
            days: number;
            maxFiles: number;
        };
        encryption: {
            enabled: boolean;
            algorithm: "AES-256-GCM" | "AES-256-CBC";
        };
    };
    environments?: Record<string, any> | undefined;
}, {
    monitoring: {
        enabled: boolean;
        metricsPort: number;
        alerting: {
            enabled: boolean;
            channels: ("email" | "slack" | "webhook" | "sms")[];
        };
    };
    environment: "development" | "staging" | "production";
    services: Record<string, {
        memory: string;
        cpu: number;
        enabled: boolean;
        dependencies: string[];
        instances: number;
        env: Record<string, string>;
        healthCheck: {
            timeout: number;
            retries: number;
            interval: number;
            endpoint?: string | undefined;
            expectedStatus?: number | undefined;
        };
    }>;
    backup: {
        enabled: boolean;
        schedule: string;
        retention: {
            days: number;
            maxFiles: number;
        };
        encryption: {
            enabled: boolean;
            algorithm: "AES-256-GCM" | "AES-256-CBC";
        };
    };
    environments?: Record<string, any> | undefined;
}>;
/**
 * Service-specific configuration schemas
 */
export declare const ServiceConfigSchemas: Record<string, z.ZodSchema<any>>;
/**
 * Configuration validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    data?: any;
}
/**
 * Configuration validator class
 */
export declare class ConfigValidator {
    /**
     * Validate configuration against schema
     */
    static validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult;
    /**
     * Validate brain configuration
     */
    static validateBrainConfig(data: unknown): ValidationResult;
    /**
     * Validate phase configuration
     */
    static validatePhaseConfig(data: unknown): ValidationResult;
    /**
     * Validate infrastructure configuration
     */
    static validateInfrastructureConfig(data: unknown): ValidationResult;
    /**
     * Validate deployment configuration
     */
    static validateDeploymentConfig(data: unknown): ValidationResult;
    /**
     * Validate service configuration
     */
    static validateServiceConfig(service: string, data: unknown): ValidationResult;
    /**
     * Validate configuration against schema and throw if invalid
     */
    static validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown, context: string): T;
    /**
     * Validate brain configuration and throw if invalid
     */
    static validateBrainConfigOrThrow(data: unknown): BrainConfig;
    /**
     * Validate phase configuration and throw if invalid
     */
    static validatePhaseConfigOrThrow(data: unknown): PhaseConfig;
    /**
     * Validate infrastructure configuration and throw if invalid
     */
    static validateInfrastructureConfigOrThrow(data: unknown): InfrastructureConfig;
    /**
     * Validate deployment configuration and throw if invalid
     */
    static validateDeploymentConfigOrThrow(data: unknown): DeploymentConfig;
    /**
     * Get available service schemas
     */
    static getAvailableServiceSchemas(): string[];
}
/**
 * Type exports for use in other modules
 */
export type PhaseConfig = z.infer<typeof PhaseConfigSchema>;
export type BrainConfig = z.infer<typeof BrainConfigSchema>;
export type InfrastructureConfig = z.infer<typeof InfrastructureConfigSchema>;
export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;
export type ExchangeConfig = z.infer<typeof ExchangeConfigBase>;
//# sourceMappingURL=ConfigSchema.d.ts.map