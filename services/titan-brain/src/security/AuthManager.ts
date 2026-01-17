/**
 * AuthManager - Handles JWT authentication
 * Requirements: Phase 5 (Security)
 */

import jwt from "jsonwebtoken";
import { Logger } from "../logging/Logger.js";

export interface AuthConfig {
    secret: string;
    expiresIn: string | number;
}

export interface UserPayload {
    id: string;
    role: "operator" | "admin" | "viewer";
    permissions: string[];
}

export class AuthManager {
    private readonly config: AuthConfig;
    private readonly logger: Logger;

    constructor(config: AuthConfig) {
        this.config = config;
        this.logger = Logger.getInstance("auth-manager");

        if (
            !this.config.secret || this.config.secret === "default-dev-secret"
        ) {
            this.logger.warn(
                "⚠️ USING INSECURE JWT SECRET. Do not use in production.",
            );
        }
    }

    /**
     * Sign a token for a user
     */
    signToken(payload: UserPayload): string {
        try {
            return jwt.sign(payload, this.config.secret, {
                expiresIn: this.config.expiresIn as any,
            });
        } catch (error) {
            this.logger.error("Failed to sign token", error as Error);
            throw error;
        }
    }

    /**
     * Verify a token
     */
    verifyToken(token: string): UserPayload {
        try {
            return jwt.verify(token, this.config.secret) as UserPayload;
        } catch (error) {
            throw new Error(`Invalid token: ${(error as Error).message}`);
        }
    }

    /**
     * Generate a mock token for development
     */
    generateDevToken(): string {
        return this.signToken({
            id: "dev-operator",
            role: "admin",
            permissions: ["*"],
        });
    }
}
