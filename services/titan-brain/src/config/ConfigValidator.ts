/**
 * ConfigValidator - Environment variable validation for Railway deployment
 * 
 * Validates all required and optional environment variables with proper
 * error messages and type checking for Railway deployment.
 * 
 * Requirements: 1.3.1, 1.3.2, 1.3.3, 1.3.4, 1.3.5
 */

import { Logger } from '../logging/Logger.js';

/**
 * Configuration validation rule
 */
export interface ValidationRule {
  name: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'url' | 'port' | 'enum';
  defaultValue?: string | number | boolean;
  enumValues?: string[];
  minValue?: number;
  maxValue?: number;
  pattern?: RegExp;
  description: string;
}

/**
 * Validation result for a single variable
 */
export interface VariableValidationResult {
  name: string;
  value: string | number | boolean | undefined;
  valid: boolean;
  error?: string;
  warning?: string;
  usingDefault: boolean;
}

/**
 * Overall validation result
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  variables: VariableValidationResult[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    warnings: number;
    usingDefaults: number;
  };
}

/**
 * Configuration validator for environment variables
 */
export class ConfigValidator {
  private rules: Map<string, ValidationRule> = new Map();
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? Logger.getInstance('config-validator');
    this.initializeDefaultRules();
  }

  /**
   * Initialize default validation rules for Titan Brain
   */
  private initializeDefaultRules(): void {
    const defaultRules: ValidationRule[] = [
      // Core application settings
      {
        name: 'NODE_ENV',
        required: true,
        type: 'enum',
        enumValues: ['development', 'production', 'test'],
        defaultValue: 'production',
        description: 'Node.js environment mode'
      },
      {
        name: 'PORT',
        required: true,
        type: 'port',
        defaultValue: 3000,
        description: 'HTTP server port'
      },
      {
        name: 'HOST',
        required: false,
        type: 'string',
        defaultValue: '0.0.0.0',
        description: 'HTTP server host'
      },

      // Database configuration
      {
        name: 'DATABASE_URL',
        required: true,
        type: 'url',
        description: 'PostgreSQL database connection URL'
      },
      {
        name: 'DATABASE_POOL_MIN',
        required: false,
        type: 'number',
        defaultValue: 2,
        minValue: 1,
        maxValue: 50,
        description: 'Minimum database connection pool size'
      },
      {
        name: 'DATABASE_POOL_MAX',
        required: false,
        type: 'number',
        defaultValue: 10,
        minValue: 1,
        maxValue: 100,
        description: 'Maximum database connection pool size'
      },

      // Redis configuration (optional)
      {
        name: 'REDIS_URL',
        required: false,
        type: 'url',
        description: 'Redis connection URL (optional, falls back to in-memory cache)'
      },

      // Security configuration
      {
        name: 'HMAC_SECRET',
        required: false,
        type: 'string',
        description: 'HMAC secret for webhook signature verification'
      },
      {
        name: 'HMAC_ALGORITHM',
        required: false,
        type: 'enum',
        enumValues: ['sha256', 'sha512'],
        defaultValue: 'sha256',
        description: 'HMAC algorithm for signature verification'
      },

      // Logging configuration
      {
        name: 'LOG_LEVEL',
        required: false,
        type: 'enum',
        enumValues: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
        defaultValue: 'info',
        description: 'Logging level'
      },

      // Rate limiting configuration
      {
        name: 'RATE_LIMIT_WINDOW_MS',
        required: false,
        type: 'number',
        defaultValue: 60000,
        minValue: 1000,
        maxValue: 3600000,
        description: 'Rate limiting window in milliseconds'
      },
      {
        name: 'RATE_LIMIT_MAX_REQUESTS',
        required: false,
        type: 'number',
        defaultValue: 100,
        minValue: 1,
        maxValue: 10000,
        description: 'Maximum requests per rate limiting window'
      },

      // Health check configuration
      {
        name: 'HEALTH_CHECK_INTERVAL',
        required: false,
        type: 'number',
        defaultValue: 30000,
        minValue: 5000,
        maxValue: 300000,
        description: 'Health check interval in milliseconds'
      },

      // Service discovery configuration
      {
        name: 'PHASE1_SERVICE_URL',
        required: false,
        type: 'url',
        description: 'Phase 1 (Scavenger) service URL'
      },
      {
        name: 'PHASE2_SERVICE_URL',
        required: false,
        type: 'url',
        description: 'Phase 2 (Hunter) service URL'
      },
      {
        name: 'PHASE3_SERVICE_URL',
        required: false,
        type: 'url',
        description: 'Phase 3 (Sentinel) service URL'
      },

      // Railway-specific configuration
      {
        name: 'RAILWAY_ENVIRONMENT',
        required: false,
        type: 'string',
        description: 'Railway environment name'
      },
      {
        name: 'RAILWAY_SERVICE_NAME',
        required: false,
        type: 'string',
        description: 'Railway service name'
      },

      // CORS configuration
      {
        name: 'CORS_ORIGINS',
        required: false,
        type: 'string',
        defaultValue: '*',
        description: 'CORS allowed origins (comma-separated)'
      },

      // Startup configuration
      {
        name: 'STARTUP_TIMEOUT',
        required: false,
        type: 'number',
        defaultValue: 60000,
        minValue: 10000,
        maxValue: 300000,
        description: 'Maximum startup time in milliseconds'
      },
      {
        name: 'SHUTDOWN_TIMEOUT',
        required: false,
        type: 'number',
        defaultValue: 10000,
        minValue: 1000,
        maxValue: 60000,
        description: 'Graceful shutdown timeout in milliseconds'
      }
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.name, rule);
    }
  }

  /**
   * Add a custom validation rule
   */
  addRule(rule: ValidationRule): void {
    this.rules.set(rule.name, rule);
  }

  /**
   * Remove a validation rule
   */
  removeRule(name: string): void {
    this.rules.delete(name);
  }

  /**
   * Validate all environment variables
   */
  validate(): ConfigValidationResult {
    const variables: VariableValidationResult[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    this.logger.info('Starting environment variable validation', undefined, {
      totalRules: this.rules.size
    });

    for (const rule of this.rules.values()) {
      const result = this.validateVariable(rule);
      variables.push(result);

      if (!result.valid && result.error) {
        errors.push(result.error);
      }

      if (result.warning) {
        warnings.push(result.warning);
      }
    }

    const summary = {
      total: variables.length,
      valid: variables.filter(v => v.valid).length,
      invalid: variables.filter(v => !v.valid).length,
      warnings: variables.filter(v => v.warning).length,
      usingDefaults: variables.filter(v => v.usingDefault).length
    };

    const validationResult: ConfigValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
      variables,
      summary
    };

    this.logger.info('Environment variable validation completed', undefined, {
      valid: validationResult.valid,
      errors: errors.length,
      warnings: warnings.length,
      usingDefaults: summary.usingDefaults
    });

    return validationResult;
  }

  /**
   * Validate a single environment variable
   */
  private validateVariable(rule: ValidationRule): VariableValidationResult {
    const rawValue = process.env[rule.name];
    let value: string | number | boolean | undefined = rawValue;
    let valid = true;
    let error: string | undefined;
    let warning: string | undefined;
    let usingDefault = false;

    // Check if variable is missing
    if (rawValue === undefined || rawValue === '') {
      if (rule.required) {
        if (rule.defaultValue !== undefined) {
          value = rule.defaultValue;
          usingDefault = true;
          warning = `Using default value for required variable ${rule.name}: ${rule.defaultValue}`;
        } else {
          valid = false;
          error = `Required environment variable ${rule.name} is not set`;
          return { name: rule.name, value, valid, error, warning, usingDefault };
        }
      } else if (rule.defaultValue !== undefined) {
        value = rule.defaultValue;
        usingDefault = true;
      } else {
        // Optional variable with no default
        return { name: rule.name, value: undefined, valid: true, warning, usingDefault };
      }
    }

    // Type validation and conversion
    if (value !== undefined) {
      const typeValidation = this.validateType(rule, String(value));
      if (!typeValidation.valid) {
        valid = false;
        error = typeValidation.error;
      } else {
        value = typeValidation.value;
      }
    }

    return { name: rule.name, value, valid, error, warning, usingDefault };
  }

  /**
   * Validate and convert value based on type
   */
  private validateType(rule: ValidationRule, rawValue: string): {
    valid: boolean;
    value: string | number | boolean;
    error?: string;
  } {
    switch (rule.type) {
      case 'string':
        return this.validateString(rule, rawValue);
      case 'number':
        return this.validateNumber(rule, rawValue);
      case 'boolean':
        return this.validateBoolean(rule, rawValue);
      case 'url':
        return this.validateUrl(rule, rawValue);
      case 'port':
        return this.validatePort(rule, rawValue);
      case 'enum':
        return this.validateEnum(rule, rawValue);
      default:
        return {
          valid: false,
          value: rawValue,
          error: `Unknown validation type: ${rule.type}`
        };
    }
  }

  /**
   * Validate string type
   */
  private validateString(rule: ValidationRule, value: string): {
    valid: boolean;
    value: string;
    error?: string;
  } {
    if (rule.pattern && !rule.pattern.test(value)) {
      return {
        valid: false,
        value,
        error: `${rule.name} does not match required pattern`
      };
    }

    return { valid: true, value };
  }

  /**
   * Validate number type
   */
  private validateNumber(rule: ValidationRule, value: string): {
    valid: boolean;
    value: number;
    error?: string;
  } {
    const numValue = Number(value);

    if (isNaN(numValue)) {
      return {
        valid: false,
        value: numValue,
        error: `${rule.name} must be a valid number, got: ${value}`
      };
    }

    if (rule.minValue !== undefined && numValue < rule.minValue) {
      return {
        valid: false,
        value: numValue,
        error: `${rule.name} must be >= ${rule.minValue}, got: ${numValue}`
      };
    }

    if (rule.maxValue !== undefined && numValue > rule.maxValue) {
      return {
        valid: false,
        value: numValue,
        error: `${rule.name} must be <= ${rule.maxValue}, got: ${numValue}`
      };
    }

    return { valid: true, value: numValue };
  }

  /**
   * Validate boolean type
   */
  private validateBoolean(rule: ValidationRule, value: string): {
    valid: boolean;
    value: boolean;
    error?: string;
  } {
    const lowerValue = value.toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(lowerValue)) {
      return { valid: true, value: true };
    }

    if (['false', '0', 'no', 'off'].includes(lowerValue)) {
      return { valid: true, value: false };
    }

    return {
      valid: false,
      value: false,
      error: `${rule.name} must be a boolean value (true/false, 1/0, yes/no, on/off), got: ${value}`
    };
  }

  /**
   * Validate URL type
   */
  private validateUrl(rule: ValidationRule, value: string): {
    valid: boolean;
    value: string;
    error?: string;
  } {
    try {
      new URL(value);
      return { valid: true, value };
    } catch {
      return {
        valid: false,
        value,
        error: `${rule.name} must be a valid URL, got: ${value}`
      };
    }
  }

  /**
   * Validate port type
   */
  private validatePort(rule: ValidationRule, value: string): {
    valid: boolean;
    value: number;
    error?: string;
  } {
    const numValue = Number(value);

    if (isNaN(numValue)) {
      return {
        valid: false,
        value: numValue,
        error: `${rule.name} must be a valid port number, got: ${value}`
      };
    }

    if (numValue < 1 || numValue > 65535) {
      return {
        valid: false,
        value: numValue,
        error: `${rule.name} must be a valid port number (1-65535), got: ${numValue}`
      };
    }

    return { valid: true, value: numValue };
  }

  /**
   * Validate enum type
   */
  private validateEnum(rule: ValidationRule, value: string): {
    valid: boolean;
    value: string;
    error?: string;
  } {
    if (!rule.enumValues || !rule.enumValues.includes(value)) {
      return {
        valid: false,
        value,
        error: `${rule.name} must be one of: ${rule.enumValues?.join(', ')}, got: ${value}`
      };
    }

    return { valid: true, value };
  }

  /**
   * Get configuration summary with masked sensitive values
   */
  getConfigSummary(): Record<string, string> {
    const summary: Record<string, string> = {};
    const sensitivePatterns = [
      /secret/i,
      /password/i,
      /key/i,
      /token/i,
      /auth/i,
      /credential/i
    ];

    for (const rule of this.rules.values()) {
      const value = process.env[rule.name];
      const isSensitive = sensitivePatterns.some(pattern => pattern.test(rule.name));

      if (value === undefined) {
        summary[rule.name] = '[NOT SET]';
      } else if (isSensitive) {
        summary[rule.name] = '[CONFIGURED]';
      } else {
        summary[rule.name] = value;
      }
    }

    return summary;
  }

  /**
   * Get all validation rules
   */
  getRules(): ValidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a specific validation rule
   */
  getRule(name: string): ValidationRule | undefined {
    return this.rules.get(name);
  }
}