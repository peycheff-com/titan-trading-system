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
export const EnvironmentSchema = z.enum(['development', 'staging', 'production']);
export type Environment = z.infer<typeof EnvironmentSchema>;

/**
 * Exchange configuration schema
 */
export const ExchangeConfigBase = z.object({
  enabled: z.boolean(),
  executeOn: z.boolean(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  testnet: z.boolean().default(false),
  rateLimit: z.number().min(1).max(100).default(10),
  timeout: z.number().min(1000).max(30000).default(5000),
});

export const PartialExchangeConfigSchema = ExchangeConfigBase.partial();

export const ExchangeConfigSchema = ExchangeConfigBase.refine(
  (data) => {
    if (data.enabled && data.executeOn) {
      return !!data.apiKey && !!data.apiSecret;
    }
    return true;
  },
  {
    message: 'API Key and Secret are required when execution is enabled',
    path: ['apiKey'],
  },
);

/**
 * Phase configuration schema
 */
/**
 * Phase configuration schema base (unrefined)
 * Exported for extension by specific phases
 */
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
          exchanges: z.record(z.string(), ExchangeConfigBase.partial()).optional(),
          parameters: z.record(z.string(), z.unknown()).optional(),
        })
        .partial(),
    )
    .optional(),
});

export const PhaseConfigSchema = PhaseConfigBaseSchema.superRefine((data, ctx) => {
  // Validate exchanges: If executeOn is true, keys must be present
  Object.entries(data.exchanges).forEach(([name, config]) => {
    if (config.enabled && config.executeOn) {
      if (!config.apiKey || !config.apiSecret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `API Key and Secret are required for exchange '${name}' when execution is enabled`,
          path: ['exchanges', name, 'apiKey'],
        });
      }
    }
  });
});

/**
 * Brain configuration schema
 */
/**
 * Schema for Phase Configuration Overrides (Deep Partial)
 * Allows overriding individual properties including partial exchange configs
 */
export const PhaseConfigOverridesSchema = z.object({
  enabled: z.boolean().optional(),
  maxLeverage: z.number().min(1).max(200).optional(),
  maxDrawdown: z.number().min(0.01).max(1).optional(),
  maxPositionSize: z.number().min(0.01).max(1).optional(),
  riskPerTrade: z.number().min(0.001).max(0.1).optional(),
  exchanges: z.record(z.string(), PartialExchangeConfigSchema).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  environments: z.record(z.string(), z.any()).optional(), // Avoid deep recursion issues in overrides
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
  overrides: z.record(z.string(), PhaseConfigOverridesSchema).optional(),

  // Environment-specific brain settings
  environments: z
    .record(
      z.string(),
      z
        .object({
          maxTotalLeverage: z.number().min(1).max(500).optional(),
          maxGlobalDrawdown: z.number().min(0.01).max(1).optional(),
          emergencyFlattenThreshold: z.number().min(0.01).max(1).optional(),
          phaseTransitionRules: z
            .object({
              phase1ToPhase2: z.number().min(100).optional(),
              phase2ToPhase3: z.number().min(1000).optional(),
            })
            .partial()
            .optional(),
          overrides: z.record(z.string(), PhaseConfigOverridesSchema).optional(),
        })
        .partial(),
    )
    .optional(),
});

/**
 * Infrastructure configuration schema
 */
