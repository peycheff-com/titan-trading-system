/* eslint-disable functional/immutable-data -- Stateful runtime: mutations architecturally required */
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export interface SafetySession {
  id: string;
  actorId: string;
  role: 'owner' | 'risk_officer' | 'operator';
  armedAt: number;
  expiresAt: number;
  signature: string;
  clientIp?: string;
  reason?: string;
}

export class SafetySessionManager {
  private redis: Redis;
  private readonly SESSION_PREFIX = 'titan:safety:session:';
  private readonly SECRET = process.env.SAFETY_SECRET || 'dev-secret-do-not-use-in-prod';
  private readonly DEFAULT_TTL_SECONDS = 300; // 5 minutes

  constructor(redisOrUrl: string | Redis) {
    if (typeof redisOrUrl === 'string') {
      this.redis = new Redis(redisOrUrl);
    } else {
      this.redis = redisOrUrl;
    }
  }

  /**
   * Arm the console - Creates a new high-security session
   */
  async armConsole(
    actorId: string,
    role: 'owner' | 'risk_officer' | 'operator',
    reason: string,
    clientIp?: string,
    ttlSeconds: number = this.DEFAULT_TTL_SECONDS,
  ): Promise<SafetySession> {
    const sessionId = uuidv4();
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;

    const sessionData = {
      id: sessionId,
      actorId,
      role,
      armedAt: now,
      expiresAt,
      clientIp,
      reason,
    };

    // Sign the session data
    const signature = this.signSession(sessionData); // Simple signature of ID

    // Store full object
    const session: SafetySession = {
      ...sessionData,
      signature,
    };

    await this.redis.setex(
      `${this.SESSION_PREFIX}${sessionId}`,
      ttlSeconds,
      JSON.stringify(session),
    );

    console.log(`[Safety] Console ARMED by ${actorId} (${role}). Session: ${sessionId}`);
    return session;
  }

  /**
   * Validate a session token (ID)
   */
  async validateSession(sessionId: string): Promise<SafetySession | null> {
    const data = await this.redis.get(`${this.SESSION_PREFIX}${sessionId}`);
    if (!data) return null;

    try {
      const session: SafetySession = JSON.parse(data);
      if (Date.now() > session.expiresAt) {
        await this.disarmConsole(sessionId);
        return null;
      }
      return session;
    } catch (e) {
      console.error('Failed to parse safety session', e);
      return null;
    }
  }

  /**
   * Disarm - Destroy session
   */
  async disarmConsole(sessionId: string): Promise<void> {
    await this.redis.del(`${this.SESSION_PREFIX}${sessionId}`);
    console.log(`[Safety] Console DISARMED. Session: ${sessionId}`);
  }

  /**
   * Refresh - Extend TTL
   */
  async refreshSession(sessionId: string, ttlSeconds: number = 60): Promise<SafetySession | null> {
    const session = await this.validateSession(sessionId);
    if (!session) return null;

    session.expiresAt = Date.now() + ttlSeconds * 1000;
    await this.redis.setex(
      `${this.SESSION_PREFIX}${sessionId}`,
      ttlSeconds,
      JSON.stringify(session),
    );
    return session;
  }

  private signSession(data: Omit<SafetySession, 'signature'>): string {
    const hmac = crypto.createHmac('sha256', this.SECRET);
    hmac.update(`${data.id}:${data.actorId}:${data.armedAt}:${data.role}`);
    return hmac.digest('hex');
  }
}
