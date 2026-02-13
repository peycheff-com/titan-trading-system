/* eslint-disable functional/immutable-data -- Stateful runtime: mutations architecturally required */
/**
 * ConfigRegistry - Central configuration catalog and effective value management
 *
 * Provides:
 * - Config item catalog with schemas and safety levels
 * - Effective value resolution with provenance
 * - Tighten-only override enforcement
 * - Change receipt generation
 * - PostgreSQL persistence for overrides and receipts
 */
import { Logger } from '../../logging/Logger.js';
import { createHash, randomUUID } from 'crypto';
import type { Pool as PgPool } from 'pg';

// Safety levels for config items
export type ConfigSafety = 'immutable' | 'tighten_only' | 'raise_only' | 'append_only' | 'tunable';

// Scope of config items
export type ConfigScope = 'global' | 'venue' | 'symbol' | 'phase' | 'operator';

// Where config is stored
export type ConfigStorage = 'env' | 'file' | 'postgres' | 'nats_kv';

// How changes are applied
export type ConfigApply = 'live' | 'restart' | 'deploy';

// UI widget hints
export type ConfigWidget =
  | 'slider'
  | 'input'
  | 'toggle'
  | 'select'
  | 'secret'
  | 'tag_list'
  | 'json_editor'
  | 'big_button'
  | 'readonly';

// Schema definition for config values
export interface ConfigSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  min?: number;
  max?: number;
  secret?: boolean;
  format?: string;
  items?: { type: string };
  enum?: string[];
}

// Full config item definition
export interface ConfigItem {
  key: string;
  title: string;
  description: string;
  category: string;
  safety: ConfigSafety;
  scope: ConfigScope;
  owner: string;
  storage: ConfigStorage;
  apply: ConfigApply;
  schema: ConfigSchema;
  widget: ConfigWidget;
  riskDirection?: 'higher_is_riskier' | 'lower_is_riskier';
  defaultValue?: unknown;
}

// Provenance chain for effective values
export interface ConfigProvenance {
  source: 'default' | 'env' | 'file' | 'override' | 'deploy';
  value: unknown;
  timestamp: number;
  operatorId?: string;
  expiresAt?: number;
}

// Effective configuration with provenance
export interface EffectiveConfig {
  key: string;
  value: unknown;
  provenance: ConfigProvenance[];
}

// Override record
export interface ConfigOverride {
  id: string;
  key: string;
  value: unknown;
  previousValue: unknown;
  operatorId: string;
  reason: string;
  expiresAt?: number;
  createdAt: number;
  active: boolean;
}

// Change receipt for audit
export interface ConfigReceipt {
  id: string;
  key: string;
  previousValue: unknown;
  newValue: unknown;
  operatorId: string;
  reason: string;
  action: 'override' | 'rollback' | 'propose';
  expiresAt?: number;
  timestamp: number;
  signature: string;
}

