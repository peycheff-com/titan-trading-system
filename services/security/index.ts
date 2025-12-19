/**
 * Titan Security Layer - Main Export Module
 * 
 * This module provides comprehensive security functionality for the Titan Production Deployment system:
 * - TLS 1.3 configuration and certificate management
 * - IP whitelisting and access control
 * - API key management with automated rotation
 * - Fail2Ban integration for brute force protection
 * - Security event logging and monitoring
 */

export { TLSManager, TLSConfig, SSLCertificate, CertificateRenewalResult } from './TLSManager';
export { 
  AccessControlManager, 
  IPWhitelistConfig, 
  Fail2BanConfig, 
  AccessAttempt, 
  FirewallRule 
} from './AccessControlManager';
export { 
  APIKeyManager, 
  APIKey, 
  EncryptedAPIKey, 
  KeyRotationResult, 
  KeyVault, 
  RotationSchedule 
} from './APIKeyManager';

/**
 * Security Layer - Main orchestrator class
 * 
 * Implements the SecurityLayer interface from the design document
 */
export class SecurityLayer {
  private tlsManager: TLSManager;
  private accessControlManager: AccessControlManager;
  private apiKeyManager: APIKeyManager;

  constructor() {
    this.tlsManager = new TLSManager();
    this.accessControlManager = new AccessControlManager();
    this.apiKeyManager = new APIKeyManager();
  }

  /**
   * Set up TLS 1.3 configuration for a domain
   * Requirement 4.1: THE Security_Layer SHALL encrypt all API communications using TLS 1.3
   */
  async setupTLS(domain: string): Promise<TLSConfig> {
    return this.tlsManager.setupTLS(domain);
  }

  /**
   * Rotate API keys automatically
   * Requirement 4.2: THE Security_Layer SHALL implement API key rotation every 30 days
   */
  async rotateAPIKeys(): Promise<KeyRotationResult[]> {
    return this.apiKeyManager.autoRotateExpiredKeys();
  }

  /**
   * Configure IP whitelist for authorized access
   * Requirement 4.3: THE Security_Layer SHALL restrict server access to authorized IP addresses only
   */
  async configureIPWhitelist(allowedIPs: string[]): Promise<void> {
    return this.accessControlManager.configureIPWhitelist(allowedIPs);
  }

  /**
   * Set up Fail2Ban for brute force protection
   * Requirement 4.4: THE Security_Layer SHALL implement fail2ban for brute force protection
   */
  async setupFail2Ban(): Promise<void> {
    return this.accessControlManager.setupFail2Ban();
  }

  /**
   * Get security audit report
   * Requirement 4.5: THE Security_Layer SHALL log all security events to a centralized security log
   */
  async auditSecurityEvents(): Promise<{
    tlsStatus: any;
    accessControlStatus: any;
    keyRotationStatus: any;
  }> {
    const [tlsStatus, accessControlStatus, keyRotationStatus] = await Promise.all([
      this.tlsManager.getTLSStatus(''),
      this.accessControlManager.getAccessControlStatus(),
      this.apiKeyManager.getRotationStatus()
    ]);

    return {
      tlsStatus,
      accessControlStatus,
      keyRotationStatus
    };
  }

  /**
   * Initialize the security layer with master password
   */
  async initialize(masterPassword: string): Promise<void> {
    await this.apiKeyManager.initialize(masterPassword);
  }
}