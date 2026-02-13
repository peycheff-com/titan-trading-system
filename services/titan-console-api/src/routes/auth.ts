import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';

interface LoginBody {
  operator_id: string;
  password: string;
}

/** Constant-time string comparison to prevent timing attacks */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: LoginBody }>(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { operator_id, password } = request.body;

      // MVP Auth: Check against Environment Variables
      // In production, this should query the `user_credentials` or `operators` table.
      const masterPassword = process.env.TITAN_MASTER_PASSWORD;
      const masterOperator = process.env.TITAN_MASTER_OPERATOR || 'operator';

      if (!masterPassword) {
        request.log.error('TITAN_MASTER_PASSWORD not configured');
        return reply.code(500).send({ error: 'Auth configuration error' });
      }

      if (safeCompare(operator_id, masterOperator) && safeCompare(password, masterPassword)) {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          request.log.error('JWT_SECRET not configured');
          return reply.code(500).send({ error: 'Auth configuration error' });
        }
        // Issue Token
        const token = jwt.sign(
          {
            id: operator_id,
            roles: ['admin', 'operator'],
          },
          secret,
          { expiresIn: '8h' },
        );

        request.log.info(`Operator ${operator_id} logged in successfully`);

        return {
          success: true,
          token,
          roles: ['admin', 'operator'],
        };
      }

      // Invalid credentials
      request.log.warn(`Failed login attempt for ${operator_id}`);
      return reply.code(401).send({ error: 'Invalid credentials' });
    },
  );
}
