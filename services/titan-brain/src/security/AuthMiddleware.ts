/* eslint-disable functional/immutable-data -- Stateful runtime: mutations architecturally required */
import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { Logger } from '../logging/Logger.js';
import { OAuthService } from './OAuthService.js';

export interface TokenPayload {
  operatorId: string;
  role: string | string[]; // Legacy compatibility
  permissions?: string[]; // New PBAC support
  scope?: string[]; // OAuth scopes
  iat: number;
  exp: number;
}

export class AuthMiddleware {
  private readonly secret: string;

  constructor(
    private readonly logger: Logger,
    private readonly oauthService?: OAuthService,
  ) {
    this.secret = process.env.JWT_SECRET || process.env.HMAC_SECRET || '';

    if (!this.secret) {
      if (process.env.NODE_ENV === 'test') {
        this.secret = 'test-secret-123';
        this.logger.warn('⚠️ AuthMiddleware using TEST secret');
      } else {
        throw new Error('FATAL: JWT_SECRET or HMAC_SECRET must be set');
      }
    }
  }

  /**
   * Generating a JWT token (supports both direct and OAuth flows)
   */
  generateToken(payload: Partial<TokenPayload>): string {
    return jwt.sign(payload, this.secret, { expiresIn: '8h' });
  }

  /**
   * Fastify middleware to verify JWT token
   */
  async verifyToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        reply.status(401).send({
          error: 'Missing Authorization header',
        });
        return;
      }

      const [scheme, token] = authHeader.split(' ');
      if (scheme !== 'Bearer' || !token) {
        reply.status(401).send({
          error: 'Invalid Authorization header format',
        });
        return;
      }

      const decoded = this.verifyTokenString(token);

      // Attach user to request
      // @ts-expect-error - We are extending the request object dynamically
      request.user = decoded;
    } catch (error) {
      reply.status(401).send({
        error: 'Invalid or expired token',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Verify a raw JWT token string
   */
  verifyTokenString(token: string): TokenPayload {
    try {
      return jwt.verify(token, this.secret) as TokenPayload;
    } catch (error) {
      throw new Error(
        `Token verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Factory for permission-based guard (PBAC)
   * Falls back to role check if permissions not present
   */
  requirePermission(requiredPermission: string) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // @ts-expect-error - fastify-raw-body attaches rawBody to request but types are not merged
      const user = request.user as TokenPayload;

      if (!user) {
        reply.status(401).send({ error: 'Unauthenticated' });
        return;
      }

      // 1. Check Permissions (SOTA)
      if (user.permissions && user.permissions.includes(requiredPermission)) {
        return;
      }

      // 2. Fallback to Role (Legacy/Transitional)
      // Check if role implies superadmin
      const roles = Array.isArray(user.role) ? user.role : [user.role];
      if (roles.includes('superadmin')) {
        return;
      }

      this.logger.warn(
        `Access denied for user ${user.operatorId}. Required: ${requiredPermission}`,
      );
      reply.status(403).send({ error: 'Insufficient permissions' });
    };
  }

  /**
   * @deprecated Use requirePermission
   */
  requireRole(requiredRole: string) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // @ts-expect-error - fastify-raw-body attaches rawBody to request but types are not merged
      const user = request.user as TokenPayload;
      if (!user) {
        reply.status(401).send({ error: 'Unauthenticated' });
        return;
      }

      const roles = Array.isArray(user.role) ? user.role : [user.role];
      if (!roles.includes(requiredRole) && !roles.includes('superadmin')) {
        reply.status(403).send({ error: 'Insufficient permissions' });
      }
    };
  }
}
