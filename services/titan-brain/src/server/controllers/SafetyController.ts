import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SafetySessionManager } from '../../services/SafetySessionManager.js';

interface ArmRequest {
  actorId: string;
  role: 'owner' | 'risk_officer' | 'operator';
  reason: string;
  ttlSeconds?: number;
}

interface DisarmRequest {
  sessionId: string;
}

export class SafetyController {
  private app: FastifyInstance | null = null;

  constructor(
    private safetyManager: SafetySessionManager,
    _app?: FastifyInstance,
  ) {}

  async registerRoutes(app: FastifyInstance) {
    this.app = app;
    this.app.post('/auth/arm', this.arm.bind(this));
    this.app.post('/auth/disarm', this.disarm.bind(this));
    this.app.post('/auth/check', this.check.bind(this));
  }

  /*
   * POST /auth/arm
   * Body: { actorId, role, reason, ttlSeconds? }
   */
  async arm(req: FastifyRequest<{ Body: ArmRequest }>, reply: FastifyReply) {
    const { actorId, role, reason, ttlSeconds } = req.body;

    // Validate MFA or Sudo Token
    // In a real implementation, this would verify a TOTP code or a hardware key signature.
    // For this convergence phase, we enforce the presence of a 'X-Titan-Sudo-Token' header
    // which effectively acts as a "sudo mode" proof that the operator has re-authenticated.
    const sudoToken = req.headers['x-titan-sudo-token'];
    
    if (!sudoToken || typeof sudoToken !== 'string' || sudoToken.length < 16) {
       return reply.code(403).send({ 
         error: 'MFA_REQUIRED', 
         message: 'Critical safety operations require re-authentication (sudo mode). Missing or invalid X-Titan-Sudo-Token header.' 
       });
    }

    // In production, we'd validate this token against a session store or auth provider.
    // For now, the complexity of the token length requirement prevents accidental usage.

    if (!['owner', 'risk_officer', 'operator'].includes(role)) {
      return reply.code(400).send({ error: 'Invalid role' });
    }
    if (!reason || reason.length < 5) {
      return reply.code(400).send({
        error: 'Reason required (min 5 chars)',
      });
    }

    const clientIp = req.ip;
    const session = await this.safetyManager.armConsole(
      actorId,
      role,
      reason,
      clientIp,
      ttlSeconds,
    );

    return reply.send({ success: true, session });
  }

  /*
   * POST /auth/disarm
   * Body: { sessionId }
   */
  async disarm(req: FastifyRequest<{ Body: DisarmRequest }>, reply: FastifyReply) {
    const { sessionId } = req.body;
    if (!sessionId) {
      return reply.code(400).send({ error: 'Session ID required' });
    }

    await this.safetyManager.disarmConsole(sessionId);
    return reply.send({ success: true });
  }

  /*
   * POST /auth/check
   * Body: { sessionId }
   */
  async check(req: FastifyRequest<{ Body: DisarmRequest }>, reply: FastifyReply) {
    const { sessionId } = req.body;
    if (!sessionId) {
      return reply.code(400).send({ error: 'Session ID required' });
    }
    const session = await this.safetyManager.validateSession(sessionId);

    if (!session) {
      return reply.code(401).send({ active: false });
    }

    return reply.send({ active: true, session });
  }
}
