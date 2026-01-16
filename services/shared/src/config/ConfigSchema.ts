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
export const EnvironmentSchema = z.enum([
  "development",
  "staging",
  "production",
]);
export type Environment = z.infer<typeof EnvironmentSchema>;

/**
 * Exchange configuration schema
 */
export const ExchangeConfigSchema = z.object({
  enabled: z.boolean(),
  executeOn: z.boolean(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  testnet: z.boolean().default(false),
  rateLimit: z.number().min(1).max(100).default(10),
  timeout: z.number().min(1000).max(30000).default(5000),
});

/**
 * Phase configuration schema
 */
export const PhaseConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxLeverage: z.number().min(1).max(200),
  maxDrawdown: z.number().min(0.01).max(1),
  maxPositionSize: z.number().min(0.01).max(1),
  riskPerTrade: z.number().min(0.001).max(0.1),
  exchanges: z.record(z.string(), ExchangeConfigSchema),
  parameters: z.record(z.string(), z.unknown()).optional(),

  // Environment-specific overrides
  environments: z.record(
    z.string(),
    z.object({
      maxLeverage: z.number().min(1).max(200).optional(),
      maxDrawdown: z.number().min(0.01).max(1).optional(),
      maxPositionSize: z.number().min(0.01).max(1).optional(),
      riskPerTrade: z.number().min(0.001).max(0.1).optional(),
      exchanges: z.record(z.string(), ExchangeConfigSchema.partial())
        .optional(),
      parameters: z.record(z.string(), z.unknown()).optional(),
    }).partial(),
  ).optional(),
});

/**
 * Brain configuration schema
 */
export const BrainConfigSchema = z.object({
  maxTotalLeverage: z.number().min(1).max(500),
  maxGlobalDrawdown: z.number().min(0.01).max(1),
  emergencyFlattenThreshold: z.number().min(0.01).max(1),

  phaseTransitionRules: z.object({
    phase1ToPhase2: z.number().min(100),
    phase2ToPhase3: z.number().min(1000),
  }),

  // Global overrides for all phases
  overrides: z.record(z.string(), PhaseConfigSchema.partial()).optional(),

  // Environment-specific brain settings
  environments: z.record(
    z.string(),
    z.object({
      maxTotalLeverage: z.number().min(1).max(500).optional(),
      maxGlobalDrawdown: z.number().min(0.01).max(1).optional(),
      emergencyFlattenThreshold: z.number().min(0.01).max(1).optional(),
      phaseTransitionRules: z.object({
        phase1ToPhase2: z.number().min(100).optional(),
        phase2ToPhase3: z.number().min(1000).optional(),
      }).partial().optional(),
      overrides: z.record(z.string(), PhaseConfigSchema.partial()).optional(),
    }).partial(),
  ).optional(),
});

/**
 * Infrastructure configuration schema
 */
export const InfrastructureConfigSchema = z.object({
  server: z.object({
    minRAM: z.string().regex(/^\d+GB$/),
    minCPU: z.number().min(1),
    minDisk: z.string().regex(/^\d+GB$/),
    operatingSystem: z.string(),
  }),

  services: z.object({
    nodejs: z.object({
      version: z.string(),
      globalPackages: z.array(z.string()),
    }),
    redis: z.object({
      version: z.string(),
      port: z.number().min(1).max(65535),
      maxMemory: z.string(),
      maxMemoryPolicy: z.string(),
      bindAddress: z.string(),
    }),
    nginx: z.object({
      version: z.string(),
      enableGzip: z.boolean(),
      clientMaxBodySize: z.string(),
    }),
  }),

  security: z.object({
    firewall: z.object({
      defaultIncoming: z.enum(["allow", "deny"]),
      defaultOutgoing: z.enum(["allow", "deny"]),
      allowedPorts: z.array(z.object({
        port: z.number().min(1).max(65535),
        protocol: z.enum(["tcp", "udp"]),
        comment: z.string(),
      })),
      restrictedPorts: z.array(z.object({
        port: z.number().min(1).max(65535),
        protocol: z.enum(["tcp", "udp"]),
        allowFrom: z.string(),
        comment: z.string(),
      })),
    }),

    ssl: z.object({
      enabled: z.boolean(),
      domains: z.array(z.string()),
      autoRenewal: z.boolean(),
      email: z.string().email().optional(),
    }),

    fail2ban: z.object({
      enabled: z.boolean(),
      banTime: z.number().min(60),
      findTime: z.number().min(60),
      maxRetry: z.number().min(1),
    }),
  }),

  // Environment-specific infrastructure settings
  environments: z.record(
    z.string(),
    z.object({
      server: z.object({
        minRAM: z.string().regex(/^\d+GB$/).optional(),
        minCPU: z.number().min(1).optional(),
        minDisk: z.string().regex(/^\d+GB$/).optional(),
      }).partial().optional(),
      security: z.object({
        ssl: z.object({
          enabled: z.boolean().optional(),
          domains: z.array(z.string()).optional(),
        }).partial().optional(),
      }).partial().optional(),
    }).partial(),
  ).optional(),
});

