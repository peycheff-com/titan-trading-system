/**
 * useOperatorIntents Hook
 *
 * API integration with the Titan Brain for OperatorIntent lifecycle:
 * - Submit intents
 * - Query intent history
 * - Get single intent + receipt
 * - Preview intent (dry-run with risk delta)
 * - Approve / reject pending intents
 * - Get operator state (for state_hash OCC)
 * - Stream intent updates (SSE)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getTitanBrainUrl } from '@/lib/api-config';
import { useAuth } from '@/context/AuthContext';

// ---------------------------------------------------------------------------
// Types (mirrored from Brain API — will be imported from @titan/shared in v2)
// ---------------------------------------------------------------------------

export type IntentStatus =
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'PENDING_APPROVAL'
  | 'EXECUTING'
  | 'VERIFIED'
  | 'UNVERIFIED'
  | 'FAILED'
  | 'REJECTED';

// ---------------------------------------------------------------------------
// Decision Trace Types — machine-readable reason codes and evidence
// ---------------------------------------------------------------------------

/** Category of reason code — maps to a system concern */
export type ReasonCodeCategory =
  | 'RBAC'
  | 'OCC'
  | 'CAP'
  | 'BREAKER'
  | 'CONFLICT'
  | 'VENUE'
  | 'POSTURE'
  | 'RECONCILE';

/** Machine-readable reason for allow/deny decisions */
export interface ReasonCode {
  code: ReasonCodeCategory;
  key: string;           // e.g. 'RBAC_ROLE_DENIED', 'OCC_STATE_HASH_DRIFT'
  message: string;       // human-readable summary
  severity: 'info' | 'warning' | 'block';
  metadata?: Record<string, unknown>;
}

/** Truth source evidence for VERIFIED receipts */
export interface VerificationEvidence {
  source: string;        // e.g. 'venue:binance', 'reconciler', 'brain:risk_engine'
  timestamp: string;     // ISO 8601
  hash_or_seq: string;   // content hash or sequence number
  summary: string;       // one-line human summary
}

/** Backend-recommended next action */
export interface RecommendedAction {
  label: string;
  command: string;
  danger: 'safe' | 'moderate' | 'critical';
}

// ---------------------------------------------------------------------------
// Core API Types
// ---------------------------------------------------------------------------

export interface IntentReceipt {
  effect?: string;
  prior_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;
  verification?: 'passed' | 'failed' | 'skipped' | 'timeout';
  verification_evidence?: VerificationEvidence[];
  error?: string;
}

export interface OperatorIntentRecord {
  id: string;
  idempotency_key: string;
  type: string;
  params: Record<string, unknown>;
  operator_id: string;
  reason: string;
  status: IntentStatus;
  submitted_at: string;
  resolved_at?: string | null;
  receipt?: IntentReceipt | null;
}

export interface OperatorState {
  posture: string;
  mode: string;
  state_hash: string;
  phases: Record<string, unknown>;
  truth_confidence: string;
  breaker: string;
  pending_approvals: number;
  last_intents: Array<{
    id: string;
    type: string;
    status: string;
    operator_id: string;
    submitted_at: string;
    resolved_at: string | null;
    has_receipt: boolean;
  }>;
  last_updated: string;
}

export interface IntentPreviewResult {
  allowed: boolean;
  /** Backward-compat prose reason */
  reason: string;
  /** Machine-readable reason codes (preferred over `reason`) */
  reasons?: ReasonCode[];
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
  /** Backend-recommended next actions */
  recommended_actions?: RecommendedAction[];
}

