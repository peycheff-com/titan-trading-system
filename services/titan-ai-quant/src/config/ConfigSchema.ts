/**
 * Config Schema with Zod
 *
 * Defines Zod schemas for configuration validation
 * and exports TypeScript types.
 *
 * Requirements: 2.6
 */

import { z } from 'zod';

/**
 * Trap Configuration Schema
 * Defines configuration for individual trap types
 */
export const TrapConfigSchema = z.object({
  enabled: z.boolean(),
  stop_loss: z.number().min(0.001).max(0.05),
  take_profit: z.number().min(0.005).max(0.2),
  trailing_stop: z.number().min(0.001).max(0.05).optional(),
  risk_per_trade: z.number().min(0.001).max(0.05),
  max_leverage: z.number().int().min(1).max(20),
  min_confidence: z.number().min(0).max(1),
  cooldown_period: z.number().int().min(0).max(3600), // seconds
});

/**
 * Risk Configuration Schema
 * Defines global risk management parameters
 */
export const RiskConfigSchema = z.object({
  max_daily_loss: z.number().min(0.01).max(0.2),
  max_position_size: z.number().min(0.1).max(1.0),
  max_open_positions: z.number().int().min(1).max(10),
  emergency_flatten_threshold: z.number().min(0.05).max(0.3),
});

/**
 * Execution Configuration Schema
 * Defines execution and latency parameters
 */
export const ExecutionConfigSchema = z.object({
  latency_penalty: z.number().min(0).max(1000), // milliseconds
  slippage_model: z.enum(['conservative', 'realistic', 'optimistic']),
  limit_chaser_enabled: z.boolean(),
  max_fill_time: z.number().int().min(100).max(5000), // milliseconds
});

/**
 * Complete Configuration Schema
 * Matches the structure of config.json
 */
export const ConfigSchema = z.object({
  traps: z.object({
    oi_wipeout: TrapConfigSchema,
    funding_spike: TrapConfigSchema,
    liquidity_sweep: TrapConfigSchema,
    volatility_spike: TrapConfigSchema,
  }),
  risk: RiskConfigSchema,
  execution: ExecutionConfigSchema,
});

// Export TypeScript types inferred from schemas
export type TrapConfig = z.infer<typeof TrapConfigSchema>;
export type RiskConfig = z.infer<typeof RiskConfigSchema>;
export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Validate configuration against schema
 */
export function validateConfig(config: unknown): Config {
  return ConfigSchema.parse(config);
}

/**
 * Safely validate configuration, returning errors instead of throwing
 */
export function safeValidateConfig(
  config: unknown,
): { success: true; data: Config } | { success: false; error: z.ZodError } {
  const result = ConfigSchema.safeParse(config);
  return result;
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): Config {
  return {
    traps: {
      oi_wipeout: {
        enabled: true,
        stop_loss: 0.02,
        take_profit: 0.06,
        trailing_stop: 0.01,
        risk_per_trade: 0.02,
        max_leverage: 15,
        min_confidence: 0.7,
        cooldown_period: 300,
      },
      funding_spike: {
        enabled: true,
        stop_loss: 0.015,
        take_profit: 0.045,
        risk_per_trade: 0.015,
        max_leverage: 12,
        min_confidence: 0.75,
        cooldown_period: 600,
      },
      liquidity_sweep: {
        enabled: true,
        stop_loss: 0.025,
        take_profit: 0.075,
        risk_per_trade: 0.025,
        max_leverage: 10,
        min_confidence: 0.8,
        cooldown_period: 180,
      },
      volatility_spike: {
        enabled: false,
        stop_loss: 0.03,
        take_profit: 0.09,
        risk_per_trade: 0.03,
        max_leverage: 8,
        min_confidence: 0.85,
        cooldown_period: 900,
      },
    },
    risk: {
      max_daily_loss: 0.05,
      max_position_size: 0.5,
      max_open_positions: 3,
      emergency_flatten_threshold: 0.1,
    },
    execution: {
      latency_penalty: 200,
      slippage_model: 'realistic',
      limit_chaser_enabled: true,
      max_fill_time: 2000,
    },
  };
}