// Config catalog - hardcoded for now, can be loaded from CONFIG_COVERAGE_MAP.md later
const CONFIG_CATALOG: ConfigItem[] = [
  // Risk Parameters
  {
    key: 'risk.maxAccountLeverage',
    title: 'Max Account Leverage',
    description: 'Maximum account-wide leverage multiplier',
    category: 'Risk',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Brain+Exec',
    storage: 'file',
    apply: 'restart',
    schema: { type: 'number', min: 1, max: 50 },
    widget: 'slider',
    riskDirection: 'higher_is_riskier',
    defaultValue: 10,
  },
  {
    key: 'risk.maxPositionNotional',
    title: 'Max Position Notional',
    description: 'Maximum position size in USD',
    category: 'Risk',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Brain+Exec',
    storage: 'file',
    apply: 'restart',
    schema: { type: 'number', min: 100, max: 1000000 },
    widget: 'input',
    riskDirection: 'higher_is_riskier',
    defaultValue: 50000,
  },
  {
    key: 'risk.maxDailyLoss',
    title: 'Max Daily Loss',
    description: 'Maximum daily loss in USD (negative value)',
    category: 'Risk',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Brain+Exec',
    storage: 'file',
    apply: 'restart',
    schema: { type: 'number', max: 0 },
    widget: 'input',
    riskDirection: 'lower_is_riskier',
    defaultValue: -1000,
  },
  {
    key: 'risk.minConfidenceScore',
    title: 'Min Confidence Score',
    description: 'Minimum signal confidence to execute',
    category: 'Risk',
    safety: 'raise_only',
    scope: 'global',
    owner: 'Brain',
    storage: 'file',
    apply: 'restart',
    schema: { type: 'number', min: 0, max: 1 },
    widget: 'slider',
    defaultValue: 0.7,
  },
  // Circuit Breaker
  {
    key: 'breaker.maxDailyDrawdown',
    title: 'Breaker Daily Drawdown',
    description: 'Daily drawdown threshold to trigger breaker',
    category: 'Circuit Breaker',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0, max: 1 },
    widget: 'slider',
    riskDirection: 'higher_is_riskier',
    defaultValue: 0.07,
  },
  {
    key: 'breaker.cooldownHours',
    title: 'Breaker Cooldown Hours',
    description: 'Hours to wait after breaker trip',
    category: 'Circuit Breaker',
    safety: 'tunable',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0, max: 168 },
    widget: 'input',
    defaultValue: 4,
  },
  // Phase Parameters
  {
    key: 'phase.p1.riskPct',
    title: 'Phase 1 Risk %',
    description: 'Risk percentage for Phase 1 trades',
    category: 'Phases',
    safety: 'tunable',
    scope: 'phase',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0, max: 0.1 },
    widget: 'slider',
    defaultValue: 0.03,
  },
  {
    key: 'phase.p2.riskPct',
    title: 'Phase 2 Risk %',
    description: 'Risk percentage for Phase 2 trades',
    category: 'Phases',
    safety: 'tunable',
    scope: 'phase',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0, max: 0.1 },
    widget: 'slider',
    defaultValue: 0.024,
  },
  // Fees
  {
    key: 'fees.maker',
    title: 'Maker Fee',
    description: 'Maker fee percentage',
    category: 'Fees',
    safety: 'tunable',
    scope: 'venue',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0, max: 0.01 },
    widget: 'input',
    defaultValue: 0.0002,
  },
  {
    key: 'fees.taker',
    title: 'Taker Fee',
    description: 'Taker fee percentage',
    category: 'Fees',
    safety: 'tunable',
    scope: 'venue',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0, max: 0.01 },
    widget: 'input',
    defaultValue: 0.0006,
  },
  // System
  {
    key: 'override.halt',
    title: 'System Halt',
    description: 'Emergency halt all trading',
    category: 'System',
    safety: 'tunable',
    scope: 'global',
    owner: 'Brain',
    storage: 'nats_kv',
    apply: 'live',
    schema: { type: 'boolean' },
    widget: 'big_button',
    defaultValue: false,
  },
  // Intelligence (AI)
  {
    key: 'ai.gemini.apiKey',
    title: 'Gemini API Key',
    description: 'API Key for Google Gemini models',
    category: 'Intelligence',
    safety: 'tunable',
    scope: 'global',
    owner: 'Brain',
    storage: 'postgres', // secure storage
    apply: 'live',
    schema: { type: 'string', secret: true },
    widget: 'secret',
    defaultValue: '',
  },
  {
    key: 'ai.gemini.model',
    title: 'Gemini Model',
    description: 'Model ID (use \'gemini-flash-latest\' for auto-current, or pin e.g. \'gemini-3.0-flash\')',
    category: 'Intelligence',
    safety: 'tunable',
    scope: 'global',
    owner: 'Brain',
    storage: 'postgres',
    apply: 'live',
    schema: { type: 'string' },
    widget: 'input',
    defaultValue: 'gemini-flash-latest',
  },
  // Notifications
  {
    key: 'notifications.telegram.botToken',
    title: 'Telegram Bot Token',
    description: 'Bot token from @BotFather',
    category: 'Notifications',
    safety: 'tunable',
    scope: 'global',
    owner: 'Brain',
    storage: 'postgres',
    apply: 'live',
    schema: { type: 'string', secret: true },
    widget: 'secret',
    defaultValue: '',
  },
  {
    key: 'notifications.telegram.chatId',
    title: 'Telegram Chat ID',
    description: 'Chat ID to send alerts to',
    category: 'Notifications',
    safety: 'tunable',
    scope: 'global',
    owner: 'Brain',
    storage: 'postgres',
    apply: 'live',
    schema: { type: 'string' },
    widget: 'input',
    defaultValue: '',
  },
  // Exchanges
  {
    key: 'exchange.bybit.apiKey',
    title: 'Bybit API Key',
    description: 'API Key for Bybit',
    category: 'Exchanges',
    safety: 'tunable',
    scope: 'venue',
    owner: 'Exec',
    storage: 'postgres',
    apply: 'live',
    schema: { type: 'string', secret: true },
    widget: 'secret',
    defaultValue: '',
  },
  {
    key: 'exchange.bybit.apiSecret',
    title: 'Bybit API Secret',
    description: 'API Secret for Bybit',
    category: 'Exchanges',
    safety: 'tunable',
    scope: 'venue',
    owner: 'Exec',
    storage: 'postgres',
    apply: 'live',
    schema: { type: 'string', secret: true },
    widget: 'secret',
    defaultValue: '',
  },
  {
    key: 'exchange.bybit.testnet',
    title: 'Bybit Testnet',
    description: 'Use Testnet instead of Mainnet',
    category: 'Exchanges',
    safety: 'tunable',
    scope: 'venue',
    owner: 'Exec',
    storage: 'postgres',
    apply: 'live',
    schema: { type: 'boolean' },
    widget: 'toggle',
    defaultValue: false,
  },
  {
    key: 'exchange.mexc.apiKey',
    title: 'MEXC API Key',
    description: 'API Key for MEXC',
    category: 'Exchanges',
    safety: 'tunable',
    scope: 'venue',
    owner: 'Exec',
    storage: 'postgres',
    apply: 'live',
    schema: { type: 'string', secret: true },
    widget: 'secret',
    defaultValue: '',
  },
  {
    key: 'exchange.mexc.apiSecret',
    title: 'MEXC API Secret',
    description: 'API Secret for MEXC',
    category: 'Exchanges',
    safety: 'tunable',
    scope: 'venue',
    owner: 'Exec',
    storage: 'postgres',
    apply: 'live',
    schema: { type: 'string', secret: true },
    widget: 'secret',
    defaultValue: '',
  },

  // ── Capital ─────────────────────────────────────────────────────
  {
    key: 'capital.initialEquity',
    title: 'Initial Equity',
    description: 'Starting account equity in USD',
    category: 'Capital',
    safety: 'tunable',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'restart',
    schema: { type: 'number', min: 1, max: 1000000 },
    widget: 'input',
    defaultValue: 20,
  },
  {
    key: 'capital.reserveLimit',
    title: 'Capital Reserve Limit',
    description: 'USD reserve that must not be traded',
    category: 'Capital',
    safety: 'raise_only',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0, max: 100000 },
    widget: 'input',
    riskDirection: 'lower_is_riskier',
    defaultValue: 200,
  },

  // ── Risk ────────────────────────────────────────────────────────
  {
    key: 'risk.maxRiskPct',
    title: 'Max Risk Per Trade',
    description: 'Maximum percentage of equity risked per trade',
    category: 'Risk',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0.001, max: 0.2 },
    widget: 'slider',
    riskDirection: 'higher_is_riskier',
    defaultValue: 0.03,
  },
  {
    key: 'risk.maxPositionSizePct',
    title: 'Max Position Size %',
    description: 'Maximum position size as fraction of equity',
    category: 'Risk',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0.01, max: 1 },
    widget: 'slider',
    riskDirection: 'higher_is_riskier',
    defaultValue: 0.1,
  },
  {
    key: 'risk.maxTotalLeverage',
    title: 'Max Total Leverage',
    description: 'Maximum aggregate leverage across all positions',
    category: 'Risk',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Brain+Exec',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 1, max: 125 },
    widget: 'slider',
    riskDirection: 'higher_is_riskier',
    defaultValue: 20,
  },

  // ── Circuit Breaker (extended) ──────────────────────────────────
  {
    key: 'breaker.maxWeeklyDrawdown',
    title: 'Max Weekly Drawdown',
    description: 'Weekly drawdown threshold to trigger circuit breaker',
    category: 'Circuit Breaker',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0, max: 1 },
    widget: 'slider',
    riskDirection: 'higher_is_riskier',
    defaultValue: 0.105,
  },
  {
    key: 'breaker.minEquity',
    title: 'Min Equity Threshold',
    description: 'Absolute minimum equity — halt trading below this',
    category: 'Circuit Breaker',
    safety: 'raise_only',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0, max: 1000000 },
    widget: 'input',
    riskDirection: 'lower_is_riskier',
    defaultValue: 16.0,
  },
  {
    key: 'breaker.consecutiveLossLimit',
    title: 'Consecutive Loss Limit',
    description: 'Number of consecutive losses before breaker trips',
    category: 'Circuit Breaker',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 1, max: 50 },
    widget: 'select',
    riskDirection: 'higher_is_riskier',
    defaultValue: 2,
  },
  {
    key: 'breaker.consecutiveLossWindow',
    title: 'Loss Window',
    description: 'Time window for counting consecutive losses',
    category: 'Circuit Breaker',
    safety: 'tunable',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 60000, max: 86400000 },
    widget: 'select',
    defaultValue: 3600000,
  },
  {
    key: 'breaker.emergencyStopLoss',
    title: 'Emergency Stop Loss %',
    description: 'Absolute loss threshold for emergency position closure',
    category: 'Circuit Breaker',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0.01, max: 1 },
    widget: 'slider',
    riskDirection: 'higher_is_riskier',
    defaultValue: 0.1,
  },

  // ── Safety Thresholds ───────────────────────────────────────────
  {
    key: 'safety.zscoreThreshold',
    title: 'ZScore Safety Threshold',
    description: 'Statistical z-score threshold for anomaly detection',
    category: 'Safety',
    safety: 'tunable',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: -10, max: 0 },
    widget: 'input',
    defaultValue: -2.0,
  },
  {
    key: 'safety.drawdownVelocityThreshold',
    title: 'Drawdown Velocity Threshold',
    description: 'Rate of drawdown that triggers protective action',
    category: 'Safety',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0.001, max: 0.5 },
    widget: 'slider',
    riskDirection: 'higher_is_riskier',
    defaultValue: 0.02,
  },

  // ── Trading Frequency Limits ────────────────────────────────────
  {
    key: 'trading.minTradeIntervalMs',
    title: 'Min Trade Interval',
    description: 'Minimum milliseconds between trades',
    category: 'Trading Limits',
    safety: 'raise_only',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 1000, max: 600000 },
    widget: 'select',
    riskDirection: 'lower_is_riskier',
    defaultValue: 30000,
  },
  {
    key: 'trading.maxTradesPerHour',
    title: 'Max Trades Per Hour',
    description: 'Maximum number of trades allowed per hour',
    category: 'Trading Limits',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 1, max: 100 },
    widget: 'select',
    riskDirection: 'higher_is_riskier',
    defaultValue: 10,
  },
  {
    key: 'trading.maxTradesPerDay',
    title: 'Max Trades Per Day',
    description: 'Maximum number of trades allowed per day',
    category: 'Trading Limits',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 1, max: 500 },
    widget: 'select',
    riskDirection: 'higher_is_riskier',
    defaultValue: 50,
  },
  {
    key: 'trading.heartbeatTimeoutMs',
    title: 'Heartbeat Timeout',
    description: 'Milliseconds before a missed heartbeat triggers alert',
    category: 'Trading Limits',
    safety: 'tunable',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 10000, max: 600000 },
    widget: 'input',
    defaultValue: 300000,
  },

  // ── Market Sentiment ────────────────────────────────────────────
  {
    key: 'market.fundingGreedThreshold',
    title: 'Funding Greed Threshold',
    description: 'Funding rate threshold indicating market greed',
    category: 'Market Sentiment',
    safety: 'tunable',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0, max: 500 },
    widget: 'input',
    defaultValue: 100,
  },
  {
    key: 'market.fundingHighGreedThreshold',
    title: 'Funding High Greed Threshold',
    description: 'Elevated greed threshold for stronger signal filtering',
    category: 'Market Sentiment',
    safety: 'tunable',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0, max: 500 },
    widget: 'input',
    defaultValue: 50,
  },
  {
    key: 'market.fundingFearThreshold',
    title: 'Funding Fear Threshold',
    description: 'Funding rate threshold indicating market fear',
    category: 'Market Sentiment',
    safety: 'tunable',
    scope: 'global',
    owner: 'Brain',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: -500, max: 0 },
    widget: 'input',
    defaultValue: -50,
  },

  // ── Execution Quality ───────────────────────────────────────────
  {
    key: 'execution.maxSpreadPct',
    title: 'Max Spread %',
    description: 'Maximum bid-ask spread to accept for execution',
    category: 'Execution',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Exec',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0.0001, max: 0.05 },
    widget: 'slider',
    riskDirection: 'higher_is_riskier',
    defaultValue: 0.001,
  },
  {
    key: 'execution.maxSlippagePct',
    title: 'Max Slippage %',
    description: 'Maximum acceptable price slippage at execution',
    category: 'Execution',
    safety: 'tighten_only',
    scope: 'global',
    owner: 'Exec',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0.0001, max: 0.1 },
    widget: 'slider',
    riskDirection: 'higher_is_riskier',
    defaultValue: 0.002,
  },
  {
    key: 'execution.useMockBroker',
    title: 'Use Mock Broker',
    description: 'Route orders to mock broker instead of live exchange',
    category: 'Execution',
    safety: 'tunable',
    scope: 'global',
    owner: 'Exec',
    storage: 'env',
    apply: 'restart',
    schema: { type: 'boolean' },
    widget: 'toggle',
    defaultValue: false,
  },
  {
    key: 'execution.minStructureThreshold',
    title: 'Min Structure Score',
    description: 'Minimum market structure score to allow execution',
    category: 'Execution',
    safety: 'raise_only',
    scope: 'global',
    owner: 'Exec',
    storage: 'env',
    apply: 'live',
    schema: { type: 'number', min: 0, max: 100 },
    widget: 'slider',
    riskDirection: 'lower_is_riskier',
    defaultValue: 60,
  },
];

