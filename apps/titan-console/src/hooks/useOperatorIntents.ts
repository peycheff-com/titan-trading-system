/**
 * useOperatorIntents Hook
 *
 * API integration with the Titan Brain for OperatorIntent lifecycle:
 * - Submit intents
 * - Query intent history
 * - Approve / reject pending intents
 * - Get operator state (for state_hash OCC)
 */

import { useState, useCallback } from 'react';
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

export interface IntentReceipt {
  effect: string;
  prior_state: Record<string, unknown>;
  new_state: Record<string, unknown>;
  verification: 'passed' | 'failed' | 'skipped' | 'timeout';
  error?: string;
}

export interface OperatorIntentRecord {
  id: string;
  type: string;
  params: Record<string, unknown>;
  operator_id: string;
  reason: string;
  status: IntentStatus;
  submitted_at: string;
  resolved_at?: string;
  receipt?: IntentReceipt;
}

export interface OperatorState {
  posture: string;
  mode: string;
  state_hash: string;
  phases: Record<string, unknown>;
  truth_confidence: number;
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

  /** Submit a new intent to the Brain */
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
          status: 'SUBMITTED',
          submitted_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [brainUrl, headers]);

  /** Get intent history */
  const getIntents = useCallback(async (): Promise<OperatorIntentRecord[]> => {
    try {
      const res = await fetch(`${brainUrl}/operator/intents`, { headers: headers() });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }, [brainUrl, headers]);

  /** Approve a pending intent */
  const approveIntent = useCallback(async (intentId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${brainUrl}/operator/intents/${intentId}/approve`, {
        method: 'POST',
        headers: headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [brainUrl, headers]);

  /** Reject a pending intent */
  const rejectIntent = useCallback(async (intentId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${brainUrl}/operator/intents/${intentId}/reject`, {
        method: 'POST',
        headers: headers(),
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
    approveIntent,
    rejectIntent,
    getOperatorState,
    loading,
    error,
  };
}