export interface IntentUpdateEvent {
  intent_id: string;
  status: IntentStatus;
  previous_status: IntentStatus;
  receipt?: IntentReceipt;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOperatorIntents() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brainUrl = getTitanBrainUrl();

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  /** Submit a new intent to the Brain (backend is authoritative) */
  const submitIntent = useCallback(async (payload: {
    type: string;
    params: Record<string, unknown>;
    reason: string;
    operator_id: string;
    state_hash?: string;
  }): Promise<OperatorIntentRecord | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${brainUrl}/operator/intents`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          id: crypto.randomUUID(),
          idempotency_key: `${payload.operator_id}:${payload.type}:${Date.now()}`,
          version: 1,
          ...payload,
          signature: 'pending', // Brain signs server-side
          ttl_seconds: 60,
          submitted_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.intent ?? data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [brainUrl, headers]);

  /** Get intent history from backend */
  const getIntents = useCallback(async (filters?: {
    limit?: number;
    status?: IntentStatus;
    type?: string;
  }): Promise<OperatorIntentRecord[]> => {
    try {
      const params = new URLSearchParams();
      if (filters?.limit) params.set('limit', String(filters.limit));
      if (filters?.status) params.set('status', filters.status);
      if (filters?.type) params.set('type', filters.type);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${brainUrl}/operator/intents${qs}`, { headers: headers() });
      if (!res.ok) return [];
      const data = await res.json();
      return data.intents ?? [];
    } catch {
      return [];
    }
  }, [brainUrl, headers]);

  /** Get a single intent by ID (includes receipt) */
  const getIntent = useCallback(async (intentId: string): Promise<OperatorIntentRecord | null> => {
    try {
      const res = await fetch(`${brainUrl}/operator/intents/${intentId}`, { headers: headers() });
      if (!res.ok) return null;
      const data = await res.json();
      return data.intent ?? null;
    } catch {
      return null;
    }
  }, [brainUrl, headers]);

  /** Preview an intent (dry-run with risk delta) */
  const previewIntent = useCallback(async (payload: {
    type: string;
    params: Record<string, unknown>;
    operator_id: string;
    state_hash: string;
  }): Promise<IntentPreviewResult | null> => {
    try {
      const res = await fetch(`${brainUrl}/operator/intents/preview`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        if (res.status === 409) {
          // State hash stale — return the preview with stale flag
          return body.preview ?? null;
        }
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch {
      return null;
    }
  }, [brainUrl, headers]);

  /** Approve a pending intent */
  const approveIntent = useCallback(async (intentId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${brainUrl}/operator/intents/${intentId}/approve`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ approver_id: 'console-operator' }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [brainUrl, headers]);

  /** Reject a pending intent */
  const rejectIntent = useCallback(async (intentId: string, reason: string = 'Operator cancelled'): Promise<boolean> => {
    try {
      const res = await fetch(`${brainUrl}/operator/intents/${intentId}/reject`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ approver_id: 'console-operator', reason }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [brainUrl, headers]);

  /** Get current operator state (includes state_hash for OCC) */
  const getOperatorState = useCallback(async (): Promise<OperatorState | null> => {
    try {
      const res = await fetch(`${brainUrl}/operator/state`, { headers: headers() });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, [brainUrl, headers]);

  return {
    submitIntent,
    getIntents,
    getIntent,
    previewIntent,
    approveIntent,
    rejectIntent,
    getOperatorState,
    loading,
    error,
  };
}

// ---------------------------------------------------------------------------
// SSE Stream Hook — with heartbeat timeout and reconnection backoff
// ---------------------------------------------------------------------------

/** Heartbeat timeout: if no event arrives within this window, assume disconnected */
const HEARTBEAT_TIMEOUT_MS = 20_000; // Brain sends heartbeats every 15s
/** Max backoff delay between reconnection attempts */
const MAX_BACKOFF_MS = 30_000;

export function useIntentStream(onUpdate?: (event: IntentUpdateEvent) => void) {
  const { token } = useAuth();
  const brainUrl = getTitanBrainUrl();
  const [connected, setConnected] = useState(false);
  const onUpdateRef = useRef(onUpdate);

  // Keep ref in sync with latest callback (avoids stale closures)
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    let es: EventSource | null = null;
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    let disposed = false;

    const clearTimers = () => {
      if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };

    const resetHeartbeatTimer = () => {
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      heartbeatTimer = setTimeout(() => {
        if (!disposed) {
          setConnected(false);
          // Force reconnect — the heartbeat timed out
          es?.close();
          scheduleReconnect();
        }
      }, HEARTBEAT_TIMEOUT_MS);
    };

    const connect = () => {
      if (disposed) return;
      const url = `${brainUrl}/operator/intents/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      es = new EventSource(url);

      es.addEventListener('connected', () => {
        if (disposed) return;
        setConnected(true);
        retryCount = 0; // Reset backoff on successful connection
        resetHeartbeatTimer();
      });

      es.addEventListener('heartbeat', () => {
        resetHeartbeatTimer();
      });

      es.addEventListener('intent_update', (e) => {
        resetHeartbeatTimer();
        try {
          const event = JSON.parse(e.data) as IntentUpdateEvent;
          onUpdateRef.current?.(event);
        } catch {
          // Ignore parse errors
        }
      });

      es.onerror = () => {
        if (disposed) return;
        setConnected(false);
        es?.close();
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      const delay = Math.min(1000 * Math.pow(2, retryCount), MAX_BACKOFF_MS);
      retryCount++;
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      disposed = true;
      clearTimers();
      es?.close();
      setConnected(false);
    };
  }, [brainUrl, token]);

  return { connected };
}

