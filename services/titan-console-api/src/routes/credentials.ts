/**
 * Credentials API Routes
 *
 * CRUD operations for secure credential management with:
 * - Encrypted storage
 * - Audit logging
 * - Connection testing
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Pool } from "pg";
import {
    CredentialInput,
    CredentialProvider,
    CredentialType,
    getCredentialVault,
} from "../services/CredentialVault.js";

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

interface CredentialParams {
    id: string;
}

interface CredentialBody {
    provider: CredentialProvider;
    credentials: {
        apiKey?: string;
        apiSecret?: string;
    };
    metadata?: {
        testnet?: boolean;
        category?: string;
    };
}

interface CredentialListItem {
    id: string;
    provider: CredentialProvider;
    credentialType: CredentialType;
    maskedValue: string;
    metadata: Record<string, unknown>;
    validationStatus: string;
    lastValidatedAt: string | null;
    updatedAt: string;
}

// Audit logging helper
async function logAudit(
    credentialId: string,
    userId: string,
    action: string,
    accessor: string,
    metadata: Record<string, unknown> = {},
    request?: FastifyRequest,
) {
    const ip = request?.ip || "system";
    const userAgent = request?.headers["user-agent"] || "system";

    await pool.query(
        `INSERT INTO credential_audit_log 
     (credential_id, user_id, action, accessor, ip_address, user_agent, metadata, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            credentialId,
            userId,
            action,
            accessor,
            ip,
            userAgent,
            JSON.stringify(metadata),
            Date.now(),
        ],
    );
}

export default async function credentialsRoutes(fastify: FastifyInstance) {
    // List all credentials for the user (redacted)
    fastify.get(
        "/api/credentials",
        async (request: FastifyRequest, reply: FastifyReply) => {
            const userId = (request as any).user?.id || "default-user";
            const vault = getCredentialVault();

            const result = await pool.query(
                `SELECT id, provider, credential_type, encrypted_value, metadata, 
              validation_status, last_validated_at, updated_at
       FROM user_credentials 
       WHERE user_id = $1 AND is_active = true
       ORDER BY provider, credential_type`,
                [userId],
            );

            const credentials: CredentialListItem[] = result.rows.map(
                (row) => ({
                    id: row.id,
                    provider: row.provider,
                    credentialType: row.credential_type,
                    maskedValue: vault.mask(row.encrypted_value.slice(0, 20)), // Mask for display
                    metadata: row.metadata || {},
                    validationStatus: row.validation_status,
                    lastValidatedAt: row.last_validated_at?.toISOString() ||
                        null,
                    updatedAt: row.updated_at?.toISOString(),
                })
            );

            // Group by provider
            const grouped: Record<string, CredentialListItem[]> = {};
            credentials.forEach((cred) => {
                if (!grouped[cred.provider]) {
                    grouped[cred.provider] = [];
                }
                grouped[cred.provider].push(cred);
            });

            return { credentials: grouped };
        },
    );

    // Add or update credentials for a provider
    fastify.post(
        "/api/credentials",
        async (
            request: FastifyRequest<{ Body: CredentialBody }>,
            reply: FastifyReply,
        ) => {
            const userId = (request as any).user?.id || "default-user";
            const vault = getCredentialVault();
            const { provider, credentials, metadata = {} } = request.body;

            if (!provider || !credentials) {
                return reply.status(400).send({
                    error: "Provider and credentials are required",
                });
            }

            const results: { type: string; id: string }[] = [];

            // Save API Key if provided
            if (credentials.apiKey) {
                const encrypted = vault.encrypt(credentials.apiKey);

                const result = await pool.query(
                    `INSERT INTO user_credentials 
         (user_id, provider, credential_type, encrypted_value, iv, auth_tag, metadata)
         VALUES ($1, $2, 'api_key', $3, $4, $5, $6)
         ON CONFLICT (user_id, provider, credential_type)
         DO UPDATE SET 
           encrypted_value = EXCLUDED.encrypted_value,
           iv = EXCLUDED.iv,
           auth_tag = EXCLUDED.auth_tag,
           metadata = EXCLUDED.metadata,
           validation_status = 'pending'
         RETURNING id`,
                    [
                        userId,
                        provider,
                        encrypted.encryptedValue,
                        encrypted.iv,
                        encrypted.authTag,
                        JSON.stringify(metadata),
                    ],
                );

                const credId = result.rows[0].id;
                results.push({ type: "api_key", id: credId });
                await logAudit(credId, userId, "upsert", "console-api", {
                    provider,
                }, request);
            }

            // Save API Secret if provided
            if (credentials.apiSecret) {
                const encrypted = vault.encrypt(credentials.apiSecret);

                const result = await pool.query(
                    `INSERT INTO user_credentials 
         (user_id, provider, credential_type, encrypted_value, iv, auth_tag, metadata)
         VALUES ($1, $2, 'api_secret', $3, $4, $5, $6)
         ON CONFLICT (user_id, provider, credential_type)
         DO UPDATE SET 
           encrypted_value = EXCLUDED.encrypted_value,
           iv = EXCLUDED.iv,
           auth_tag = EXCLUDED.auth_tag,
           metadata = EXCLUDED.metadata,
           validation_status = 'pending'
         RETURNING id`,
                    [
                        userId,
                        provider,
                        encrypted.encryptedValue,
                        encrypted.iv,
                        encrypted.authTag,
                        JSON.stringify(metadata),
                    ],
                );

                const credId = result.rows[0].id;
                results.push({ type: "api_secret", id: credId });
                await logAudit(credId, userId, "upsert", "console-api", {
                    provider,
                }, request);
            }

            return {
                success: true,
                message: `Credentials saved for ${provider}`,
                saved: results,
            };
        },
    );

    // Delete credentials for a provider
    fastify.delete(
        "/api/credentials/:provider",
        async (
            request: FastifyRequest<{ Params: { provider: string } }>,
            reply: FastifyReply,
        ) => {
            const userId = (request as any).user?.id || "default-user";
            const { provider } = request.params;

            // Get credential IDs for audit
            const existing = await pool.query(
                `SELECT id FROM user_credentials WHERE user_id = $1 AND provider = $2 AND is_active = true`,
                [userId, provider],
            );

            // Soft delete
            await pool.query(
                `UPDATE user_credentials 
       SET is_active = false 
       WHERE user_id = $1 AND provider = $2`,
                [userId, provider],
            );

            // Log audit for each deleted credential
            for (const row of existing.rows) {
                await logAudit(row.id, userId, "delete", "console-api", {
                    provider,
                }, request);
            }

            return {
                success: true,
                message: `Credentials deleted for ${provider}`,
            };
        },
    );

    // Test connection for a provider
    fastify.post(
        "/api/credentials/:provider/test",
        async (
            request: FastifyRequest<{ Params: { provider: string } }>,
            reply: FastifyReply,
        ) => {
            const userId = (request as any).user?.id || "default-user";
            const vault = getCredentialVault();
            const { provider } = request.params;

            // Fetch credentials
            const result = await pool.query(
                `SELECT credential_type, encrypted_value, iv, auth_tag 
       FROM user_credentials 
       WHERE user_id = $1 AND provider = $2 AND is_active = true`,
                [userId, provider],
            );

            if (result.rows.length === 0) {
                return reply.status(404).send({
                    error: `No credentials found for ${provider}`,
                });
            }

            // Decrypt credentials
            const creds: Record<string, string> = {};
            for (const row of result.rows) {
                creds[row.credential_type] = vault.decrypt({
                    encryptedValue: row.encrypted_value,
                    iv: row.iv,
                    authTag: row.auth_tag,
                });
            }

            // Test connection based on provider
            let testResult: {
                success: boolean;
                message: string;
                accountInfo?: unknown;
            };

            try {
                switch (provider) {
                    case "bybit":
                        testResult = await testBybitConnection(creds);
                        break;
                    case "binance":
                        testResult = await testBinanceConnection(creds);
                        break;
                    case "gemini":
                        testResult = await testGeminiConnection(creds);
                        break;
                    default:
                        testResult = {
                            success: true,
                            message: "Credentials stored (no test available)",
                        };
                }
            } catch (error) {
                testResult = {
                    success: false,
                    message: error instanceof Error
                        ? error.message
                        : "Connection test failed",
                };
            }

            // Update validation status
            const validationStatus = testResult.success ? "valid" : "invalid";
            await pool.query(
                `UPDATE user_credentials 
       SET validation_status = $1, last_validated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2 AND provider = $3`,
                [validationStatus, userId, provider],
            );

            // Audit log
            for (const row of result.rows) {
                await logAudit(
                    row.id || "unknown",
                    userId,
                    "validate",
                    "console-api",
                    {
                        provider,
                        success: testResult.success,
                    },
                    request,
                );
            }

            return testResult;
        },
    );

    // Get credentials for service (internal, via NATS usually)
    fastify.get(
        "/api/credentials/:provider/internal",
        async (
            request: FastifyRequest<{ Params: { provider: string } }>,
            reply: FastifyReply,
        ) => {
            const userId = (request as any).user?.id || "default-user";
            const vault = getCredentialVault();
            const { provider } = request.params;

            // Verify internal call (should be via NATS or internal service)
            const authHeader = request.headers["x-internal-auth"];
            if (authHeader !== process.env.INTERNAL_AUTH_SECRET) {
                return reply.status(403).send({ error: "Forbidden" });
            }

            const result = await pool.query(
                `SELECT credential_type, encrypted_value, iv, auth_tag, metadata
       FROM user_credentials 
       WHERE user_id = $1 AND provider = $2 AND is_active = true`,
                [userId, provider],
            );

            if (result.rows.length === 0) {
                return reply.status(404).send({
                    error: `No credentials found for ${provider}`,
                });
            }

            // Decrypt and return
            const credentials: Record<string, string> = {};
            let metadata: Record<string, unknown> = {};

            for (const row of result.rows) {
                credentials[row.credential_type] = vault.decrypt({
                    encryptedValue: row.encrypted_value,
                    iv: row.iv,
                    authTag: row.auth_tag,
                });
                metadata = { ...metadata, ...row.metadata };

                // Audit the access
                await logAudit(
                    row.id || "unknown",
                    userId,
                    "access",
                    "internal-service",
                    { provider },
                    request,
                );
            }

            return { provider, credentials, metadata };
        },
    );
}

// Connection test helpers
async function testBybitConnection(
    creds: Record<string, string>,
): Promise<{ success: boolean; message: string; accountInfo?: unknown }> {
    const apiKey = creds["api_key"];
    const apiSecret = creds["api_secret"];

    if (!apiKey || !apiSecret) {
        return { success: false, message: "Missing API key or secret" };
    }

    // Simple test - get account info
    const timestamp = Date.now();
    const crypto = await import("crypto");
    const params = `api_key=${apiKey}&recv_window=5000&timestamp=${timestamp}`;
    const signature = crypto.createHmac("sha256", apiSecret).update(params)
        .digest("hex");

    const response = await fetch(
        `https://api.bybit.com/v5/account/wallet-balance?accountType=UNIFIED&${params}&sign=${signature}`,
        { headers: { "X-BAPI-API-KEY": apiKey } },
    );

    const data = await response.json();

    if (data.retCode === 0) {
        return {
            success: true,
            message: "Connection successful",
            accountInfo: { accountType: "UNIFIED" },
        };
    }

    return { success: false, message: data.retMsg || "Authentication failed" };
}

async function testBinanceConnection(
    creds: Record<string, string>,
): Promise<{ success: boolean; message: string }> {
    const apiKey = creds["api_key"];
    const apiSecret = creds["api_secret"];

    if (!apiKey || !apiSecret) {
        return { success: false, message: "Missing API key or secret" };
    }

    const timestamp = Date.now();
    const crypto = await import("crypto");
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto.createHmac("sha256", apiSecret).update(queryString)
        .digest("hex");

    const response = await fetch(
        `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
        { headers: { "X-MBX-APIKEY": apiKey } },
    );

    if (response.ok) {
        return { success: true, message: "Connection successful" };
    }

    const error = await response.json();
    return { success: false, message: error.msg || "Authentication failed" };
}

async function testGeminiConnection(
    creds: Record<string, string>,
): Promise<{ success: boolean; message: string }> {
    const apiKey = creds["api_key"];

    if (!apiKey) {
        return { success: false, message: "Missing API key" };
    }

    // Test with a simple model info call
    try {
        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro?key=" +
                apiKey,
        );

        if (response.ok) {
            return { success: true, message: "Gemini API key valid" };
        }

        const error = await response.json();
        return {
            success: false,
            message: error.error?.message || "Invalid API key",
        };
    } catch (e) {
        return { success: false, message: "Failed to connect to Gemini API" };
    }
}
