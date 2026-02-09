import crypto from 'crypto';
import { Logger } from '../logging/Logger.js';

export interface OAuthClient {
  id: string;
  name: string;
  redirectUris: string[];
  clientType: 'public' | 'confidential';
}

export interface AuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  scope: string[];
  expiresAt: number;
  operatorId: string;
}

export class OAuthService {
  private readonly codes = new Map<string, AuthCode>();
  private readonly clients = new Map<string, OAuthClient>();

  constructor(private readonly logger: Logger) {
    // Register default clients
    this.registerClient({
      id: 'titan-console',
      name: 'Titan Console',
      redirectUris: ['http://localhost:3000/callback', 'https://titan.trade/callback'],
      clientType: 'public',
    });
  }

  registerClient(client: OAuthClient) {
    this.clients.set(client.id, client);
  }

  /**
   * Generate an ephemeral authorization code bound to PKCE challenge
   */
  generateAuthCode(
    clientId: string,
    redirectUri: string,
    codeChallenge: string,
    operatorId: string,
    scope: string[] = []
  ): string {
    const client = this.clients.get(clientId);
    if (!client) {
      throw new Error('Invalid client_id');
    }

    if (!client.redirectUris.includes(redirectUri)) {
      throw new Error('Invalid redirect_uri');
    }

    const code = crypto.randomBytes(32).toString('hex');
    
    this.codes.set(code, {
      code,
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod: 'S256',
      scope,
      expiresAt: Date.now() + 60000, // 1 minute life
      operatorId,
    });

    this.logger.debug(`Generated auth code for ${operatorId} via ${clientId}`);
    return code;
  }

  /**
   * Exchange auth code for token payload (validating PKCE)
   */
  validateAuthCode(
    code: string,
    codeVerifier: string,
    clientId: string
  ): { operatorId: string; scope: string[] } {
    const authCode = this.codes.get(code);

    if (!authCode) {
      throw new Error('Invalid or expired authorization code');
    }

    if (authCode.clientId !== clientId) {
      throw new Error('Client mismatch');
    }

    if (Date.now() > authCode.expiresAt) {
      this.codes.delete(code);
      throw new Error('Authorization code expired');
    }

    // PKCE Validation (S256)
    const hash = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url'); // OAuth 2.1 uses base64url

    if (hash !== authCode.codeChallenge) {
      this.logger.warn(`PKCE mismatch: Expected ${authCode.codeChallenge}, Got ${hash}`);
      throw new Error('Invalid code_verifier');
    }

    // Burn the code (one-time use)
    this.codes.delete(code);

    return {
      operatorId: authCode.operatorId,
      scope: authCode.scope,
    };
  }
}
