import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

interface LoginBody {
  operator_id: string;
  password: string;
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: LoginBody }>('/auth/login', async (request, reply) => {
    const { operator_id, password } = request.body;

    // MVP Auth: Check against Environment Variables
    // In production, this should query the `user_credentials` or `operators` table.
    const masterPassword = process.env.TITAN_MASTER_PASSWORD;
    const masterOperator = process.env.TITAN_MASTER_OPERATOR || 'operator';

    if (!masterPassword) {
      request.log.error('TITAN_MASTER_PASSWORD not configured');
      return reply.code(500).send({ error: 'Auth configuration error' });
    }

    if (operator_id === masterOperator && password === masterPassword) {
      const secret = process.env.JWT_SECRET || 'dev-secret';
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
  });
}
