/**
 * Configuration Schema Definitions for Titan Production Deployment
 *
 * Provides comprehensive schema validation for all configuration types
 * across the Titan system with environment-specific support.
 *
 * Requirements: 3.1, 3.3 - Configuration schema validation and environment-specific loading
 */
import { z } from "zod";
/**
 * Environment types
 */
export declare const EnvironmentSchema: z.ZodEnum<{
    development: "development";
    staging: "staging";
    production: "production";
}>;
export type Environment = z.infer<typeof EnvironmentSchema>;
/**
 * Exchange configuration schema
 */
export declare const ExchangeConfigSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    executeOn: z.ZodBoolean;
    apiKey: z.ZodOptional<z.ZodString>;
    apiSecret: z.ZodOptional<z.ZodString>;
    testnet: z.ZodDefault<z.ZodBoolean>;
    rateLimit: z.ZodDefault<z.ZodNumber>;
    timeout: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
/**
 * Phase configuration schema
 */
export declare const PhaseConfigSchema: z.ZodObject<{
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
    }, z.core.$strip>>;
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
        }, z.core.$strip>>>>;
        parameters: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
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
    }, z.core.$strip>;
    overrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        enabled: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        maxLeverage: z.ZodOptional<z.ZodNumber>;
        maxDrawdown: z.ZodOptional<z.ZodNumber>;
        maxPositionSize: z.ZodOptional<z.ZodNumber>;
        riskPerTrade: z.ZodOptional<z.ZodNumber>;
        exchanges: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            enabled: z.ZodBoolean;
            executeOn: z.ZodBoolean;
            apiKey: z.ZodOptional<z.ZodString>;
            apiSecret: z.ZodOptional<z.ZodString>;
            testnet: z.ZodDefault<z.ZodBoolean>;
            rateLimit: z.ZodDefault<z.ZodNumber>;
            timeout: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>>>;
        parameters: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
        environments: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
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
            }, z.core.$strip>>>>;
            parameters: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
        }, z.core.$strip>>>>;
    }, z.core.$strip>>>;
    environments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        maxTotalLeverage: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        maxGlobalDrawdown: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        emergencyFlattenThreshold: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        phaseTransitionRules: z.ZodOptional<z.ZodOptional<z.ZodObject<{
            phase1ToPhase2: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
            phase2ToPhase3: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        }, z.core.$strip>>>;
        overrides: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            enabled: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
            maxLeverage: z.ZodOptional<z.ZodNumber>;
            maxDrawdown: z.ZodOptional<z.ZodNumber>;
            maxPositionSize: z.ZodOptional<z.ZodNumber>;
            riskPerTrade: z.ZodOptional<z.ZodNumber>;
            exchanges: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
                enabled: z.ZodBoolean;
                executeOn: z.ZodBoolean;
                apiKey: z.ZodOptional<z.ZodString>;
                apiSecret: z.ZodOptional<z.ZodString>;
                testnet: z.ZodDefault<z.ZodBoolean>;
                rateLimit: z.ZodDefault<z.ZodNumber>;
                timeout: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strip>>>;
            parameters: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
            environments: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
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
                }, z.core.$strip>>>>;
                parameters: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
            }, z.core.$strip>>>>;
        }, z.core.$strip>>>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
/**
 * Infrastructure configuration schema
 */
export declare const InfrastructureConfigSchema: z.ZodObject<{
    server: z.ZodObject<{
        minRAM: z.ZodString;
        minCPU: z.ZodNumber;
        minDisk: z.ZodString;
        operatingSystem: z.ZodString;
    }, z.core.$strip>;
    services: z.ZodObject<{
        nodejs: z.ZodObject<{
            version: z.ZodString;
            globalPackages: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        redis: z.ZodObject<{
            version: z.ZodString;
            port: z.ZodNumber;
            maxMemory: z.ZodString;
            maxMemoryPolicy: z.ZodString;
            bindAddress: z.ZodString;
        }, z.core.$strip>;
        nginx: z.ZodObject<{
            version: z.ZodString;
            enableGzip: z.ZodBoolean;
            clientMaxBodySize: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>;
    security: z.ZodObject<{
        firewall: z.ZodObject<{
            defaultIncoming: z.ZodEnum<{
                allow: "allow";
                deny: "deny";
            }>;
            defaultOutgoing: z.ZodEnum<{
                allow: "allow";
                deny: "deny";
            }>;
            allowedPorts: z.ZodArray<z.ZodObject<{
                port: z.ZodNumber;
                protocol: z.ZodEnum<{
                    tcp: "tcp";
                    udp: "udp";
                }>;
                comment: z.ZodString;
            }, z.core.$strip>>;
            restrictedPorts: z.ZodArray<z.ZodObject<{
                port: z.ZodNumber;
                protocol: z.ZodEnum<{
                    tcp: "tcp";
                    udp: "udp";
                }>;
                allowFrom: z.ZodString;
                comment: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        ssl: z.ZodObject<{
            enabled: z.ZodBoolean;
            domains: z.ZodArray<z.ZodString>;
            autoRenewal: z.ZodBoolean;
            email: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        fail2ban: z.ZodObject<{
            enabled: z.ZodBoolean;
            banTime: z.ZodNumber;
            findTime: z.ZodNumber;
            maxRetry: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    environments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        server: z.ZodOptional<z.ZodOptional<z.ZodObject<{
            minRAM: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            minCPU: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
            minDisk: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, z.core.$strip>>>;
        security: z.ZodOptional<z.ZodOptional<z.ZodObject<{
            ssl: z.ZodOptional<z.ZodOptional<z.ZodObject<{
                enabled: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
                domains: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString>>>;
            }, z.core.$strip>>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
/**
 * Deployment configuration schema
 */
export declare const DeploymentConfigSchema: z.ZodObject<{
    environment: z.ZodEnum<{
        development: "development";
        staging: "staging";
        production: "production";
    }>;
    services: z.ZodRecord<z.ZodString, z.ZodObject<{
        enabled: z.ZodBoolean;
        instances: z.ZodNumber;
        memory: z.ZodString;
        cpu: z.ZodNumber;
        env: z.ZodRecord<z.ZodString, z.ZodString>;
        dependencies: z.ZodArray<z.ZodString>;
        healthCheck: z.ZodObject<{
            endpoint: z.ZodOptional<z.ZodString>;
            timeout: z.ZodNumber;
            retries: z.ZodNumber;
            interval: z.ZodNumber;
            expectedStatus: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    monitoring: z.ZodObject<{
        enabled: z.ZodBoolean;
        metricsPort: z.ZodNumber;
        alerting: z.ZodObject<{
            enabled: z.ZodBoolean;
            channels: z.ZodArray<z.ZodEnum<{
                email: "email";
                slack: "slack";
                webhook: "webhook";
                sms: "sms";
            }>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    backup: z.ZodObject<{
        enabled: z.ZodBoolean;
        schedule: z.ZodString;
        retention: z.ZodObject<{
            days: z.ZodNumber;
            maxFiles: z.ZodNumber;
        }, z.core.$strip>;
        encryption: z.ZodObject<{
            enabled: z.ZodBoolean;
            algorithm: z.ZodEnum<{
                "AES-256-GCM": "AES-256-GCM";
                "AES-256-CBC": "AES-256-CBC";
            }>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
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
export type ExchangeConfig = z.infer<typeof ExchangeConfigSchema>;
//# sourceMappingURL=ConfigSchema.d.ts.map