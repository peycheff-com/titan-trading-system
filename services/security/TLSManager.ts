/**
 * TLS Manager - Handles TLS 1.3 configuration and certificate management
 * 
 * Requirements:
 * - 4.1: THE Security_Layer SHALL encrypt all API communications using TLS 1.3
 * - 1.4: THE Infrastructure_Provisioner SHALL set up SSL certificates for secure communication
 */

import { promises as fs } from 'fs';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as crypto from 'crypto';

const execAsync = promisify(exec);

export interface TLSConfig {
  domain: string;
  certificatePath: string;
  privateKeyPath: string;
  chainPath: string;
  tlsVersion: '1.3';
  cipherSuites: string[];
  protocols: string[];
  expiryDate: Date;
  autoRenewal: boolean;
}

export interface SSLCertificate {
  domain: string;
  certificatePath: string;
  privateKeyPath: string;
  chainPath: string;
  expiryDate: Date;
  issuer: string;
  fingerprint: string;
}

export interface CertificateRenewalResult {
  success: boolean;
  domain: string;
  newExpiryDate?: Date;
  error?: string;
  renewalTime: number;
}

export class TLSManager {
  private readonly certDir: string;
  private readonly nginxConfigDir: string;
  private readonly logFile: string;

  constructor(
    certDir: string = '/etc/letsencrypt/live',
    nginxConfigDir: string = '/etc/nginx/sites-available',
    logFile: string = '/var/log/titan/tls-manager.log'
  ) {
    this.certDir = certDir;
    this.nginxConfigDir = nginxConfigDir;
    this.logFile = logFile;
  }

  /**
   * Set up TLS 1.3 configuration for a domain
   */
  async setupTLS(domain: string): Promise<TLSConfig> {
    try {
      this.log(`Setting up TLS 1.3 for domain: ${domain}`);

      // Generate or obtain SSL certificate
      const certificate = await this.obtainCertificate(domain);

      // Generate Nginx TLS 1.3 configuration
      const tlsConfig = await this.generateTLSConfig(domain, certificate);

      // Apply Nginx configuration
      await this.applyNginxConfig(domain, tlsConfig);

      // Set up automatic renewal
      await this.setupAutoRenewal(domain);

      this.log(`TLS 1.3 setup completed for domain: ${domain}`);
      return tlsConfig;

    } catch (error) {
      this.log(`TLS setup failed for domain ${domain}: ${error.message}`);
      throw new Error(`Failed to setup TLS for ${domain}: ${error.message}`);
    }
  }

  /**
   * Obtain SSL certificate using Let's Encrypt
   */
  async obtainCertificate(domain: string): Promise<SSLCertificate> {
    try {
      this.log(`Obtaining SSL certificate for domain: ${domain}`);

      // Check if certificate already exists and is valid
      const existingCert = await this.checkExistingCertificate(domain);
      if (existingCert && this.isCertificateValid(existingCert)) {
        this.log(`Valid certificate already exists for domain: ${domain}`);
        return existingCert;
      }

      // Obtain new certificate using certbot
      const certbotCommand = `certbot certonly --nginx --non-interactive --agree-tos --email admin@${domain} -d ${domain}`;
      
      const { stdout, stderr } = await execAsync(certbotCommand);
      this.log(`Certbot output: ${stdout}`);
      
      if (stderr && !stderr.includes('Successfully received certificate')) {
        throw new Error(`Certbot error: ${stderr}`);
      }

      // Read certificate details
      const certificatePath = path.join(this.certDir, domain, 'fullchain.pem');
      const privateKeyPath = path.join(this.certDir, domain, 'privkey.pem');
      const chainPath = path.join(this.certDir, domain, 'chain.pem');

      // Verify certificate files exist
      await Promise.all([
        fs.access(certificatePath),
        fs.access(privateKeyPath),
        fs.access(chainPath)
      ]);

      // Extract certificate information
      const certInfo = await this.extractCertificateInfo(certificatePath);

      const certificate: SSLCertificate = {
        domain,
        certificatePath,
        privateKeyPath,
        chainPath,
        expiryDate: certInfo.expiryDate,
        issuer: certInfo.issuer,
        fingerprint: certInfo.fingerprint
      };

      this.log(`SSL certificate obtained successfully for domain: ${domain}`);
      return certificate;

    } catch (error) {
      this.log(`Failed to obtain certificate for domain ${domain}: ${error.message}`);
      throw new Error(`Certificate acquisition failed: ${error.message}`);
    }
  }

  /**
   * Generate TLS 1.3 configuration
   */
  private async generateTLSConfig(domain: string, certificate: SSLCertificate): Promise<TLSConfig> {
    const tlsConfig: TLSConfig = {
      domain,
      certificatePath: certificate.certificatePath,
      privateKeyPath: certificate.privateKeyPath,
      chainPath: certificate.chainPath,
      tlsVersion: '1.3',
      cipherSuites: [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'TLS_AES_128_GCM_SHA256'
      ],
      protocols: ['TLSv1.3'],
      expiryDate: certificate.expiryDate,
      autoRenewal: true
    };

    return tlsConfig;
  }

