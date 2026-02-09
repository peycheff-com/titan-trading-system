/**
 * OperatorIntentService
 *
 * Processes OperatorIntents through the lifecycle:
 * SUBMITTED → ACCEPTED → EXECUTING → VERIFIED/UNVERIFIED/FAILED
 *
 * Features:
 * - In-memory ring buffer (max 1000 intents)
 * - Idempotency dedup (1h TTL)
 * - TTL enforcement (auto-UNVERIFIED on expiry)
 * - Per-intent verification callbacks
 * - Receipt generation
 * - EventEmitter for real-time status updates (SSE bridge)
 */

import { EventEmitter } from 'events';
import {
  type OperatorIntentRecord,
  type OperatorIntentV1,
  type OperatorIntentType,
  type OperatorIntentStatus,
  type IntentReceipt,
  verifyIntentSignature,
  isTerminalStatus,
  DEFAULT_TTL,
  MAX_TTL,
  REQUIRES_APPROVAL,
  REQUIRES_APPROVAL as APPROVAL_REQUIRED,
  ROLE_ALLOWED_INTENTS,
  OperatorIntentSchemaV1,
} from '@titan/shared';
import { Logger } from '../logging/Logger.js';
import type { IntentRepository } from '../db/repositories/IntentRepository.js';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface IntentUpdateEvent {
  intent_id: string;
  status: OperatorIntentStatus;
  previous_status: OperatorIntentStatus;
  receipt?: IntentReceipt;
  timestamp: string;
}

export interface IntentPreviewResult {
  allowed: boolean;
  reason: string;
  state_hash_valid: boolean;
  current_state_hash: string;
  risk_delta: {
    posture_change: string | null;
    affected_phases: string[];
    affected_symbols: string[];
    max_exposure_delta: number | null;
    throttle_delta: number | null;
    cap_violations: string[];
  };
  blast_radius: {
    phases: string[];
    venues: string[];
    symbols: string[];
  };
  requires_approval: boolean;
  rbac_allowed: boolean;
}

const MAX_INTENTS = 1000;
const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000; // 1 hour
const IDEMPOTENCY_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 min

/** Callback for executing an intent's side-effects and returning a receipt */
export type IntentExecutor = (
  intent: OperatorIntentRecord,
) => Promise<IntentReceipt>;

/** Callback for verifying an intent's effect after execution */
export type IntentVerifier = (
  intent: OperatorIntentRecord,
) => Promise<{ passed: boolean; error?: string }>;

export interface OperatorIntentServiceConfig {
  opsSecret: string;
  executors: Partial<Record<OperatorIntentType, IntentExecutor>>;
  verifiers: Partial<Record<OperatorIntentType, IntentVerifier>>;
  getStateHash: () => string;
}