// ── Preset Profiles ─────────────────────────────────────────────
export interface PresetProfile {
  name: string;
  label: string;
  description: string;
  overrides: Record<string, unknown>;
}

export const PRESET_PROFILES: PresetProfile[] = [
  {
    name: 'conservative',
    label: 'Conservative',
    description: 'Lower risk, tighter limits — ideal for capital preservation',
    overrides: {
      'risk.maxRiskPct': 0.01,
      'risk.maxPositionSizePct': 0.05,
      'risk.maxTotalLeverage': 10,
      'phase.p1.riskPct': 0.015,
      'phase.p2.riskPct': 0.012,
      'breaker.maxDailyDrawdown': 0.04,
      'breaker.maxWeeklyDrawdown': 0.06,
      'breaker.consecutiveLossLimit': 2,
      'breaker.emergencyStopLoss': 0.05,
      'trading.maxTradesPerHour': 5,
      'trading.maxTradesPerDay': 20,
      'trading.minTradeIntervalMs': 60000,
      'execution.maxSpreadPct': 0.0005,
      'execution.maxSlippagePct': 0.001,
    },
  },
  {
    name: 'balanced',
    label: 'Balanced',
    description: 'Default production profile — moderate risk, standard limits',
    overrides: {
      'risk.maxRiskPct': 0.03,
      'risk.maxPositionSizePct': 0.1,
      'risk.maxTotalLeverage': 20,
      'phase.p1.riskPct': 0.03,
      'phase.p2.riskPct': 0.024,
      'breaker.maxDailyDrawdown': 0.07,
      'breaker.maxWeeklyDrawdown': 0.105,
      'breaker.consecutiveLossLimit': 2,
      'breaker.emergencyStopLoss': 0.1,
      'trading.maxTradesPerHour': 10,
      'trading.maxTradesPerDay': 50,
      'trading.minTradeIntervalMs': 30000,
      'execution.maxSpreadPct': 0.001,
      'execution.maxSlippagePct': 0.002,
    },
  },
  {
    name: 'aggressive',
    label: 'Aggressive',
    description: 'Higher risk tolerance — for strong conviction periods',
    overrides: {
      'risk.maxRiskPct': 0.05,
      'risk.maxPositionSizePct': 0.15,
      'risk.maxTotalLeverage': 30,
      'phase.p1.riskPct': 0.05,
      'phase.p2.riskPct': 0.04,
      'breaker.maxDailyDrawdown': 0.1,
      'breaker.maxWeeklyDrawdown': 0.15,
      'breaker.consecutiveLossLimit': 3,
      'breaker.emergencyStopLoss': 0.15,
      'trading.maxTradesPerHour': 20,
      'trading.maxTradesPerDay': 100,
      'trading.minTradeIntervalMs': 15000,
      'execution.maxSpreadPct': 0.002,
      'execution.maxSlippagePct': 0.003,
    },
  },
];

