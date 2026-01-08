"use strict";
/**
 * Configuration Schema Definitions for Titan Production Deployment
 *
 * Provides comprehensive schema validation for all configuration types
 * across the Titan system with environment-specific support.
 *
 * Requirements: 3.1, 3.3 - Configuration schema validation and environment-specific loading
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigValidator = exports.ServiceConfigSchemas = exports.DeploymentConfigSchema = exports.InfrastructureConfigSchema = exports.BrainConfigSchema = exports.PhaseConfigSchema = exports.ExchangeConfigSchema = exports.EnvironmentSchema = void 0;
const zod_1 = require("zod");
/**
 * Environment types
 */
exports.EnvironmentSchema = zod_1.z.enum([
    "development",
    "staging",
    "production",
]);
/**
 * Exchange configuration schema
 */
exports.ExchangeConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
    executeOn: zod_1.z.boolean(),
    apiKey: zod_1.z.string().optional(),
    apiSecret: zod_1.z.string().optional(),
    testnet: zod_1.z.boolean().default(false),
    rateLimit: zod_1.z.number().min(1).max(100).default(10),
    timeout: zod_1.z.number().min(1000).max(30000).default(5000),
});
/**
 * Phase configuration schema
 */
exports.PhaseConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(true),
    maxLeverage: zod_1.z.number().min(1).max(200),
    maxDrawdown: zod_1.z.number().min(0.01).max(1),
    maxPositionSize: zod_1.z.number().min(0.01).max(1),
    riskPerTrade: zod_1.z.number().min(0.001).max(0.1),
    exchanges: zod_1.z.record(zod_1.z.string(), exports.ExchangeConfigSchema),
    parameters: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    // Environment-specific overrides
    environments: zod_1.z.record(zod_1.z.string(), zod_1.z.object({
        maxLeverage: zod_1.z.number().min(1).max(200).optional(),
        maxDrawdown: zod_1.z.number().min(0.01).max(1).optional(),
        maxPositionSize: zod_1.z.number().min(0.01).max(1).optional(),
        riskPerTrade: zod_1.z.number().min(0.001).max(0.1).optional(),
        exchanges: zod_1.z.record(zod_1.z.string(), exports.ExchangeConfigSchema.partial())
            .optional(),
        parameters: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    }).partial()).optional(),
});
/**
 * Brain configuration schema
 */
exports.BrainConfigSchema = zod_1.z.object({
    maxTotalLeverage: zod_1.z.number().min(1).max(500),
    maxGlobalDrawdown: zod_1.z.number().min(0.01).max(1),
    emergencyFlattenThreshold: zod_1.z.number().min(0.01).max(1),
    phaseTransitionRules: zod_1.z.object({
        phase1ToPhase2: zod_1.z.number().min(100),
        phase2ToPhase3: zod_1.z.number().min(1000),
    }),
    // Global overrides for all phases
    overrides: zod_1.z.record(zod_1.z.string(), exports.PhaseConfigSchema.partial()).optional(),
    // Environment-specific brain settings
    environments: zod_1.z.record(zod_1.z.string(), zod_1.z.object({
        maxTotalLeverage: zod_1.z.number().min(1).max(500).optional(),
        maxGlobalDrawdown: zod_1.z.number().min(0.01).max(1).optional(),
        emergencyFlattenThreshold: zod_1.z.number().min(0.01).max(1).optional(),
        phaseTransitionRules: zod_1.z.object({
            phase1ToPhase2: zod_1.z.number().min(100).optional(),
            phase2ToPhase3: zod_1.z.number().min(1000).optional(),
        }).partial().optional(),
        overrides: zod_1.z.record(zod_1.z.string(), exports.PhaseConfigSchema.partial()).optional(),
    }).partial()).optional(),
});
/**
 * Infrastructure configuration schema
 */
