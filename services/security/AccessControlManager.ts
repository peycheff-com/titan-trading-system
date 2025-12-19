/**
 * Access Control Manager - Handles IP whitelisting and access control
 * 
 * Requirements:
 * - 4.3: THE Security_Layer SHALL restrict server access to authorized IP addresses only
 * - 4.4: THE Security_Layer SHALL implement fail2ban for brute force protection
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as net from 'net';

const execAsync = promisify(exec);

export interface IPWhitelistConfig {
  allowedIPs: string[];
  allowedCIDRs: string[];
  blockedIPs: string[];
  emergencyAccess: string[];
  lastUpdated: Date;
}

export interface Fail2BanConfig {
  enabled: boolean;
  jailName: string;
  findtime: number; // seconds
  maxretry: number;
  bantime: number; // seconds
  logpath: string[];
  filter: string;
  action: string;
}

export interface AccessAttempt {
  ip: string;
  timestamp: Date;
  success: boolean;
  service: string;
  userAgent?: string;
  country?: string;
}

export interface FirewallRule {
  rule: string;
  port?: number;
  protocol: 'tcp' | 'udp' | 'any';
  source?: string;
  action: 'allow' | 'deny';
  comment?: string;
}

export class AccessControlManager {
  private readonly configPath: string;
  private readonly logFile: string;
  private readonly fail2banConfigPath: string;
  private whitelistConfig: IPWhitelistConfig;

  constructor(
    configPath: string = '/etc/titan/access-control.json',
    logFile: string = '/var/log/titan/access-control.log',
    fail2banConfigPath: string = '/etc/fail2ban/jail.d/titan.conf'
  ) {
    this.configPath = configPath;
    this.logFile = logFile;
    this.fail2banConfigPath = fail2banConfigPath;
    this.whitelistConfig = {
      allowedIPs: [],
      allowedCIDRs: [],
      blockedIPs: [],
      emergencyAccess: [],
      lastUpdated: new Date()
    };
  }

  /**
   * Configure IP whitelist with authorized addresses
   */
  async configureIPWhitelist(allowedIPs: string[]): Promise<void> {
    try {
      this.log(`Configuring IP whitelist with ${allowedIPs.length} addresses`);

      // Validate IP addresses
      const validIPs = await this.validateIPAddresses(allowedIPs);
      
      // Update configuration
      this.whitelistConfig.allowedIPs = validIPs.ips;
      this.whitelistConfig.allowedCIDRs = validIPs.cidrs;
      this.whitelistConfig.lastUpdated = new Date();

      // Save configuration
      await this.saveWhitelistConfig();

      // Apply firewall rules
      await this.applyFirewallRules();

      // Update Nginx configuration
      await this.updateNginxAccessControl();

      this.log(`IP whitelist configured successfully with ${validIPs.ips.length} IPs and ${validIPs.cidrs.length} CIDRs`);
      
      // Log security event
      await this.logSecurityEvent('IP_WHITELIST_UPDATED', {
        allowedIPs: validIPs.ips.length,
        allowedCIDRs: validIPs.cidrs.length
      });

    } catch (error) {
      this.log(`Failed to configure IP whitelist: ${error.message}`);
      throw new Error(`IP whitelist configuration failed: ${error.message}`);
    }
  }

  /**
   * Set up Fail2Ban for brute force protection
   */
  async setupFail2Ban(): Promise<void> {
    try {
      this.log('Setting up Fail2Ban for brute force protection');

      // Install Fail2Ban if not present
      await this.installFail2Ban();

      // Create Titan-specific jail configuration
      const fail2banConfig = this.generateFail2BanConfig();
      await fs.writeFile(this.fail2banConfigPath, fail2banConfig, 'utf8');

      // Create custom filter for Titan logs
      await this.createTitanFilter();

      // Restart Fail2Ban service
      await execAsync('systemctl restart fail2ban');
      await execAsync('systemctl enable fail2ban');

      // Verify Fail2Ban is running
      const { stdout } = await execAsync('fail2ban-client status');
      if (!stdout.includes('titan-ssh') || !stdout.includes('titan-nginx')) {
        throw new Error('Fail2Ban jails not properly configured');
      }

      this.log('Fail2Ban setup completed successfully');
      
      // Log security event
      await this.logSecurityEvent('FAIL2BAN_CONFIGURED', {
        jails: ['titan-ssh', 'titan-nginx'],
        maxretry: 3,
        bantime: 3600
      });

    } catch (error) {
      this.log(`Failed to setup Fail2Ban: ${error.message}`);
      throw new Error(`Fail2Ban setup failed: ${error.message}`);
    }
  }

  /**
   * Add IP address to whitelist
   */
  async addToWhitelist(ip: string, comment?: string): Promise<void> {
    try {
      // Validate IP address
      if (!this.isValidIP(ip) && !this.isValidCIDR(ip)) {
        throw new Error(`Invalid IP address or CIDR: ${ip}`);
      }

      // Load current configuration
      await this.loadWhitelistConfig();

      // Add to appropriate list
      if (this.isValidCIDR(ip)) {
        if (!this.whitelistConfig.allowedCIDRs.includes(ip)) {
          this.whitelistConfig.allowedCIDRs.push(ip);
        }
      } else {
        if (!this.whitelistConfig.allowedIPs.includes(ip)) {
          this.whitelistConfig.allowedIPs.push(ip);
        }
      }

      this.whitelistConfig.lastUpdated = new Date();

      // Save and apply changes
      await this.saveWhitelistConfig();
      await this.applyFirewallRules();
      await this.updateNginxAccessControl();

      this.log(`Added ${ip} to whitelist${comment ? ` (${comment})` : ''}`);
      
      // Log security event
      await this.logSecurityEvent('IP_ADDED_TO_WHITELIST', { ip, comment });

    } catch (error) {
      this.log(`Failed to add ${ip} to whitelist: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove IP address from whitelist
   */
  async removeFromWhitelist(ip: string): Promise<void> {
    try {
      // Load current configuration
      await this.loadWhitelistConfig();

      // Remove from lists
      this.whitelistConfig.allowedIPs = this.whitelistConfig.allowedIPs.filter(addr => addr !== ip);
      this.whitelistConfig.allowedCIDRs = this.whitelistConfig.allowedCIDRs.filter(addr => addr !== ip);
      this.whitelistConfig.lastUpdated = new Date();

      // Save and apply changes
      await this.saveWhitelistConfig();
      await this.applyFirewallRules();
      await this.updateNginxAccessControl();

      this.log(`Removed ${ip} from whitelist`);
      
      // Log security event
      await this.logSecurityEvent('IP_REMOVED_FROM_WHITELIST', { ip });

    } catch (error) {
      this.log(`Failed to remove ${ip} from whitelist: ${error.message}`);
      throw error;
    }
  }

  /**
   * Block IP address (add to blocklist)
   */
  async blockIP(ip: string, reason?: string): Promise<void> {
    try {
      // Validate IP address
      if (!this.isValidIP(ip)) {
        throw new Error(`Invalid IP address: ${ip}`);
      }

      // Load current configuration
      await this.loadWhitelistConfig();

      // Add to blocked list
      if (!this.whitelistConfig.blockedIPs.includes(ip)) {
        this.whitelistConfig.blockedIPs.push(ip);
      }

      // Remove from allowed lists if present
      this.whitelistConfig.allowedIPs = this.whitelistConfig.allowedIPs.filter(addr => addr !== ip);
      this.whitelistConfig.lastUpdated = new Date();

      // Save and apply changes
      await this.saveWhitelistConfig();
      await this.applyFirewallRules();

      // Add immediate UFW block rule
      await execAsync(`ufw insert 1 deny from ${ip}`);

      this.log(`Blocked IP ${ip}${reason ? ` (${reason})` : ''}`);
      
      // Log security event
      await this.logSecurityEvent('IP_BLOCKED', { ip, reason });

    } catch (error) {
      this.log(`Failed to block IP ${ip}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get current access control status
   */
  async getAccessControlStatus(): Promise<{
    whitelistCount: number;
    blockedCount: number;
    fail2banStatus: string;
    firewallStatus: string;
    lastUpdated: Date;
  }> {
    try {
      await this.loadWhitelistConfig();

      // Check Fail2Ban status
      let fail2banStatus = 'unknown';
      try {
        const { stdout } = await execAsync('fail2ban-client status');
        fail2banStatus = stdout.includes('titan-') ? 'active' : 'inactive';
      } catch (error) {
        fail2banStatus = 'not_installed';
      }

      // Check firewall status
      let firewallStatus = 'unknown';
      try {
        const { stdout } = await execAsync('ufw status');
        firewallStatus = stdout.includes('Status: active') ? 'active' : 'inactive';
      } catch (error) {
        firewallStatus = 'not_installed';
      }

      return {
        whitelistCount: this.whitelistConfig.allowedIPs.length + this.whitelistConfig.allowedCIDRs.length,
        blockedCount: this.whitelistConfig.blockedIPs.length,
        fail2banStatus,
        firewallStatus,
        lastUpdated: this.whitelistConfig.lastUpdated
      };

    } catch (error) {
      throw new Error(`Failed to get access control status: ${error.message}`);
    }
  }

  /**
   * Validate IP addresses and separate IPs from CIDRs
   */
  private async validateIPAddresses(addresses: string[]): Promise<{
    ips: string[];
    cidrs: string[];
  }> {
    const ips: string[] = [];
    const cidrs: string[] = [];

    for (const addr of addresses) {
      if (this.isValidIP(addr)) {
        ips.push(addr);
      } else if (this.isValidCIDR(addr)) {
        cidrs.push(addr);
      } else {
        throw new Error(`Invalid IP address or CIDR: ${addr}`);
      }
    }

    return { ips, cidrs };
  }

  /**
   * Check if string is valid IP address
   */
  private isValidIP(ip: string): boolean {
    return net.isIP(ip) !== 0;
  }

  /**
   * Check if string is valid CIDR notation
   */
  private isValidCIDR(cidr: string): boolean {
    const parts = cidr.split('/');
    if (parts.length !== 2) return false;
    
    const ip = parts[0];
    const prefix = parseInt(parts[1], 10);
    
    return net.isIP(ip) !== 0 && prefix >= 0 && prefix <= 32;
  }

  /**
   * Apply firewall rules using UFW
   */
  private async applyFirewallRules(): Promise<void> {
    try {
      this.log('Applying firewall rules...');

      // Enable UFW if not already enabled
      await execAsync('ufw --force enable');

      // Reset UFW rules to start fresh
      await execAsync('ufw --force reset');

      // Default policies
      await execAsync('ufw default deny incoming');
      await execAsync('ufw default allow outgoing');

      // Allow SSH from whitelisted IPs only
      for (const ip of this.whitelistConfig.allowedIPs) {
        await execAsync(`ufw allow from ${ip} to any port 22`);
      }

      for (const cidr of this.whitelistConfig.allowedCIDRs) {
        await execAsync(`ufw allow from ${cidr} to any port 22`);
      }

      // Allow HTTP/HTTPS from whitelisted IPs only
      for (const ip of this.whitelistConfig.allowedIPs) {
        await execAsync(`ufw allow from ${ip} to any port 80`);
        await execAsync(`ufw allow from ${ip} to any port 443`);
      }

      for (const cidr of this.whitelistConfig.allowedCIDRs) {
        await execAsync(`ufw allow from ${cidr} to any port 80`);
        await execAsync(`ufw allow from ${cidr} to any port 443`);
      }

      // Block explicitly blocked IPs
      for (const ip of this.whitelistConfig.blockedIPs) {
        await execAsync(`ufw insert 1 deny from ${ip}`);
      }

      // Allow loopback
      await execAsync('ufw allow in on lo');
      await execAsync('ufw allow out on lo');

      // Allow Redis (internal only)
      await execAsync('ufw allow from 127.0.0.1 to any port 6379');

      this.log('Firewall rules applied successfully');

    } catch (error) {
      throw new Error(`Failed to apply firewall rules: ${error.message}`);
    }
  }

  /**
   * Update Nginx access control configuration
   */
  private async updateNginxAccessControl(): Promise<void> {
    try {
      const nginxAccessConfig = this.generateNginxAccessConfig();
      const configPath = '/etc/nginx/conf.d/titan-access-control.conf';

      await fs.writeFile(configPath, nginxAccessConfig, 'utf8');

      // Test and reload Nginx
      const { stderr } = await execAsync('nginx -t');
      if (stderr && !stderr.includes('syntax is ok')) {
        throw new Error(`Nginx configuration test failed: ${stderr}`);
      }

      await execAsync('systemctl reload nginx');
      this.log('Nginx access control configuration updated');

    } catch (error) {
      throw new Error(`Failed to update Nginx access control: ${error.message}`);
    }
  }

  /**
   * Generate Nginx access control configuration
   */
  private generateNginxAccessConfig(): string {
    let config = `# Titan Access Control Configuration
# Generated automatically - do not edit manually

# Geo module for IP-based access control
geo $allowed_ip {
    default 0;
`;

    // Add allowed IPs
    for (const ip of this.whitelistConfig.allowedIPs) {
      config += `    ${ip} 1;\n`;
    }

    // Add allowed CIDRs
    for (const cidr of this.whitelistConfig.allowedCIDRs) {
      config += `    ${cidr} 1;\n`;
    }

    config += `}

# Map for blocked IPs
geo $blocked_ip {
    default 0;
`;

    // Add blocked IPs
    for (const ip of this.whitelistConfig.blockedIPs) {
      config += `    ${ip} 1;\n`;
    }

    config += `}

# Access control logic
map $allowed_ip$blocked_ip $access_granted {
    "10" 0;  # blocked IP takes precedence
    "11" 0;  # blocked IP takes precedence
    "01" 0;  # not allowed and blocked
    "00" 0;  # not allowed
    "1~" 1;  # allowed (any combination starting with 1, except blocked)
}
`;

    return config;
  }

  /**
   * Install Fail2Ban if not present
   */
  private async installFail2Ban(): Promise<void> {
    try {
      // Check if Fail2Ban is installed
      await execAsync('which fail2ban-client');
    } catch (error) {
      this.log('Installing Fail2Ban...');
      await execAsync('apt-get update -qq');
      await execAsync('apt-get install -y fail2ban');
    }
  }

  /**
   * Generate Fail2Ban configuration
   */
  private generateFail2BanConfig(): string {
    return `# Titan Fail2Ban Configuration
# Generated automatically

[DEFAULT]
# Ban hosts for 1 hour
bantime = 3600

# A host is banned if it has generated "maxretry" during the last "findtime" seconds
findtime = 600
maxretry = 3

# Destination email for notifications
destemail = admin@titan-trading.com
sender = fail2ban@titan-trading.com

# Action to take when banning an IP
action = %(action_mwl)s

[titan-ssh]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600

[titan-nginx]
enabled = true
port = http,https
filter = titan-nginx
logpath = /var/log/nginx/access.log
          /var/log/nginx/error.log
maxretry = 5
bantime = 1800
findtime = 300

[titan-api]
enabled = true
port = http,https
filter = titan-api
logpath = /var/log/titan/access.log
maxretry = 10
bantime = 3600
findtime = 600
`;
  }

  /**
   * Create custom Fail2Ban filter for Titan
   */
  private async createTitanFilter(): Promise<void> {
    // Nginx filter
    const nginxFilter = `# Titan Nginx Fail2Ban Filter

[Definition]
failregex = ^<HOST> -.*"(GET|POST|HEAD).*" (4[0-9]{2}|5[0-9]{2}) .*$
            ^<HOST> -.*".*" 400 .*$
            ^<HOST> -.* "(GET|POST|HEAD) .*HTTP.*" 404 .*$

ignoreregex = ^<HOST> -.*"(GET|POST|HEAD) /health.*" 200 .*$
              ^<HOST> -.*"(GET|POST|HEAD) /favicon.ico.*" 404 .*$
`;

    await fs.writeFile('/etc/fail2ban/filter.d/titan-nginx.conf', nginxFilter, 'utf8');

    // API filter
    const apiFilter = `# Titan API Fail2Ban Filter

[Definition]
failregex = ^.*\[<HOST>\].*"(GET|POST|PUT|DELETE) /api/.*" (401|403|429) .*$
            ^.*\[<HOST>\].*SECURITY_EVENT.*UNAUTHORIZED_ACCESS.*$
            ^.*\[<HOST>\].*SECURITY_EVENT.*BRUTE_FORCE_ATTEMPT.*$

ignoreregex = ^.*\[<HOST>\].*"(GET|POST|PUT|DELETE) /api/health.*" 200 .*$
`;

    await fs.writeFile('/etc/fail2ban/filter.d/titan-api.conf', apiFilter, 'utf8');
  }

  /**
   * Load whitelist configuration from file
   */
  private async loadWhitelistConfig(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      this.whitelistConfig = JSON.parse(configData);
    } catch (error) {
      // Use default configuration if file doesn't exist
      this.whitelistConfig = {
        allowedIPs: [],
        allowedCIDRs: [],
        blockedIPs: [],
        emergencyAccess: [],
        lastUpdated: new Date()
      };
    }
  }

  /**
   * Save whitelist configuration to file
   */
  private async saveWhitelistConfig(): Promise<void> {
    try {
      // Ensure directory exists
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      // Save configuration
      const configData = JSON.stringify(this.whitelistConfig, null, 2);
      await fs.writeFile(this.configPath, configData, 'utf8');

    } catch (error) {
      throw new Error(`Failed to save whitelist configuration: ${error.message}`);
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
      component: 'AccessControlManager',
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
   * Log message to access control log file
   */
  private async log(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    try {
      await fs.appendFile(this.logFile, logEntry);
    } catch (error) {
      // Fallback to console if log file is not accessible
      console.log(`Access Control: ${message}`);
    }
  }
}