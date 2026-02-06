/**
 * Policy Handshake Module
 *
 * Provides Brain -> Execution policy hash verification at startup/promotion.
 * Prevents "healthy-looking system that rejects everything" failure mode.
 */
/** Request subject for policy hash query */
export const POLICY_HASH_REQUEST_SUBJECT = 'titan.req.exec.policy_hash.v1';
/**
 * Request the current policy hash from the Execution Engine.
 *
 * @param nats - NatsClient instance
 * @param timeoutMs - Request timeout in milliseconds (default: 5000)
 * @param retries - Number of retry attempts (default: 3)
 * @returns PolicyHashResponse from Execution Engine
 * @throws Error if Execution does not respond within timeout after all retries
 */
export async function requestExecutionPolicyHash(nats, timeoutMs = 5000, retries = 3) {
    // eslint-disable-next-line functional/no-let
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await nats.request(POLICY_HASH_REQUEST_SUBJECT, { request_type: 'policy_hash' }, { timeout: timeoutMs });
            if (!response.policy_hash) {
                throw new Error('Invalid response: missing policy_hash field');
            }
            return response;
        }
        catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            console.warn(`Policy hash request attempt ${attempt}/${retries} failed: ${lastError.message}`);
            if (attempt < retries) {
                // Exponential backoff: 500ms, 1000ms, 2000ms...
                await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
            }
        }
    }
    throw new Error(`Failed to get policy hash from Execution after ${retries} attempts: ${lastError?.message}`);
}
/**
 * Verify that Brain's local policy hash matches Execution's policy hash.
 *
 * @param nats - NatsClient instance
 * @param localPolicyHash - Brain's current policy hash
 * @param timeoutMs - Request timeout in milliseconds
 * @param retries - Number of retry attempts
 * @returns PolicyHandshakeResult with success status and details
 */
export async function verifyExecutionPolicyHash(nats, localPolicyHash, timeoutMs = 5000, retries = 3) {
    try {
        const response = await requestExecutionPolicyHash(nats, timeoutMs, retries);
        if (response.policy_hash === localPolicyHash) {
            return {
                success: true,
                localHash: localPolicyHash,
                remoteHash: response.policy_hash,
            };
        }
        return {
            success: false,
            localHash: localPolicyHash,
            remoteHash: response.policy_hash,
            error: `Policy hash mismatch: Brain has ${localPolicyHash}, Execution has ${response.policy_hash}`,
        };
    }
    catch (err) {
        return {
            success: false,
            localHash: localPolicyHash,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
//# sourceMappingURL=PolicyHandshake.js.map