export class ConfigRegistry {
  private readonly logger: Logger;
  private readonly catalog: Map<string, ConfigItem> = new Map();
  private readonly overrides: Map<string, ConfigOverride> = new Map();
  private readonly receipts: ConfigReceipt[] = [];
  private readonly hmacSecret: string;
  private readonly pool?: PgPool;
  private initialized: boolean = false;

  constructor(hmacSecret?: string, pool?: PgPool) {
    this.logger = Logger.getInstance('config-registry');
    this.hmacSecret = hmacSecret || process.env.HMAC_SECRET || '';
    if (!this.hmacSecret) {
      this.logger.warn('HMAC_SECRET not configured — config signing disabled');
    }
    this.pool = pool;

    // Initialize catalog
    for (const item of CONFIG_CATALOG) {
      this.catalog.set(item.key, item);
    }
    this.logger.info('ConfigRegistry initialized', undefined, {
      itemCount: this.catalog.size,
      persistent: !!pool,
    });
  }

  /**
   * Initialize persistence - load overrides and receipts from database
   */
  async initialize(): Promise<void> {
    if (!this.pool || this.initialized) return;

    try {
      // Load active overrides
      const overridesResult = await this.pool.query<{
        id: string;
        key: string;
        value: unknown;
        previous_value: unknown;
        operator_id: string;
        reason: string;
        expires_at: string | null;
        created_at: string;
        active: boolean;
      }>(
        `SELECT id, key, value, previous_value, operator_id, reason, expires_at, created_at, active
                 FROM config_overrides WHERE active = true`,
      );

      for (const row of overridesResult.rows) {
        this.overrides.set(row.key, {
          id: row.id,
          key: row.key,
          value: row.value,
          previousValue: row.previous_value,
          operatorId: row.operator_id,
          reason: row.reason,
          expiresAt: row.expires_at ? parseInt(row.expires_at) : undefined,
          createdAt: new Date(row.created_at).getTime(),
          active: row.active,
        });
      }

      // Load recent receipts (last 100)
      const receiptsResult = await this.pool.query<{
        id: string;
        key: string;
        action: string;
        previous_value: unknown;
        new_value: unknown;
        operator_id: string;
        reason: string;
        expires_at: string | null;
        signature: string;
        timestamp: string;
      }>(
        `SELECT id, key, action, previous_value, new_value, operator_id, reason, expires_at, signature, timestamp
                 FROM config_receipts ORDER BY timestamp DESC LIMIT 100`,
      );

      this.receipts.length = 0;
      for (const row of receiptsResult.rows.reverse()) {
        this.receipts.push({
          id: row.id,
          key: row.key,
          action: row.action as 'override' | 'rollback' | 'propose',
          previousValue: row.previous_value,
          newValue: row.new_value,
          operatorId: row.operator_id,
          reason: row.reason,
          expiresAt: row.expires_at ? parseInt(row.expires_at) : undefined,
          signature: row.signature,
          timestamp: parseInt(row.timestamp),
        });
      }

      this.initialized = true;
      this.logger.info('ConfigRegistry persistence loaded', undefined, {
        overrides: overridesResult.rows.length,
        receipts: receiptsResult.rows.length,
      });
    } catch (error) {
      this.logger.error('Failed to load config persistence', error as Error);
      // Continue with in-memory mode
    }
  }

