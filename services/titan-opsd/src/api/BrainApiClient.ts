/**
 * BrainApiClient
 *
 * HTTP client for the Brain's /operator/* endpoints.
 * Handles HMAC signature generation for intent submission
 * and state/intent polling for the Control Deck UI.
 */
import {
  calculateIntentSignature,
  type OperatorIntentType,
  type OperatorIntentV1,
  type OperatorState,
} from '@titan/shared';
import { v4 as uuidv4 } from 'uuid';

export interface BrainApiConfig {
  brainUrl: string;
  opsSecret: string;
  authToken?: string;
}

export interface SubmitResult {
  status: 'ACCEPTED' | 'REJECTED' | 'IDEMPOTENT_HIT';
  intent: {
    id: string;
    type: string;
    status: string;
  };
  error?: string;
  details?: unknown[];
}

export interface IntentQueryResult {
  intents: Array<{
    id: string;
    type: string;
    status: string;
    operator_id: string;
    reason: string;
    submitted_at: string;
    resolved_at?: string;
    receipt?: {
      effect?: string;
      prior_state?: Record<string, unknown>;
      new_state?: Record<string, unknown>;
      verification?: string;
      error?: string;
    };
  }>;
  total: number;
}

export class BrainApiClient {
  private readonly baseUrl: string;
  private readonly opsSecret: string;
  private readonly authToken: string;

  constructor(config: BrainApiConfig) {
    this.baseUrl = config.brainUrl.replace(/\/$/, '');
    this.opsSecret = config.opsSecret;
    this.authToken = config.authToken ?? '';
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.authToken) {
      h['Authorization'] = `Bearer ${this.authToken}`;
    }
    return h;
  }

  /**
   * Fetch unified OperatorState from Brain.
   */
  async getState(): Promise<OperatorState> {
    const res = await fetch(`${this.baseUrl}/operator/state`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`GET /operator/state failed: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<OperatorState>;
  }

  /**
   * Query intent history.
   */
  async getIntents(opts?: {
    limit?: number;
    status?: string;
    type?: string;
  }): Promise<IntentQueryResult> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.status) params.set('status', opts.status);
    if (opts?.type) params.set('type', opts.type);

    const qs = params.toString();
    const url = `${this.baseUrl}/operator/intents${qs ? '?' + qs : ''}`;

    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`GET /operator/intents failed: ${res.status}`);
    }
    return res.json() as Promise<IntentQueryResult>;
  }

  /**
   * Submit an OperatorIntent with auto-generated ID, signature, and timestamp.
   */
  async submitIntent(
    type: OperatorIntentType,
    params: Record<string, unknown>,
    reason: string,
    operatorId: string,
    stateHash?: string,
    ttlSeconds: number = 30,
  ): Promise<SubmitResult> {
    const id = uuidv4();
    const intentBase = {
      id,
      type,
      params,
      operator_id: operatorId,
    };

    const signature = calculateIntentSignature(intentBase, this.opsSecret);

    const payload: Record<string, unknown> = {
      id,
      idempotency_key: `deck-${id}`,
      version: 1,
      type,
      params,
      operator_id: operatorId,
      reason,
      submitted_at: new Date().toISOString(),
      ttl_seconds: ttlSeconds,
      signature,
    };

    if (stateHash) {
      payload.state_hash = stateHash;
    }

    const res = await fetch(`${this.baseUrl}/operator/intents`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });

    return res.json() as Promise<SubmitResult>;
  }

  /**
   * Approve a pending intent.
   */
  async approveIntent(intentId: string, approverId: string): Promise<{ status: string; error?: string }> {
    const res = await fetch(`${this.baseUrl}/operator/intents/${intentId}/approve`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ approver_id: approverId }),
    });
    return res.json() as Promise<{ status: string; error?: string }>;
  }

  /**
   * Reject a pending intent.
   */
  async rejectIntent(
    intentId: string,
    approverId: string,
    reason: string,
  ): Promise<{ status: string; error?: string }> {
    const res = await fetch(`${this.baseUrl}/operator/intents/${intentId}/reject`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ approver_id: approverId, reason }),
    });
    return res.json() as Promise<{ status: string; error?: string }>;
  }
}