exports.InfrastructureConfigSchema = zod_1.z.object({
    server: zod_1.z.object({
        minRAM: zod_1.z.string().regex(/^\d+GB$/),
        minCPU: zod_1.z.number().min(1),
        minDisk: zod_1.z.string().regex(/^\d+GB$/),
        operatingSystem: zod_1.z.string(),
    }),
    services: zod_1.z.object({
        nodejs: zod_1.z.object({
            version: zod_1.z.string(),
            globalPackages: zod_1.z.array(zod_1.z.string()),
        }),
        redis: zod_1.z.object({
            version: zod_1.z.string(),
            port: zod_1.z.number().min(1).max(65535),
            maxMemory: zod_1.z.string(),
            maxMemoryPolicy: zod_1.z.string(),
            bindAddress: zod_1.z.string(),
        }),
        nginx: zod_1.z.object({
            version: zod_1.z.string(),
            enableGzip: zod_1.z.boolean(),
            clientMaxBodySize: zod_1.z.string(),
        }),
    }),
    security: zod_1.z.object({
        firewall: zod_1.z.object({
            defaultIncoming: zod_1.z.enum(["allow", "deny"]),
            defaultOutgoing: zod_1.z.enum(["allow", "deny"]),
            allowedPorts: zod_1.z.array(zod_1.z.object({
                port: zod_1.z.number().min(1).max(65535),
                protocol: zod_1.z.enum(["tcp", "udp"]),
                comment: zod_1.z.string(),
            })),
            restrictedPorts: zod_1.z.array(zod_1.z.object({
                port: zod_1.z.number().min(1).max(65535),
                protocol: zod_1.z.enum(["tcp", "udp"]),
                allowFrom: zod_1.z.string(),
                comment: zod_1.z.string(),
            })),
        }),
        ssl: zod_1.z.object({
            enabled: zod_1.z.boolean(),
            domains: zod_1.z.array(zod_1.z.string()),
            autoRenewal: zod_1.z.boolean(),
            email: zod_1.z.string().email().optional(),
        }),
        fail2ban: zod_1.z.object({
            enabled: zod_1.z.boolean(),
            banTime: zod_1.z.number().min(60),
            findTime: zod_1.z.number().min(60),
            maxRetry: zod_1.z.number().min(1),
        }),
    }),
    // Environment-specific infrastructure settings
    environments: zod_1.z.record(zod_1.z.string(), zod_1.z.object({
        server: zod_1.z.object({
            minRAM: zod_1.z.string().regex(/^\d+GB$/).optional(),
            minCPU: zod_1.z.number().min(1).optional(),
            minDisk: zod_1.z.string().regex(/^\d+GB$/).optional(),
        }).partial().optional(),
        security: zod_1.z.object({
            ssl: zod_1.z.object({
                enabled: zod_1.z.boolean().optional(),
                domains: zod_1.z.array(zod_1.z.string()).optional(),
            }).partial().optional(),
        }).partial().optional(),
    }).partial()).optional(),
});
/**
 * Deployment configuration schema
 */
exports.DeploymentConfigSchema = zod_1.z.object({
    environment: exports.EnvironmentSchema,
    services: zod_1.z.record(zod_1.z.string(), zod_1.z.object({
        enabled: zod_1.z.boolean(),
        instances: zod_1.z.number().min(1).max(10),
        memory: zod_1.z.string().regex(/^\d+[MG]B?$/),
        cpu: zod_1.z.number().min(0.1).max(8),
        env: zod_1.z.record(zod_1.z.string(), zod_1.z.string()),
        dependencies: zod_1.z.array(zod_1.z.string()),
        healthCheck: zod_1.z.object({
            endpoint: zod_1.z.string().optional(),
            timeout: zod_1.z.number().min(1000).max(30000),
            retries: zod_1.z.number().min(1).max(10),
            interval: zod_1.z.number().min(1000).max(60000),
            expectedStatus: zod_1.z.number().min(200).max(599).optional(),
        }),
    })),
    monitoring: zod_1.z.object({
        enabled: zod_1.z.boolean(),
        metricsPort: zod_1.z.number().min(1).max(65535),
        alerting: zod_1.z.object({
            enabled: zod_1.z.boolean(),
            channels: zod_1.z.array(zod_1.z.enum(["email", "slack", "webhook", "sms"])),
        }),
    }),
    backup: zod_1.z.object({
        enabled: zod_1.z.boolean(),
        schedule: zod_1.z.string(), // Cron expression
        retention: zod_1.z.object({
            days: zod_1.z.number().min(1).max(365),
            maxFiles: zod_1.z.number().min(1).max(1000),
        }),
        encryption: zod_1.z.object({
            enabled: zod_1.z.boolean(),
            algorithm: zod_1.z.enum(["AES-256-GCM", "AES-256-CBC"]),
        }),
    }),
});
/**
 * Service-specific configuration schemas
 */
