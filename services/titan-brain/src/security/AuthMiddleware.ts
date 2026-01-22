import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { Logger } from '../logging/Logger.js';

export interface TokenPayload {
  operatorId: string;
  role: string | string[];
  iat: number;
  exp: number;
}

export class AuthMiddleware {
  private readonly secret: string;

  constructor(private readonly logger: Logger) {
    this.secret = process.env.JWT_SECRET || process.env.HMAC_SECRET || 'default-secret-change-me';

    if (this.secret === 'default-secret-change-me') {
      this.logger.warn('⚠️ AuthMiddleware using default insecure secret!');
    }
  }

  /**
   * Generating a JWT token for a logged-in operator
   */
  generateToken(operatorId: string, role: string | string[]): string {
    return jwt.sign({ operatorId, role }, this.secret, { expiresIn: '8h' });
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
      // @ts-ignore - We are extending the request object dynamically
      // eslint-disable-next-line functional/immutable-data
      request.user = decoded;

      // Log audit
      // this.logger.debug(`Authenticated operator: ${decoded.operatorId}`);
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
   * Factory for role-based guard
   */
  requireRole(requiredRole: string) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // @ts-ignore
      const user = request.user as TokenPayload;
      if (!user) {
        reply.status(401).send({ error: 'Unauthenticated' });
        return;
      }

      const roles = Array.isArray(user.role) ? user.role : [user.role];
      if (!roles.includes(requiredRole) && !roles.includes('superadmin')) {
        this.logger.warn(
          `Access denied for user ${user.operatorId}. Required: ${requiredRole}, Has: ${roles.join(
            ',',
          )}`,
        );
        reply.status(403).send({ error: 'Insufficient permissions' });
      }
    };
  }
}
