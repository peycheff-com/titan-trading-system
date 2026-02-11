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
    this.hmacSecret = hmacSecret || process.env.HMAC_SECRET || 'dev-secret';
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