  /**
   * Get the full config catalog
   */
  getCatalog(): ConfigItem[] {
    return Array.from(this.catalog.values());
  }

  /**
   * Get a single config item definition
   */
  getItem(key: string): ConfigItem | undefined {
    return this.catalog.get(key);
  }

  /**
   * Get effective configuration with provenance chain
   */
  getEffective(key: string): EffectiveConfig | null {
    const item = this.catalog.get(key);
    if (!item) return null;

    const provenance: ConfigProvenance[] = [];

    // 1. Default value
    if (item.defaultValue !== undefined) {
      provenance.push({
        source: 'default',
        value: item.defaultValue,
        timestamp: 0,
      });
    }

    // 2. Check env override
    const envKey = this.keyToEnv(key);
    const envValue = process.env[envKey];
    if (envValue !== undefined) {
      provenance.push({
        source: 'env',
        value: this.parseValue(envValue, item.schema.type),
        timestamp: Date.now(),
      });
    }

    // 3. Check active override
    const override = this.overrides.get(key);
    if (override && override.active) {
      // Check expiry
      if (override.expiresAt && override.expiresAt < Date.now()) {
        // Mark as expired
        this.expireOverride(key);
      } else {
        provenance.push({
          source: 'override',
          value: override.value,
          timestamp: override.createdAt,
          operatorId: override.operatorId,
          expiresAt: override.expiresAt,
        });
      }
    }

    // Effective value is the last in the chain
    const effectiveValue = provenance.length > 0 ? provenance[provenance.length - 1].value : null;

    return {
      key,
      value: effectiveValue,
      provenance,
    };
  }