export const InfrastructureConfigSchema = z.object({
  infrastructure: z.object({
    requirements: z.object({
      minRAM: z.string(),
      minCPU: z.number(),
      minDisk: z.string(),
      operatingSystem: z.string(),
    }),
    dependencies: z.object({
      nodejs: z.object({
        version: z.string(),
        globalPackages: z.array(z.string()),
      }),
      redis: z.object({
        version: z.string(),
        port: z.number().or(z.string()),
        maxMemory: z.string(),
        maxMemoryPolicy: z.string(),
        bindAddress: z.string(),
      }),
      nginx: z.object({
        version: z.string(),
        enableGzip: z.boolean(),
        clientMaxBodySize: z.string(),
      }),
      certbot: z
        .object({
          email: z.string(),
          domains: z.array(z.string()),
          autoRenewal: z.boolean(),
        })
        .optional(),
    }),
    security: z.object({
      firewall: z.object({
        defaultIncoming: z.string(),
        defaultOutgoing: z.string(),
        allowedPorts: z.array(
          z.object({
            port: z.number(),
            protocol: z.string(),
            comment: z.string(),
          }),
        ),
        restrictedPorts: z
          .array(
            z.object({
              port: z.number(),
              protocol: z.string(),
              allowFrom: z.string(),
              comment: z.string(),
            }),
          )
          .optional(),
      }),
      fail2ban: z.object({
        enabled: z.boolean(),
        banTime: z.number(),
        findTime: z.number(),
        maxRetry: z.number(),
        jails: z
          .array(
            z.object({
              name: z.string(),
              enabled: z.boolean(),
              port: z.string(),
              filter: z.string(),
              logPath: z.string(),
              maxRetry: z.number().optional(),
            }),
          )
          .optional(),
      }),
      automaticUpdates: z
        .object({
          enabled: z.boolean(),
          securityOnly: z.boolean(),
          autoReboot: z.boolean(),
          rebootTime: z.string(),
        })
        .optional(),
    }),
    systemLimits: z.any().optional(),
    directories: z.any().optional(),
    monitoring: z.any().optional(),
  }),
  deployment: z.any().optional(),
  validation: z.any().optional(),
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
      channels: z.array(z.enum(['email', 'slack', 'webhook', 'sms'])),
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
      algorithm: z.enum(['AES-256-GCM', 'AES-256-CBC']),
    }),
  }),
});

/**
 * Service-specific configuration schemas
 */
export const ServiceConfigSchemas: Record<string, z.ZodSchema<any>> = {
  'titan-brain': z.object({
    port: z.number().min(1).max(65535).or(z.string()),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']),
    database: z.object({
      host: z.string(),
      port: z.number().min(1).max(65535).or(z.string()),
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
        const errors = result.error.issues.map((err) => `${err.path.join('.')}: ${err.message}`);

        return {
          valid: false,
          errors,
          warnings: [],
        };
      }
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
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
  static validateServiceConfig(service: string, data: unknown): ValidationResult {
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
   * Validate configuration against schema and throw if invalid
   */
  static validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown, context: string): T {
    const result = this.validate(schema, data);
    if (!result.valid) {
      throw new Error(`Invalid ${context} configuration: ${result.errors.join(', ')}`);
    }
    return result.data;
  }

  /**
   * Validate brain configuration and throw if invalid
   */
  static validateBrainConfigOrThrow(data: unknown): BrainConfig {
    return this.validateOrThrow(BrainConfigSchema, data, 'brain');
  }

  /**
   * Validate phase configuration and throw if invalid
   */
  static validatePhaseConfigOrThrow(data: unknown): PhaseConfig {
    return this.validateOrThrow(PhaseConfigSchema, data, 'phase') as PhaseConfig;
  }

  /**
   * Validate infrastructure configuration and throw if invalid
   */
  static validateInfrastructureConfigOrThrow(data: unknown): InfrastructureConfig {
    return this.validateOrThrow(InfrastructureConfigSchema, data, 'infrastructure');
  }

  /**
   * Validate deployment configuration and throw if invalid
   */
  static validateDeploymentConfigOrThrow(data: unknown): DeploymentConfig {
    return this.validateOrThrow(DeploymentConfigSchema, data, 'deployment');
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
// Explicitly partial schema to avoid inference issues

// ... existing code ...

export type PhaseConfig = z.infer<typeof PhaseConfigSchema>;
export type BrainConfig = z.infer<typeof BrainConfigSchema>;
export type InfrastructureConfig = z.infer<typeof InfrastructureConfigSchema>;
export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;
// Infer type from Base to ensure compatibility with partials structure
export type ExchangeConfig = z.infer<typeof ExchangeConfigBase>;
