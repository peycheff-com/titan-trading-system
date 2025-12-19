/**
 * Guardrails - Safety Validation
 * 
 * Enforces parameter bounds and validates proposal
 * structure against config schema to prevent dangerous
 * configurations and AI hallucinations.
 * 
 * Requirements: 2.3, 2.4, 2.5, 2.6
 */

import { z } from 'zod';
import { OptimizationProposal } from '../types';
import { ConfigSchema } from '../config/ConfigSchema';

/**
 * Parameter bounds for safety validation
 * Requirements: 2.5 - Maximum leverage of 20, maximum stop loss of 0.05,
 * and maximum risk per trade of 0.05
 */
export const PARAMETER_BOUNDS: Record<string, { min: number; max: number }> = {
  'max_leverage': { min: 1, max: 20 },
  'stop_loss': { min: 0.001, max: 0.05 },
  'risk_per_trade': { min: 0.001, max: 0.05 },
  'take_profit': { min: 0.005, max: 0.20 },
  'trailing_stop': { min: 0.001, max: 0.05 },
  'min_confidence': { min: 0, max: 1 },
  'cooldown_period': { min: 0, max: 3600 },
  'max_daily_loss': { min: 0.01, max: 0.20 },
  'max_position_size': { min: 0.1, max: 1.0 },
  'max_open_positions': { min: 1, max: 10 },
  'emergency_flatten_threshold': { min: 0.05, max: 0.30 },
  'latency_penalty': { min: 0, max: 1000 },
  'max_fill_time': { min: 100, max: 5000 },
};

/**
 * Valid config keys that can be modified
 */
const VALID_CONFIG_KEYS = new Set([
  // Trap config keys (for each trap type)
  'traps.oi_wipeout.enabled',
  'traps.oi_wipeout.stop_loss',
  'traps.oi_wipeout.take_profit',
  'traps.oi_wipeout.trailing_stop',
  'traps.oi_wipeout.risk_per_trade',
  'traps.oi_wipeout.max_leverage',
  'traps.oi_wipeout.min_confidence',
  'traps.oi_wipeout.cooldown_period',
  'traps.funding_spike.enabled',
  'traps.funding_spike.stop_loss',
  'traps.funding_spike.take_profit',
  'traps.funding_spike.trailing_stop',
  'traps.funding_spike.risk_per_trade',
  'traps.funding_spike.max_leverage',
  'traps.funding_spike.min_confidence',
  'traps.funding_spike.cooldown_period',
  'traps.liquidity_sweep.enabled',
  'traps.liquidity_sweep.stop_loss',
  'traps.liquidity_sweep.take_profit',
  'traps.liquidity_sweep.trailing_stop',
  'traps.liquidity_sweep.risk_per_trade',
  'traps.liquidity_sweep.max_leverage',
  'traps.liquidity_sweep.min_confidence',
  'traps.liquidity_sweep.cooldown_period',
  'traps.volatility_spike.enabled',
  'traps.volatility_spike.stop_loss',
  'traps.volatility_spike.take_profit',
  'traps.volatility_spike.trailing_stop',
  'traps.volatility_spike.risk_per_trade',
  'traps.volatility_spike.max_leverage',
  'traps.volatility_spike.min_confidence',
  'traps.volatility_spike.cooldown_period',
  // Risk config keys
  'risk.max_daily_loss',
  'risk.max_position_size',
  'risk.max_open_positions',
  'risk.emergency_flatten_threshold',
  // Execution config keys
  'execution.latency_penalty',
  'execution.slippage_model',
  'execution.limit_chaser_enabled',
  'execution.max_fill_time',
]);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Guardrails class for safety validation
 * Prevents dangerous configurations and AI hallucinations
 */
export class Guardrails {
  private configSchema: z.ZodSchema;

  constructor(configSchema?: z.ZodSchema) {
    this.configSchema = configSchema || ConfigSchema;
  }

  /**
   * Validate proposal against bounds and schema
   * Requirements: 2.3, 2.4, 2.5, 2.6
   */
  validateProposal(proposal: OptimizationProposal): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields exist
    if (!proposal.targetKey) {
      errors.push('Missing required field: targetKey');
    }
    if (proposal.suggestedValue === undefined) {
      errors.push('Missing required field: suggestedValue');
    }
    if (!proposal.reasoning) {
      errors.push('Missing required field: reasoning');
    }
    if (!proposal.expectedImpact) {
      errors.push('Missing required field: expectedImpact');
    } else {
      if (proposal.expectedImpact.pnlImprovement === undefined) {
        errors.push('Missing required field: expectedImpact.pnlImprovement');
      }
      if (proposal.expectedImpact.riskChange === undefined) {
        errors.push('Missing required field: expectedImpact.riskChange');
      }
      if (proposal.expectedImpact.confidenceScore === undefined) {
        errors.push('Missing required field: expectedImpact.confidenceScore');
      }
    }