  /**
   * Get all effective configurations
   */
  getAllEffective(): EffectiveConfig[] {
    const result: EffectiveConfig[] = [];
    for (const key of this.catalog.keys()) {
      const effective = this.getEffective(key);
      if (effective) {
        result.push(effective);
      }
    }
    return result;
  }

  /**
   * Create or update an override (with tighten-only enforcement)
   */
  async createOverride(
    key: string,
    value: unknown,
    operatorId: string,
    reason: string,
    expiresInHours?: number,
  ): Promise<{ success: boolean; receipt?: ConfigReceipt; error?: string }> {
    const item = this.catalog.get(key);
    if (!item) {
      return { success: false, error: `Unknown config key: ${key}` };
    }

    // Get current effective value
    const effective = this.getEffective(key);
    const currentValue = effective?.value ?? item.defaultValue;

    // Validate safety constraints
    const safetyCheck = this.checkSafety(item, currentValue, value);
    if (!safetyCheck.allowed) {
      return { success: false, error: safetyCheck.reason };
    }

    // Validate schema
    const schemaCheck = this.validateSchema(value, item.schema);
    if (!schemaCheck.valid) {
      return { success: false, error: schemaCheck.error };
    }

    // Create override
    const overrideId = randomUUID();
    const now = Date.now();
    const expiresAt = expiresInHours ? now + expiresInHours * 60 * 60 * 1000 : undefined;

    const override: ConfigOverride = {
      id: overrideId,
      key,
      value,
      previousValue: currentValue,
      operatorId,
      reason,
      expiresAt,
      createdAt: now,
      active: true,
    };

    this.overrides.set(key, override);

    // Generate receipt
    const receipt = this.generateReceipt(
      key,
      currentValue,
      value,
      operatorId,
      reason,
      'override',
      expiresAt,
    );
    this.receipts.push(receipt);

    // Persist to database (fire and forget)
    void this.persistOverride(override);
    void this.persistReceipt(receipt);

    this.logger.info('Config override created', undefined, {
      key,
      operatorId,
      expiresAt,
    });

    return { success: true, receipt };
  }