/**
 * Deployment configuration schema
 */
export const DeploymentConfigSchema = z.object({
  environment: EnvironmentSchema,

  services: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      instances: z.number().min(1).max(10),
      memory: z.string().regex(/^\d+[MG]B?$/),
      cpu: z.number().min(0.1).max(8),
      env: z.record(z.string(), z.string()),
      dependencies: z.array(z.string()),

      healthCheck: z.object({
        endpoint: z.string().optional(),
        timeout: z.number().min(1000).max(30000),
        retries: z.number().min(1).max(10),
        interval: z.number().min(1000).max(60000),
        expectedStatus: z.number().min(200).max(599).optional(),
      }),
    }),
  ),

  monitoring: z.object({
    enabled: z.boolean(),
    metricsPort: z.number().min(1).max(65535),
    alerting: z.object({
      enabled: z.boolean(),
      channels: z.array(z.enum(["email", "slack", "webhook", "sms"])),
    }),
  }),

  backup: z.object({
    enabled: z.boolean(),
    schedule: z.string(), // Cron expression
    retention: z.object({
      days: z.number().min(1).max(365),
      maxFiles: z.number().min(1).max(1000),
    }),
    encryption: z.object({
      enabled: z.boolean(),
      algorithm: z.enum(["AES-256-GCM", "AES-256-CBC"]),
    }),
  }),
});

/**
 * Service-specific configuration schemas
 */
export const ServiceConfigSchemas: Record<string, z.ZodSchema<any>> = {
  "titan-brain": z.object({
    port: z.number().min(1).max(65535),
    logLevel: z.enum(["debug", "info", "warn", "error"]),
    database: z.object({
      host: z.string(),
      port: z.number().min(1).max(65535),
      name: z.string(),
      user: z.string(),
      password: z.string(),
      ssl: z.boolean(),
    }),
    redis: z.object({
      url: z.string(),
      keyPrefix: z.string(),
    }),
  }),
  // titan-execution-rs uses Rust-native configuration
};

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
export class ConfigValidator {
  /**
   * Validate configuration against schema
   */
  static validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult {
    try {
      const result = schema.safeParse(data);

      if (result.success) {
        return {
          valid: true,
          errors: [],
          warnings: [],
          data: result.data,
        };
      } else {
        const errors = result.error.issues.map((err) =>
          `${err.path.join(".")}: ${err.message}`
        );

        return {
          valid: false,
          errors,
          warnings: [],
        };
      }
    } catch (error) {
      return {
        valid: false,
        errors: [
          `Validation error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        ],
        warnings: [],
      };
    }
  }

  /**
   * Validate brain configuration
   */
  static validateBrainConfig(data: unknown): ValidationResult {
    return this.validate(BrainConfigSchema, data);
  }

  /**
   * Validate phase configuration
   */
  static validatePhaseConfig(data: unknown): ValidationResult {
    return this.validate(PhaseConfigSchema, data);
  }

  /**
   * Validate infrastructure configuration
   */
  static validateInfrastructureConfig(data: unknown): ValidationResult {
    return this.validate(InfrastructureConfigSchema, data);
  }

  /**
   * Validate deployment configuration
   */
  static validateDeploymentConfig(data: unknown): ValidationResult {
    return this.validate(DeploymentConfigSchema, data);
  }

  /**
   * Validate service configuration
   */
  static validateServiceConfig(
    service: string,
    data: unknown,
  ): ValidationResult {
    const schema = ServiceConfigSchemas[service];

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
  static getAvailableServiceSchemas(): string[] {
    return Object.keys(ServiceConfigSchemas);
  }
}

/**
 * Type exports for use in other modules
 */
export type PhaseConfig = z.infer<typeof PhaseConfigSchema>;
export type BrainConfig = z.infer<typeof BrainConfigSchema>;
export type InfrastructureConfig = z.infer<typeof InfrastructureConfigSchema>;
export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;
export type ExchangeConfig = z.infer<typeof ExchangeConfigSchema>;