    // If basic structure is invalid, return early
    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }

    // Validate schema (key exists in config)
    if (!this.validateSchema(proposal)) {
      errors.push(`Invalid targetKey: "${proposal.targetKey}" does not exist in config schema`);
    }

    // Validate bounds
    if (!this.checkBounds(proposal.targetKey, proposal.suggestedValue)) {
      const paramName = this.extractParameterName(proposal.targetKey);
      const bounds = PARAMETER_BOUNDS[paramName];
      if (bounds) {
        errors.push(
          `Value ${proposal.suggestedValue} for "${proposal.targetKey}" exceeds bounds [${bounds.min}, ${bounds.max}]`
        );
      } else {
        errors.push(`Invalid value type for "${proposal.targetKey}"`);
      }
    }

    // Validate value type matches expected type
    const typeValidation = this.validateValueType(proposal.targetKey, proposal.suggestedValue);
    if (!typeValidation.valid) {
      errors.push(typeValidation.error!);
    }

    // Add warnings for high-risk changes
    if (proposal.expectedImpact) {
      if (proposal.expectedImpact.riskChange > 10) {
        warnings.push(`High risk change: ${proposal.expectedImpact.riskChange}%`);
      }
      if (proposal.expectedImpact.confidenceScore < 0.5) {
        warnings.push(`Low confidence score: ${proposal.expectedImpact.confidenceScore}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if value is within safe bounds
   * Requirements: 2.3, 2.4, 2.5
   */
  checkBounds(key: string, value: unknown): boolean {
    // Extract the parameter name from the key (e.g., "traps.oi_wipeout.stop_loss" -> "stop_loss")
    const paramName = this.extractParameterName(key);
    const bounds = PARAMETER_BOUNDS[paramName];

    // If no bounds defined for this parameter, check if it's a valid non-numeric type
    if (!bounds) {
      // Boolean and enum values don't have numeric bounds
      if (typeof value === 'boolean') {
        return true;
      }
      if (typeof value === 'string') {
        // Validate enum values
        if (key.endsWith('slippage_model')) {
          return ['conservative', 'realistic', 'optimistic'].includes(value);
        }
        return false;
      }
      // Unknown parameter without bounds - reject for safety
      return typeof value !== 'number';
    }

    // Check numeric bounds
    if (typeof value !== 'number') {
      return false;
    }

    return value >= bounds.min && value <= bounds.max;
  }

  /**
   * Validate proposal structure matches config schema
   * Requirements: 2.6 - Validate keys against strict Zod schema
   */
  validateSchema(proposal: OptimizationProposal): boolean {
    const { targetKey } = proposal;

    // Check if the key exists in valid config keys
    if (!VALID_CONFIG_KEYS.has(targetKey)) {
      return false;
    }

    // Validate the key path exists in the schema
    return this.keyExistsInSchema(targetKey);
  }

  /**
   * Extract parameter name from dot-notation key
   */
  private extractParameterName(key: string): string {
    const parts = key.split('.');
    return parts[parts.length - 1];
  }

  /**
   * Check if a key path exists in the config schema
   */
  private keyExistsInSchema(key: string): boolean {
    const parts = key.split('.');
    
    // Build a test object with the key path
    const testObj = this.buildTestObject(parts);
    
    // Try to parse with the schema - if the key doesn't exist, it will fail
    try {
      // We use partial parsing to check structure
      const result = this.configSchema.safeParse(testObj);
      // Even if validation fails due to missing values, the key structure should be recognized
      // Check if the error is about the value, not the key
      if (!result.success) {
        const errors = result.error.errors;
        // If all errors are about invalid values (not missing keys), the key exists
        return errors.every(err => 
          err.code !== 'unrecognized_keys' && 
          !err.message.includes('unrecognized')
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build a test object from key parts for schema validation
   */
  private buildTestObject(parts: string[]): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }

    // Set a placeholder value for the final key
    current[parts[parts.length - 1]] = null;

    return obj;
  }

  /**
   * Validate that the value type matches the expected type for the key
   */
  private validateValueType(key: string, value: unknown): { valid: boolean; error?: string } {
    const paramName = this.extractParameterName(key);

    // Boolean parameters
    if (paramName === 'enabled' || paramName === 'limit_chaser_enabled') {
      if (typeof value !== 'boolean') {
        return { valid: false, error: `Expected boolean for "${key}", got ${typeof value}` };
      }
      return { valid: true };
    }

    // Enum parameters
    if (paramName === 'slippage_model') {
      if (typeof value !== 'string' || !['conservative', 'realistic', 'optimistic'].includes(value)) {
        return { 
          valid: false, 
          error: `Expected one of ['conservative', 'realistic', 'optimistic'] for "${key}", got ${value}` 
        };
      }
      return { valid: true };
    }

    // Integer parameters
    if (['max_leverage', 'cooldown_period', 'max_open_positions', 'max_fill_time'].includes(paramName)) {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return { valid: false, error: `Expected integer for "${key}", got ${value}` };
      }
      return { valid: true };
    }

    // Numeric parameters (float)
    if (typeof value !== 'number') {
      return { valid: false, error: `Expected number for "${key}", got ${typeof value}` };
    }

    return { valid: true };
  }

  /**
   * Get the bounds for a specific parameter
   */
  getBounds(paramName: string): { min: number; max: number } | undefined {
    return PARAMETER_BOUNDS[paramName];
  }

  /**
   * Check if a key is a valid config key
   */
  isValidKey(key: string): boolean {
    return VALID_CONFIG_KEYS.has(key);
  }

  /**
   * Get all valid config keys
   */
  getValidKeys(): string[] {
    return Array.from(VALID_CONFIG_KEYS);
  }
}