  /**
   * Rollback an override
   */
  async rollbackOverride(
    key: string,
    operatorId: string,
  ): Promise<{ success: boolean; receipt?: ConfigReceipt; error?: string }> {
    const override = this.overrides.get(key);
    if (!override || !override.active) {
      return {
        success: false,
        error: `No active override for key: ${key}`,
      };
    }

    const previousValue = override.value;
    override.active = false;

    const receipt = this.generateReceipt(
      key,
      previousValue,
      override.previousValue,
      operatorId,
      'Rollback override',
      'rollback',
    );
    this.receipts.push(receipt);

    // Persist to database (fire and forget)
    void this.deactivateOverrideInDb(key, operatorId);
    void this.persistReceipt(receipt);

    this.logger.info('Config override rolled back', undefined, {
      key,
      operatorId,
    });

    return { success: true, receipt };
  }

  /**
   * Get recent receipts
   */
  getReceipts(limit: number = 50): ConfigReceipt[] {
    return this.receipts.slice(-limit);
  }

  /**
   * Get all active overrides
   */
  getActiveOverrides(): ConfigOverride[] {
    return Array.from(this.overrides.values()).filter((o) => o.active);
  }

  /**
   * Get available preset profiles
   */
  getPresets(): PresetProfile[] {
    return PRESET_PROFILES;
  }

  /**
   * Apply a named preset profile (bulk override with safety checks)
   */
  async applyPreset(
    presetName: string,
    operatorId: string,
  ): Promise<{ success: boolean; results: Array<{ key: string; success: boolean; error?: string }>; error?: string }> {
    const preset = PRESET_PROFILES.find((p) => p.name === presetName);
    if (!preset) {
      return { success: false, results: [], error: `Unknown preset: ${presetName}` };
    }

    const results: Array<{ key: string; success: boolean; error?: string }> = [];

    for (const [key, value] of Object.entries(preset.overrides)) {
      const result = await this.createOverride(
        key,
        value,
        operatorId,
        `Preset: ${preset.label}`,
      );
      results.push({ key, success: result.success, error: result.error });
    }

    const allSuccess = results.every((r) => r.success);
    return { success: allSuccess, results };
  }

  // --- Private helpers ---

  private checkSafety(
    item: ConfigItem,
    currentValue: unknown,
    newValue: unknown,
  ): { allowed: boolean; reason?: string } {
    if (item.safety === 'immutable') {
      return {
        allowed: false,
        reason: 'This setting is immutable and requires a signed deploy',
      };
    }

    if (item.safety === 'tunable') {
      return { allowed: true };
    }

    if (item.safety === 'tighten_only') {
      const current = Number(currentValue);
      const proposed = Number(newValue);

      if (item.riskDirection === 'higher_is_riskier') {
        // Can only decrease (tighten)
        if (proposed > current) {
          return {
            allowed: false,
            reason: `Tighten-only: Cannot increase ${item.key} from ${current} to ${proposed}`,
          };
        }
      } else if (item.riskDirection === 'lower_is_riskier') {
        // Can only increase (tighten)
        if (proposed < current) {
          return {
            allowed: false,
            reason: `Tighten-only: Cannot decrease ${item.key} from ${current} to ${proposed}`,
          };
        }
      }
      return { allowed: true };
    }

    if (item.safety === 'raise_only') {
      const current = Number(currentValue);
      const proposed = Number(newValue);
      if (proposed < current) {
        return {
          allowed: false,
          reason: `Raise-only: Cannot lower ${item.key} from ${current} to ${proposed}`,
        };
      }
      return { allowed: true };
    }

    if (item.safety === 'append_only') {
      // For arrays, can only add items
      const currentArr = Array.isArray(currentValue) ? currentValue : [];
      const newArr = Array.isArray(newValue) ? newValue : [];
      const removedItems = currentArr.filter((item) => !newArr.includes(item));
      if (removedItems.length > 0) {
        return {
          allowed: false,
          reason: `Append-only: Cannot remove items from ${item.key}: ${removedItems.join(', ')}`,
        };
      }
      return { allowed: true };
    }

    return { allowed: true };
  }

