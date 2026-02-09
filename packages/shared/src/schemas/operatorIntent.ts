/**
 * OperatorIntent Schema v1
 * RE-EXPORTS BROWSER-SAFE TYPES + NODE SPECIFIC SIGNATURES
 */
import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';

export * from './operatorIntentTypes';

// ---------------------------------------------------------------------------
// Signature Helpers (NODE ONLY)
// ---------------------------------------------------------------------------

/**
 * Compute HMAC-SHA256 signature for an OperatorIntent.
 * Signs: id + type + params + operator_id
 */
export function calculateIntentSignature(
  intent: { id: string; type: string; params: Record<string, unknown>; operator_id: string },
  secret: string,
): string {
  const signable = `${intent.id}:${intent.type}:${stringify(intent.params)}:${intent.operator_id}`;
  return crypto.createHmac('sha256', secret).update(signable).digest('hex');
}

/**
 * Verify an OperatorIntent signature using timing-safe comparison.
 */
export function verifyIntentSignature(
  intent: {
    id: string;
    type: string;
    params: Record<string, unknown>;
    operator_id: string;
    signature: string;
  },
  secret: string,
): boolean {
  const expected = calculateIntentSignature(intent, secret);
  const sigBuf = Buffer.from(intent.signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}