  /**
   * Apply Nginx TLS 1.3 configuration
   */
  private async applyNginxConfig(domain: string, tlsConfig: TLSConfig): Promise<void> {
    const nginxConfig = this.generateNginxTLSConfig(domain, tlsConfig);
    const configPath = path.join(this.nginxConfigDir, `${domain}-tls`);

    // Write Nginx configuration
    await fs.writeFile(configPath, nginxConfig, 'utf8');

    // Enable the site
    const enabledPath = `/etc/nginx/sites-enabled/${domain}-tls`;
    try {
      await fs.symlink(configPath, enabledPath);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }

    // Test Nginx configuration
    const { stderr } = await execAsync('nginx -t');
    if (stderr && !stderr.includes('syntax is ok')) {
      throw new Error(`Nginx configuration test failed: ${stderr}`);
    }

    // Reload Nginx
    await execAsync('systemctl reload nginx');
    this.log(`Nginx TLS configuration applied for domain: ${domain}`);
  }

  /**
   * Generate Nginx TLS 1.3 configuration
   */
  private generateNginxTLSConfig(domain: string, tlsConfig: TLSConfig): string {
    return `
# TLS 1.3 Configuration for ${domain}
# Generated by Titan Production Deployment System

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain};

    # TLS 1.3 Configuration
    ssl_certificate ${tlsConfig.certificatePath};
    ssl_certificate_key ${tlsConfig.privateKeyPath};
    ssl_trusted_certificate ${tlsConfig.chainPath};

    # Force TLS 1.3 only
    ssl_protocols TLSv1.3;
    ssl_ciphers ${tlsConfig.cipherSuites.join(':')};
    ssl_prefer_server_ciphers off;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Session Configuration
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # Titan Trading System Proxy Configuration
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Security
        proxy_hide_header X-Powered-By;
        proxy_set_header X-Forwarded-SSL on;
    }

    # WebSocket Support for Titan Console
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # API Endpoints
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
        
        # Security
        proxy_hide_header X-Powered-By;
    }

    # Health Check Endpoint
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    return 301 https://$server_name$request_uri;
}

# Rate Limiting Zones
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
`;
  }

  /**
   * Set up automatic certificate renewal
   */
  async setupAutoRenewal(domain: string): Promise<void> {
    try {
      // Create renewal script
      const renewalScript = this.generateRenewalScript(domain);
      const scriptPath = `/etc/cron.daily/titan-cert-renewal-${domain}`;
      
      await fs.writeFile(scriptPath, renewalScript, { mode: 0o755 });

      // Add to crontab for more frequent checks (twice daily)
      const cronEntry = `0 */12 * * * /usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx" >> /var/log/titan/cert-renewal.log 2>&1`;
      
      // Check if cron entry already exists
      const { stdout } = await execAsync('crontab -l 2>/dev/null || echo ""');
      if (!stdout.includes('certbot renew')) {
        const newCrontab = stdout.trim() + '\n' + cronEntry + '\n';
        await execAsync(`echo "${newCrontab}" | crontab -`);
      }

      this.log(`Automatic renewal setup completed for domain: ${domain}`);

    } catch (error) {
      this.log(`Failed to setup auto-renewal for domain ${domain}: ${error.message}`);
      throw new Error(`Auto-renewal setup failed: ${error.message}`);
    }
  }

  /**
   * Generate certificate renewal script
   */
  private generateRenewalScript(domain: string): string {
    return `#!/bin/bash
# Automatic certificate renewal script for ${domain}
# Generated by Titan Production Deployment System

LOG_FILE="/var/log/titan/cert-renewal-${domain}.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] Starting certificate renewal check for ${domain}" >> "$LOG_FILE"

# Check certificate expiry
EXPIRY_DATE=$(openssl x509 -enddate -noout -in /etc/letsencrypt/live/${domain}/fullchain.pem | cut -d= -f2)
EXPIRY_TIMESTAMP=$(date -d "$EXPIRY_DATE" +%s)
CURRENT_TIMESTAMP=$(date +%s)
DAYS_UNTIL_EXPIRY=$(( (EXPIRY_TIMESTAMP - CURRENT_TIMESTAMP) / 86400 ))

echo "[$DATE] Certificate expires in $DAYS_UNTIL_EXPIRY days" >> "$LOG_FILE"

# Renew if less than 30 days remaining
if [ $DAYS_UNTIL_EXPIRY -lt 30 ]; then
    echo "[$DATE] Certificate renewal required" >> "$LOG_FILE"
    
    # Attempt renewal
    if /usr/bin/certbot renew --quiet --cert-name ${domain}; then
        echo "[$DATE] Certificate renewed successfully" >> "$LOG_FILE"
        
        # Reload Nginx
        if systemctl reload nginx; then
            echo "[$DATE] Nginx reloaded successfully" >> "$LOG_FILE"
        else
            echo "[$DATE] ERROR: Failed to reload Nginx" >> "$LOG_FILE"
            exit 1
        fi
        
        # Log security event
        echo "[$DATE] SECURITY_EVENT: Certificate renewed for ${domain}" >> /var/log/titan/security.log
        
    else
        echo "[$DATE] ERROR: Certificate renewal failed" >> "$LOG_FILE"
        exit 1
    fi
else
    echo "[$DATE] Certificate renewal not required" >> "$LOG_FILE"
fi

echo "[$DATE] Certificate renewal check completed" >> "$LOG_FILE"
`;
  }