export class OperatorIntentService extends EventEmitter {
  private readonly intents: OperatorIntentRecord[] = [];
  private readonly idempotencyMap = new Map<string, { intentId: string; expiresAt: number }>();
  private readonly ttlTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly config: OperatorIntentServiceConfig;
  private readonly logger: Logger;
  private readonly repo: IntentRepository | null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: OperatorIntentServiceConfig, logger?: Logger, repo?: IntentRepository) {
    super();
    this.config = config;
    this.logger = logger ?? Logger.getInstance('operator-intent');
    this.repo = repo ?? null;

    // Periodic idempotency key cleanup
    this.cleanupInterval = setInterval(() => this.cleanupIdempotencyKeys(), IDEMPOTENCY_CLEANUP_INTERVAL_MS);
  }

  /**
   * Submit an OperatorIntent for processing.
   */
  async submitIntent(raw: unknown): Promise<{
    status: 'ACCEPTED' | 'REJECTED' | 'IDEMPOTENT_HIT';
    intent: OperatorIntentRecord;
    error?: string;
    validationErrors?: string[];
  }> {
    // 1. Schema validation
    const parsed = OperatorIntentSchemaV1.safeParse(raw);
    if (!parsed.success) {
      return {
        status: 'REJECTED',
        intent: this.toRejectedStub(raw, 'VALIDATION_FAILED'),
        error: 'VALIDATION_FAILED',
        validationErrors: parsed.error.issues.map((i) =>
          i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message,
        ),
      };
    }

    const intentData = parsed.data;

    // 2. Idempotency check
    const existing = this.idempotencyMap.get(intentData.idempotency_key);
    if (existing) {
      const cached = this.intents.find((i) => i.id === existing.intentId);
      if (cached) {
        return { status: 'IDEMPOTENT_HIT', intent: { ...cached } };
      }
    }

    // 3. Signature verification
    if (!verifyIntentSignature(intentData, this.config.opsSecret)) {
      const rejected = this.createRecord(intentData, 'REJECTED', {
        error: 'SIGNATURE_INVALID',
      });
      this.storeIntent(rejected);
      return { status: 'REJECTED', intent: rejected, error: 'SIGNATURE_INVALID' };
    }

    // 4. State hash check (for critical intents)
    if (intentData.state_hash) {
      const currentHash = this.config.getStateHash();
      if (intentData.state_hash !== currentHash) {
        const rejected = this.createRecord(intentData, 'REJECTED', {
          error: `STATE_CONFLICT: expected=${intentData.state_hash} current=${currentHash}`,
        });
        this.storeIntent(rejected);
        return { status: 'REJECTED', intent: rejected, error: 'STATE_CONFLICT' };
      }
    }

    // 5. Check for in-flight intent of same type
    const inFlight = this.intents.find(
      (i) => i.type === intentData.type && (i.status === 'ACCEPTED' || i.status === 'EXECUTING'),
    );
    if (inFlight) {
      const rejected = this.createRecord(intentData, 'REJECTED', {
        error: 'INTENT_IN_FLIGHT',
      });
      this.storeIntent(rejected);
      return { status: 'REJECTED', intent: rejected, error: 'INTENT_IN_FLIGHT' };
    }

    // 6. Clamp TTL to max allowed
    const maxTtl = MAX_TTL[intentData.type] ?? 60;
    const defaultTtl = DEFAULT_TTL[intentData.type] ?? 30;
    const clampedTtl = Math.min(intentData.ttl_seconds ?? defaultTtl, maxTtl);

    // 7. Create ACCEPTED record
    const record = this.createRecord(
      { ...intentData, ttl_seconds: clampedTtl },
      'ACCEPTED',
    );
    this.storeIntent(record);

    // 8. Register idempotency key
    this.idempotencyMap.set(record.idempotency_key, {
      intentId: record.id,
      expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
    });

    // 9. Start TTL timer
    this.startTtlTimer(record.id, clampedTtl * 1000);

    // 10. Check if approval is required for critical intents
    if (REQUIRES_APPROVAL[record.type]) {
      this.updateStatus(record.id, 'PENDING_APPROVAL');
      this.logger.info(`Intent ${record.id} requires approval (${record.type})`);
      // Re-fetch the record with updated status
      const updated = this.intents.find((i) => i.id === record.id)!;
      return { status: 'ACCEPTED', intent: { ...updated } };
    }

    // 11. Execute asynchronously (don't block response)
    this.executeIntent(record).catch((err) => {
      this.logger.error(`Intent execution error: ${record.id}`, err);
    });

    return { status: 'ACCEPTED', intent: { ...record } };
  }

  /**
   * Get intents with optional filters.
   */
  getIntents(filters?: {
    limit?: number;
    status?: OperatorIntentStatus;
    type?: OperatorIntentType;
    operator_id?: string;
  }): { intents: OperatorIntentRecord[]; total: number } {
    let result = [...this.intents];

    if (filters?.status) {
      result = result.filter((i) => i.status === filters.status);
    }
    if (filters?.type) {
      result = result.filter((i) => i.type === filters.type);
    }
    if (filters?.operator_id) {
      result = result.filter((i) => i.operator_id === filters.operator_id);
    }

    const total = result.length;
    const limit = Math.min(filters?.limit ?? 20, 100);
    result = result.slice(0, limit);

    return { intents: result, total };
  }


  /**
   * Get a single intent by ID.
   */
  getIntent(id: string): OperatorIntentRecord | undefined {
    return this.intents.find((i) => i.id === id);
  }

  /**
   * Get last N intents as summaries for the OperatorState projection.
   */
  getLastIntentSummaries(n: number = 10) {
    return this.intents.slice(0, n).map((i) => ({
      id: i.id,
      type: i.type,
      status: i.status,
      operator_id: i.operator_id,
      submitted_at: i.submitted_at,
      resolved_at: i.resolved_at ?? null,
      has_receipt: !!i.receipt,
    }));
  }

  /**
   * Preview an intent without executing (dry-run).
   */
  previewIntent(payload: {
    type: OperatorIntentType;
    params: Record<string, unknown>;
    operator_id: string;
    state_hash: string;
    role?: string;
  }): IntentPreviewResult {
    const currentHash = this.config.getStateHash();
    const stateHashValid = payload.state_hash === currentHash;

    // RBAC check
    // We now use granular permissions, but for preview we map the intent to a required permission
    // For now, we still check against valid intent types for roles as a high-level filter
    // RBAC Check
    // Map each intent type to a specific Permission
    const PERMISSION_MAP: Record<OperatorIntentType, string> = {
      'ARM': 'safety.arm',
      'DISARM': 'safety.disarm',
      'SET_MODE': 'control.set_mode',
      'THROTTLE_PHASE': 'control.throttle',
      'FLATTEN': 'risk.flatten',
      'RUN_RECONCILE': 'control.reconcile',
      'OVERRIDE_RISK': 'risk.override',
    };

    const requiredPermission = PERMISSION_MAP[payload.type];
    if (!requiredPermission) {
       // Fallback for unknown types - should not happen if types are typed
       this.logger.warn(`No permission mapping for intent type ${payload.type}`);
    }

    // For now, we still check against valid intent types for roles as a high-level filter
    // ideally we would check `operator.hasPermission(requiredPermission)` here.
    // Since we don't have the full Operator object/context here in preview, 
    // we rely on the role-based allowlist which acts as a coarse-grained permission check.
    // TODO: Pass full operator context to previewIntent for fine-grained checks.
    const role = (payload.role ?? 'operator') as keyof typeof ROLE_ALLOWED_INTENTS;
    const allowedTypes = ROLE_ALLOWED_INTENTS[role] ?? [];
    const rbacAllowed = allowedTypes.includes(payload.type);

    // In-flight check
    const inFlight = this.intents.find(
      (i) => i.type === payload.type && (i.status === 'ACCEPTED' || i.status === 'EXECUTING'),
    );

    // Compute risk delta (v1: basic posture/phase analysis)
    const affectedPhases = this.computeAffectedPhases(payload.type, payload.params);
    const affectedSymbols = this.computeAffectedSymbols(payload.type, payload.params);
    const postureChange = this.computePostureChange(payload.type);
    const throttleDelta = payload.type === 'THROTTLE_PHASE'
      ? (payload.params.pct as number ?? 100) - 100
      : null;

    const allowed = rbacAllowed && stateHashValid && !inFlight;
    let reason = 'Allowed';
    if (!rbacAllowed) reason = `Role '${role}' cannot execute ${payload.type}`;
    else if (!stateHashValid) reason = 'State hash mismatch — operator state has changed';
    else if (inFlight) reason = `Intent of type ${payload.type} already in flight`;

    return {
      allowed,
      reason,
      state_hash_valid: stateHashValid,
      current_state_hash: currentHash,
      risk_delta: {
        posture_change: postureChange,
        affected_phases: affectedPhases,
        affected_symbols: affectedSymbols,
        max_exposure_delta: null, // v2: full risk engine
        throttle_delta: throttleDelta,
        cap_violations: [], // v2: cap enforcement
      },
      blast_radius: {
        phases: affectedPhases,
        venues: [], // v2: venue-level analysis
        symbols: affectedSymbols,
      },
      requires_approval: APPROVAL_REQUIRED[payload.type] ?? false,
      rbac_allowed: rbacAllowed,
    };
  }

  /**
   * Shutdown: clear timers.
   */
  shutdown(): void {
    for (const timer of this.ttlTimers.values()) {
      clearTimeout(timer);
    }
    this.ttlTimers.clear();

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.removeAllListeners();
  }

  /**
   * Approve a pending intent, triggering execution.
   */
  async approveIntent(id: string, approverId: string): Promise<{
    success: boolean;
    intent?: OperatorIntentRecord;
    error?: string;
  }> {
    const intent = this.intents.find((i) => i.id === id);
    if (!intent) return { success: false, error: 'INTENT_NOT_FOUND' };
    if (intent.status !== 'PENDING_APPROVAL') {
      return { success: false, error: `INVALID_STATUS: ${intent.status}`, intent: { ...intent } };
    }

    // Set approval metadata
    intent.approver_id = approverId;
    intent.approved_at = new Date().toISOString();

    this.logger.info(`Intent ${id} approved by ${approverId}`);
    
    // Persist status change (and metadata hopefully)
    await this.updateStatus(id, 'ACCEPTED');

    // Execute asynchronously
    this.executeIntent(intent).catch((err) => {
      this.logger.error(`Intent execution error after approval: ${id}`, err);
    });

    return { success: true, intent: { ...intent } };
  }

  /**
   * Reject a pending intent.
   */
  rejectIntent(id: string, approverId: string, reason: string): {
    success: boolean;
    intent?: OperatorIntentRecord;
    error?: string;
  } {
    const intent = this.intents.find((i) => i.id === id);
    if (!intent) return { success: false, error: 'INTENT_NOT_FOUND' };
    if (intent.status !== 'PENDING_APPROVAL') {
      return { success: false, error: `INVALID_STATUS: ${intent.status}`, intent: { ...intent } };
    }

    intent.approver_id = approverId;
    intent.rejection_reason = reason;

    this.logger.info(`Intent ${id} rejected by ${approverId}: ${reason}`);
    this.resolveIntent(id, 'REJECTED', {
      error: `Rejected by ${approverId}: ${reason}`,
    });

    return { success: true, intent: { ...intent } };
  }

  /**
   * Count intents awaiting approval.
   */
  getPendingApprovalCount(): number {
    return this.intents.filter((i) => i.status === 'PENDING_APPROVAL').length;
  }

  // =========================================================================
  // Private
  // =========================================================================

  private async executeIntent(record: OperatorIntentRecord): Promise<void> {
    // Transition to EXECUTING
    this.updateStatus(record.id, 'EXECUTING');

    const executor = this.config.executors[record.type];
    if (!executor) {
      this.resolveIntent(record.id, 'FAILED', {
        error: `No executor registered for ${record.type}`,
      });
      return;
    }

    try {
      const receipt = await executor(record);
      const priorState = receipt.prior_state;
      const newState = receipt.new_state;

      // Schedule verification
      const verifier = this.config.verifiers[record.type];
      if (verifier) {
        const verifyDelayMs = this.getVerifyDelay(record.type);
        setTimeout(async () => {
          try {
            const result = await verifier(record);
            this.resolveIntent(record.id, result.passed ? 'VERIFIED' : 'FAILED', {
              effect: receipt.effect,
              prior_state: priorState,
              new_state: newState,
              verification: result.passed ? 'passed' : 'failed',
              error: result.error,
            });
          } catch (err) {
            this.resolveIntent(record.id, 'FAILED', {
              effect: receipt.effect,
              prior_state: priorState,
              new_state: newState,
              verification: 'failed',
              error: err instanceof Error ? err.message : 'Verification error',
            });
          }
        }, verifyDelayMs);
      } else {
        // No verifier — skip verification
        this.resolveIntent(record.id, 'VERIFIED', {
          ...receipt,
          verification: 'skipped',
        });
      }
    } catch (err) {
      this.resolveIntent(record.id, 'FAILED', {
        error: err instanceof Error ? err.message : 'Execution error',
        verification: 'failed',
      });
    }
  }

  private getVerifyDelay(type: OperatorIntentType): number {
    const delays: Record<OperatorIntentType, number> = {
      ARM: 500,
      DISARM: 500,
      SET_MODE: 500,
      THROTTLE_PHASE: 2000,
      RUN_RECONCILE: 5000,
      FLATTEN: 10000,
      OVERRIDE_RISK: 2000,
    };
    return delays[type] ?? 1000;
  }

  private resolveIntent(id: string, status: OperatorIntentStatus, receipt: IntentReceipt): void {
    const intent = this.intents.find((i) => i.id === id);
    if (!intent || isTerminalStatus(intent.status)) return;

    const previousStatus = intent.status;
    intent.status = status;
    intent.resolved_at = new Date().toISOString();
    intent.receipt = receipt;

    // Cancel TTL timer
    const timer = this.ttlTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.ttlTimers.delete(id);
    }

    this.logger.info(`Intent ${id} resolved: ${status}`, undefined, {
      type: intent.type,
      receipt,
    });

    // Emit event for SSE subscribers
    const event: IntentUpdateEvent = {
      intent_id: id,
      status,
      previous_status: previousStatus,
      receipt,
      timestamp: intent.resolved_at,
    };
    this.emit('intent:updated', event);

    // Write-through to DB
    if (this.repo) {
      this.repo.resolve(id, status, receipt, intent.resolved_at!).catch((err) => {
        this.logger.error(`DB resolve failed for intent ${id}`, err instanceof Error ? err : undefined);
      });
    }
  }

  private updateStatus(id: string, status: OperatorIntentStatus): void {
    const intent = this.intents.find((i) => i.id === id);
    if (intent && !isTerminalStatus(intent.status)) {
      const previousStatus = intent.status;
      intent.status = status;

      // Emit event for SSE subscribers
      const event: IntentUpdateEvent = {
        intent_id: id,
        status,
        previous_status: previousStatus,
        timestamp: new Date().toISOString(),
      };
      this.emit('intent:updated', event);

      // Write-through to DB
      if (this.repo) {
        this.repo.updateStatus(id, status).catch((err) => {
          this.logger.error(`DB updateStatus failed for intent ${id}`, err instanceof Error ? err : undefined);
        });
      }
    }
  }

  private startTtlTimer(id: string, ttlMs: number): void {
    const timer = setTimeout(() => {
      const intent = this.intents.find((i) => i.id === id);
      if (intent && !isTerminalStatus(intent.status)) {
        this.resolveIntent(id, 'UNVERIFIED', {
          verification: 'timeout',
          error: `TTL expired (${ttlMs / 1000}s) before verification could complete`,
        });
      }
      this.ttlTimers.delete(id);
    }, ttlMs);

    this.ttlTimers.set(id, timer);
  }

  private storeIntent(record: OperatorIntentRecord): void {
    this.intents.unshift(record);
    if (this.intents.length > MAX_INTENTS) {
      this.intents.splice(MAX_INTENTS);
    }

    // Write-through to DB
    if (this.repo) {
      this.repo.insert(record).catch((err) => {
        this.logger.error(`DB insert failed for intent ${record.id}`, err instanceof Error ? err : undefined);
      });
    }
  }

  private createRecord(
    data: OperatorIntentV1,
    status: OperatorIntentStatus,
    receipt?: IntentReceipt,
  ): OperatorIntentRecord {
    return {
      id: data.id,
      idempotency_key: data.idempotency_key,
      version: 1,
      type: data.type,
      params: data.params ?? {},
      operator_id: data.operator_id,
      reason: data.reason,
      signature: data.signature,
      status,
      ttl_seconds: data.ttl_seconds ?? 30,
      submitted_at: data.submitted_at,
      resolved_at: status === 'ACCEPTED' ? undefined : new Date().toISOString(),
      state_hash: data.state_hash,
      receipt,
    };
  }

  private toRejectedStub(raw: unknown, error: string): OperatorIntentRecord {
    const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    return {
      id: (obj.id as string) || 'unknown',
      idempotency_key: (obj.idempotency_key as string) || 'unknown',
      version: 1,
      type: 'ARM' as OperatorIntentType,
      params: {},
      operator_id: (obj.operator_id as string) || 'unknown',
      reason: (obj.reason as string) || '',
      signature: '',
      status: 'REJECTED',
      ttl_seconds: 30,
      submitted_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      receipt: { error },
    };
  }

  private cleanupIdempotencyKeys(): void {
    const now = Date.now();
    for (const [key, entry] of this.idempotencyMap) {
      if (entry.expiresAt < now) {
        this.idempotencyMap.delete(key);
      }
    }
  }

  // =========================================================================
  // Risk Delta Helpers (v1: basic analysis)
  // =========================================================================

  private computeAffectedPhases(type: OperatorIntentType, params: Record<string, unknown>): string[] {
    switch (type) {
      case 'THROTTLE_PHASE':
        return params.phase ? [String(params.phase)] : [];
      case 'ARM':
      case 'DISARM':
      case 'SET_MODE':
        return ['phase1', 'phase2', 'phase3'];
      case 'FLATTEN':
        return params.symbol ? [] : ['phase1', 'phase2', 'phase3'];
      default:
        return [];
    }
  }

  private computeAffectedSymbols(type: OperatorIntentType, params: Record<string, unknown>): string[] {
    if (type === 'FLATTEN' && params.symbol) {
      return [String(params.symbol)];
    }
    if (type === 'FLATTEN' && !params.symbol) {
      return ['ALL'];
    }
    return [];
  }

  private computePostureChange(type: OperatorIntentType): string | null {
    switch (type) {
      case 'ARM': return 'disarmed → armed';
      case 'DISARM': return 'armed → disarmed';
      case 'FLATTEN': return '→ halted';
      default: return null;
    }
  }

  // =========================================================================
  // DB Hydration
  // =========================================================================

  /**
   * Hydrate the in-memory ring buffer from the database on startup.
   * Call once after construction when a repository is provided.
   */
  async hydrateFromDb(): Promise<void> {
    if (!this.repo) return;

    try {
      const records = await this.repo.findRecent(MAX_INTENTS);
      if (records.length > 0) {
        // Records are returned DESC, push them so newest is first
        this.intents.push(...records);
        this.logger.info(`Hydrated ${records.length} intents from database`);
      }
    } catch (err) {
      this.logger.error('Failed to hydrate intents from DB, starting with empty buffer', err instanceof Error ? err : undefined);
    }
  }
}
