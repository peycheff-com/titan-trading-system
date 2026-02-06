import { NatsClient } from './NatsClient.js';
/**
 * Policy Handshake Module
 *
 * Provides Brain -> Execution policy hash verification at startup/promotion.
 * Prevents "healthy-looking system that rejects everything" failure mode.
 */
/** Request subject for policy hash query */
export declare const POLICY_HASH_REQUEST_SUBJECT = "titan.req.exec.policy_hash.v1";
/** Response structure from Execution */
export interface PolicyHashResponse {
    policy_hash: string;
    policy_version?: string;
    timestamp: number;
}
/** Handshake result */
export interface PolicyHandshakeResult {
    success: boolean;
    localHash: string;
    remoteHash?: string;
    error?: string;
}
/**
 * Request the current policy hash from the Execution Engine.
 *
 * @param nats - NatsClient instance
 * @param timeoutMs - Request timeout in milliseconds (default: 5000)
 * @param retries - Number of retry attempts (default: 3)
 * @returns PolicyHashResponse from Execution Engine
 * @throws Error if Execution does not respond within timeout after all retries
 */
export declare function requestExecutionPolicyHash(nats: NatsClient, timeoutMs?: number, retries?: number): Promise<PolicyHashResponse>;
/**
 * Verify that Brain's local policy hash matches Execution's policy hash.
 *
 * @param nats - NatsClient instance
 * @param localPolicyHash - Brain's current policy hash
 * @param timeoutMs - Request timeout in milliseconds
 * @param retries - Number of retry attempts
 * @returns PolicyHandshakeResult with success status and details
 */
export declare function verifyExecutionPolicyHash(nats: NatsClient, localPolicyHash: string, timeoutMs?: number, retries?: number): Promise<PolicyHandshakeResult>;
//# sourceMappingURL=PolicyHandshake.d.ts.map