exports.ServiceConfigSchemas = {
    "titan-brain": zod_1.z.object({
        port: zod_1.z.number().min(1).max(65535),
        logLevel: zod_1.z.enum(["debug", "info", "warn", "error"]),
        database: zod_1.z.object({
            host: zod_1.z.string(),
            port: zod_1.z.number().min(1).max(65535),
            name: zod_1.z.string(),
            user: zod_1.z.string(),
            password: zod_1.z.string(),
            ssl: zod_1.z.boolean(),
        }),
        redis: zod_1.z.object({
            url: zod_1.z.string(),
            keyPrefix: zod_1.z.string(),
        }),
    }),
    "titan-execution": zod_1.z.object({
        port: zod_1.z.number().min(1).max(65535),
        logLevel: zod_1.z.enum(["debug", "info", "warn", "error"]),
        rateLimiting: zod_1.z.object({
            enabled: zod_1.z.boolean(),
            requestsPerSecond: zod_1.z.number().min(1).max(100),
            burstSize: zod_1.z.number().min(1).max(1000),
        }),
        exchanges: zod_1.z.record(zod_1.z.string(), exports.ExchangeConfigSchema),
    }),
};
/**
 * Configuration validator class
 */
class ConfigValidator {
    /**
     * Validate configuration against schema
     */
    static validate(schema, data) {
        try {
            const result = schema.safeParse(data);
            if (result.success) {
                return {
                    valid: true,
                    errors: [],
                    warnings: [],
                    data: result.data,
                };
            }
            else {
                const errors = result.error.issues.map((err) => `${err.path.join(".")}: ${err.message}`);
                return {
                    valid: false,
                    errors,
                    warnings: [],
                };
            }
        }
        catch (error) {
            return {
                valid: false,
                errors: [
                    `Validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
                ],
                warnings: [],
            };
        }
    }
    /**
     * Validate brain configuration
     */
    static validateBrainConfig(data) {
        return this.validate(exports.BrainConfigSchema, data);
    }
    /**
     * Validate phase configuration
     */
    static validatePhaseConfig(data) {
        return this.validate(exports.PhaseConfigSchema, data);
    }
    /**
     * Validate infrastructure configuration
     */
    static validateInfrastructureConfig(data) {
        return this.validate(exports.InfrastructureConfigSchema, data);
    }
    /**
     * Validate deployment configuration
     */
    static validateDeploymentConfig(data) {
        return this.validate(exports.DeploymentConfigSchema, data);
    }
    /**
     * Validate service configuration
     */
    static validateServiceConfig(service, data) {
        const schema = exports.ServiceConfigSchemas[service];
        if (!schema) {
            return {
                valid: false,
                errors: [`No schema defined for service: ${service}`],
                warnings: [],
            };
        }
        return this.validate(schema, data);
    }
    /**
     * Get available service schemas
     */
    static getAvailableServiceSchemas() {
        return Object.keys(exports.ServiceConfigSchemas);
    }
}
exports.ConfigValidator = ConfigValidator;
//# sourceMappingURL=ConfigSchema.js.map