  /**
   * Manually renew certificate
   */
  async renewCertificate(domain: string): Promise<CertificateRenewalResult> {
    const startTime = Date.now();
    
    try {
      this.log(`Starting manual certificate renewal for domain: ${domain}`);

      // Force renewal
      const renewCommand = `certbot renew --force-renewal --cert-name ${domain}`;
      const { stdout, stderr } = await execAsync(renewCommand);

      if (stderr && !stderr.includes('Successfully renewed')) {
        throw new Error(`Renewal failed: ${stderr}`);
      }

      // Reload Nginx
      await execAsync('systemctl reload nginx');

      // Get new expiry date
      const newCert = await this.checkExistingCertificate(domain);
      const renewalTime = Date.now() - startTime;

      this.log(`Certificate renewed successfully for domain: ${domain}`);
      
      // Log security event
      await this.logSecurityEvent('CERTIFICATE_RENEWED', { domain, renewalTime });

      return {
        success: true,
        domain,
        newExpiryDate: newCert?.expiryDate,
        renewalTime
      };

    } catch (error) {
      const renewalTime = Date.now() - startTime;
      this.log(`Certificate renewal failed for domain ${domain}: ${error.message}`);
      
      return {
        success: false,
        domain,
        error: error.message,
        renewalTime
      };
    }
  }

  /**
   * Check existing certificate
   */
  private async checkExistingCertificate(domain: string): Promise<SSLCertificate | null> {
    try {
      const certificatePath = path.join(this.certDir, domain, 'fullchain.pem');
      const privateKeyPath = path.join(this.certDir, domain, 'privkey.pem');
      const chainPath = path.join(this.certDir, domain, 'chain.pem');

      // Check if files exist
      await Promise.all([
        fs.access(certificatePath),
        fs.access(privateKeyPath),
        fs.access(chainPath)
      ]);

      // Extract certificate information
      const certInfo = await this.extractCertificateInfo(certificatePath);

      return {
        domain,
        certificatePath,
        privateKeyPath,
        chainPath,
        expiryDate: certInfo.expiryDate,
        issuer: certInfo.issuer,
        fingerprint: certInfo.fingerprint
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Extract certificate information
   */
  private async extractCertificateInfo(certificatePath: string): Promise<{
    expiryDate: Date;
    issuer: string;
    fingerprint: string;
  }> {
    try {
      // Get certificate expiry date
      const { stdout: expiryOutput } = await execAsync(`openssl x509 -enddate -noout -in "${certificatePath}"`);
      const expiryString = expiryOutput.split('=')[1].trim();
      const expiryDate = new Date(expiryString);

      // Get certificate issuer
      const { stdout: issuerOutput } = await execAsync(`openssl x509 -issuer -noout -in "${certificatePath}"`);
      const issuer = issuerOutput.split('=').slice(1).join('=').trim();

      // Get certificate fingerprint
      const { stdout: fingerprintOutput } = await execAsync(`openssl x509 -fingerprint -sha256 -noout -in "${certificatePath}"`);
      const fingerprint = fingerprintOutput.split('=')[1].trim();

      return { expiryDate, issuer, fingerprint };

    } catch (error) {
      throw new Error(`Failed to extract certificate info: ${error.message}`);
    }
  }

  /**
   * Check if certificate is valid (not expired and not expiring soon)
   */
  private isCertificateValid(certificate: SSLCertificate): boolean {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
    
    return certificate.expiryDate > thirtyDaysFromNow;
  }

  /**
   * Get TLS configuration status
   */
  async getTLSStatus(domain: string): Promise<{
    configured: boolean;
    certificate?: SSLCertificate;
    tlsVersion?: string;
    expiryDays?: number;
  }> {
    try {
      const certificate = await this.checkExistingCertificate(domain);
      
      if (!certificate) {
        return { configured: false };
      }

      const now = new Date();
      const expiryDays = Math.floor((certificate.expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      return {
        configured: true,
        certificate,
        tlsVersion: '1.3',
        expiryDays
      };

    } catch (error) {
      return { configured: false };
    }
  }

  /**
   * Log security event
   */
  private async logSecurityEvent(eventType: string, details: any): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type: 'SECURITY_EVENT',
      eventType,
      component: 'TLSManager',
      details
    };

    const securityLogPath = '/var/log/titan/security.log';
    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      await fs.appendFile(securityLogPath, logLine);
    } catch (error) {
      // Fallback to console if log file is not accessible
      console.error('Security Event:', logEntry);
    }
  }

  /**
   * Log message to TLS manager log file
   */
  private async log(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    try {
      await fs.appendFile(this.logFile, logEntry);
    } catch (error) {
      // Fallback to console if log file is not accessible
      console.log(`TLS Manager: ${message}`);
    }
  }
}