  private validateSchema(value: unknown, schema: ConfigSchema): { valid: boolean; error?: string } {
    if (schema.type === 'number') {
      if (typeof value !== 'number' || isNaN(value)) {
        return { valid: false, error: 'Value must be a number' };
      }
      if (schema.min !== undefined && value < schema.min) {
        return {
          valid: false,
          error: `Value must be >= ${schema.min}`,
        };
      }
      if (schema.max !== undefined && value > schema.max) {
        return {
          valid: false,
          error: `Value must be <= ${schema.max}`,
        };
      }
    }

    if (schema.type === 'boolean' && typeof value !== 'boolean') {
      return { valid: false, error: 'Value must be a boolean' };
    }

    if (schema.type === 'string' && typeof value !== 'string') {
      return { valid: false, error: 'Value must be a string' };
    }

    if (schema.type === 'array' && !Array.isArray(value)) {
      return { valid: false, error: 'Value must be an array' };
    }

    return { valid: true };
  }

  private generateReceipt(
    key: string,
    previousValue: unknown,
    newValue: unknown,
    operatorId: string,
    reason: string,
    action: 'override' | 'rollback' | 'propose',
    expiresAt?: number,
  ): ConfigReceipt {
    const id = randomUUID();
    const timestamp = Date.now();

    const payload = JSON.stringify({
      id,
      key,
      previousValue,
      newValue,
      operatorId,
      action,
      timestamp,
    });

    const signature = createHash('sha256')
      .update(payload + this.hmacSecret)
      .digest('hex');

    return {
      id,
      key,
      previousValue,
      newValue,
      operatorId,
      reason,
      action,
      expiresAt,
      timestamp,
      signature,
    };
  }

  private expireOverride(key: string): void {
    const override = this.overrides.get(key);
    if (override) {
      override.active = false;
      this.logger.info('Override expired', undefined, { key });
    }
  }

  private keyToEnv(key: string): string {
    // Convert 'risk.maxAccountLeverage' to 'MAX_ACCOUNT_LEVERAGE'
    const parts = key.split('.');
    const lastPart = parts[parts.length - 1];
    return lastPart
      .replace(/([A-Z])/g, '_$1')
      .toUpperCase()
      .replace(/^_/, '');
  }

  private parseValue(value: string, type: string): unknown {
    if (type === 'number') return parseFloat(value);
    if (type === 'boolean') return value.toLowerCase() === 'true';
    if (type === 'array') return JSON.parse(value);
    return value;
  }

  /**
   * Persist override to database
   */
  private async persistOverride(override: ConfigOverride): Promise<void> {
    if (!this.pool) return;

    try {
      await this.pool.query(
        `INSERT INTO config_overrides (id, key, value, previous_value, operator_id, reason, expires_at, active, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                 ON CONFLICT (key) WHERE active = true
                 DO UPDATE SET value = $3, previous_value = $4, operator_id = $5, reason = $6, expires_at = $7, created_at = NOW()`,
        [
          override.id,
          override.key,
          JSON.stringify(override.value),
          JSON.stringify(override.previousValue),
          override.operatorId,
          override.reason,
          override.expiresAt || null,
          override.active,
        ],
      );
    } catch (error) {
      this.logger.error('Failed to persist override', error as Error);
    }
  }

  /**
   * Deactivate override in database
   */
  private async deactivateOverrideInDb(key: string, operatorId: string): Promise<void> {
    if (!this.pool) return;

    try {
      await this.pool.query(
        `UPDATE config_overrides SET active = false, deactivated_at = NOW(), deactivated_by = $2
                 WHERE key = $1 AND active = true`,
        [key, operatorId],
      );
    } catch (error) {
      this.logger.error('Failed to deactivate override', error as Error);
    }
  }

  /**
   * Persist receipt to database
   */
  private async persistReceipt(receipt: ConfigReceipt): Promise<void> {
    if (!this.pool) return;

    try {
      await this.pool.query(
        `INSERT INTO config_receipts (id, key, action, previous_value, new_value, operator_id, reason, expires_at, signature, timestamp)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          receipt.id,
          receipt.key,
          receipt.action,
          JSON.stringify(receipt.previousValue),
          JSON.stringify(receipt.newValue),
          receipt.operatorId,
          receipt.reason,
          receipt.expiresAt || null,
          receipt.signature,
          receipt.timestamp,
        ],
      );
    } catch (error) {
      this.logger.error('Failed to persist receipt', error as Error);
    }
  }
}
