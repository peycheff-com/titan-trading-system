/**
 * Production Alerting Service for Titan Trading System
 * 
 * Provides multi-channel alerting (email, Slack, webhook) with
 * threshold-based triggering and alert management.
 * 
 * Requirements: 5.3, 5.4 - Multi-channel alerts and threshold triggering
 */

import { EventEmitter } from 'eventemitter3';
import * as nodemailer from 'nodemailer';
import fetch from 'node-fetch';
import { getTelemetryService } from '../shared/src/TelemetryService';
import type { SystemMetrics, TradingMetrics, MonitoringData } from './MonitoringService';

// Simple color logging utility
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
};

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';

/**
 * Alert categories
 */
export type AlertCategory = 'system' | 'trading' | 'security' | 'performance' | 'deployment';

/**
 * Alert channels
 */
export type AlertChannel = 'email' | 'slack' | 'webhook' | 'console';

/**
 * Alert definition
 */
export interface Alert {
  id: string;
  timestamp: number;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  message: string;
  data?: any;
  acknowledged: boolean;
  resolvedAt?: number;
  channels: AlertChannel[];
}

/**
 * Alert threshold configuration
 */
export interface AlertThreshold {
  name: string;
  category: AlertCategory;
  severity: AlertSeverity;
  condition: string; // e.g., 'cpu.usage > 80'
  threshold: number;
  duration?: number; // Minimum duration in seconds before triggering
  cooldown?: number; // Cooldown period in seconds
  channels: AlertChannel[];
  enabled: boolean;
}

/**
 * Email configuration
 */
export interface EmailConfig {
  enabled: boolean;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  from: string;
  to: string[];
  subject: string;
}

/**
 * Slack configuration
 */
export interface SlackConfig {
  enabled: boolean;
  webhookUrl: string;
  channel: string;
  username: string;
  iconEmoji: string;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  enabled: boolean;
  url: string;
  method: 'POST' | 'PUT';
  headers: Record<string, string>;
  timeout: number;
  retries: number;
}

/**
 * Alerting service configuration
 */
export interface AlertingConfig {
  enabled: boolean;
  channels: {
    email: EmailConfig;
    slack: SlackConfig;
    webhook: WebhookConfig;
    console: {
      enabled: boolean;
      colors: boolean;
    };
  };
  thresholds: AlertThreshold[];
  alertRetentionDays: number;
  maxAlertsPerHour: number;
}

/**
 * Default alerting configuration
 */
const DEFAULT_CONFIG: AlertingConfig = {
  enabled: true,
  channels: {
    email: {
      enabled: false,
      smtp: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: '',
          pass: ''
        }
      },
      from: 'titan-alerts@trading.com',
      to: [],
      subject: 'Titan Trading System Alert'
    },
    slack: {
      enabled: false,
      webhookUrl: '',
      channel: '#alerts',
      username: 'Titan Bot',
      iconEmoji: ':robot_face:'
    },
    webhook: {
      enabled: false,
      url: '',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000,
      retries: 3
    },
    console: {
      enabled: true,
      colors: true
    }
  },
  thresholds: [
    // System thresholds
    {
      name: 'High CPU Usage',
      category: 'system',
      severity: 'warning',
      condition: 'cpu.usage > 80',
      threshold: 80,
      duration: 60,
      cooldown: 300,
      channels: ['console', 'slack'],
      enabled: true
    },
    {
      name: 'Critical CPU Usage',
      category: 'system',
      severity: 'critical',
      condition: 'cpu.usage > 95',
      threshold: 95,
      duration: 30,
      cooldown: 180,
      channels: ['console', 'email', 'slack', 'webhook'],
      enabled: true
    },
    {
      name: 'High Memory Usage',
      category: 'system',
      severity: 'warning',
      condition: 'memory.usage > 85',
      threshold: 85,
      duration: 60,
      cooldown: 300,
      channels: ['console', 'slack'],
      enabled: true
    },
    {
      name: 'Critical Memory Usage',
      category: 'system',
      severity: 'critical',
      condition: 'memory.usage > 95',
      threshold: 95,
      duration: 30,
      cooldown: 180,
      channels: ['console', 'email', 'slack', 'webhook'],
      enabled: true
    },
    {
      name: 'High Disk Usage',
      category: 'system',
      severity: 'warning',
      condition: 'disk.usage > 90',
      threshold: 90,
      duration: 300,
      cooldown: 600,
      channels: ['console', 'slack'],
      enabled: true
    },
    // Trading thresholds
    {
      name: 'High Drawdown',
      category: 'trading',
      severity: 'warning',
      condition: 'drawdown.current > 10',
      threshold: 10,
      duration: 0,
      cooldown: 300,
      channels: ['console', 'email', 'slack'],
      enabled: true
    },
    {
      name: 'Critical Drawdown',
      category: 'trading',
      severity: 'emergency',
      condition: 'drawdown.current > 15',
      threshold: 15,
      duration: 0,
      cooldown: 60,
      channels: ['console', 'email', 'slack', 'webhook'],
      enabled: true
    },
    {
      name: 'Large Daily Loss',
      category: 'trading',
      severity: 'critical',
      condition: 'performance.dailyPnL < -1000',
      threshold: -1000,
      duration: 0,
      cooldown: 600,
      channels: ['console', 'email', 'slack'],
      enabled: true
    }
  ],
  alertRetentionDays: 30,
  maxAlertsPerHour: 50
};

/**
 * Production Alerting Service
 */
export class AlertingService extends EventEmitter {
  private config: AlertingConfig;
  private alerts: Alert[] = [];
  private activeThresholds = new Map<string, { count: number; firstTriggered: number }>();
  private emailTransporter: nodemailer.Transporter | null = null;
  private telemetry = getTelemetryService();
  private alertCounts = new Map<string, number>(); // For rate limiting
  
  constructor(config: Partial<AlertingConfig> = {}) {
    super();
    
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    
    // Initialize email transporter if enabled
    if (this.config.channels.email.enabled) {
      this.initializeEmailTransporter();
    }
    
    console.log(colors.blue('🚨 Production Alerting Service initialized'));
    console.log(colors.gray(`   Thresholds: ${this.config.thresholds.filter(t => t.enabled).length} active`));
    console.log(colors.gray(`   Channels: ${this.getEnabledChannels().join(', ')}`));
  }
  
  /**
   * Deep merge configuration objects
   */
  private mergeConfig(defaultConfig: AlertingConfig, userConfig: Partial<AlertingConfig>): AlertingConfig {
    const merged = { ...defaultConfig };
    
    if (userConfig.channels) {
      merged.channels = {
        ...defaultConfig.channels,
        ...userConfig.channels,
        email: { ...defaultConfig.channels.email, ...userConfig.channels?.email },
        slack: { ...defaultConfig.channels.slack, ...userConfig.channels?.slack },
        webhook: { ...defaultConfig.channels.webhook, ...userConfig.channels?.webhook },
        console: { ...defaultConfig.channels.console, ...userConfig.channels?.console }
      };
    }
    
    if (userConfig.thresholds) {
      merged.thresholds = userConfig.thresholds;
    }
    
    return { ...merged, ...userConfig };
  }
  
  /**
   * Initialize email transporter
   */
  private initializeEmailTransporter(): void {
    try {
      this.emailTransporter = nodemailer.createTransporter(this.config.channels.email.smtp);
      console.log(colors.green('📧 Email transporter initialized'));
    } catch (error) {
      console.error(colors.red('❌ Failed to initialize email transporter:'), error);
      this.config.channels.email.enabled = false;
    }
  }
  
  /**
   * Get list of enabled channels
   */
  private getEnabledChannels(): string[] {
    const channels: string[] = [];
    
    if (this.config.channels.email.enabled) channels.push('email');
    if (this.config.channels.slack.enabled) channels.push('slack');
    if (this.config.channels.webhook.enabled) channels.push('webhook');
    if (this.config.channels.console.enabled) channels.push('console');
    
    return channels;
  }
  
  /**
   * Process monitoring data and check thresholds
   */
  async processMonitoringData(data: MonitoringData): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    
    try {
      // Check each threshold
      for (const threshold of this.config.thresholds) {
        if (!threshold.enabled) {
          continue;
        }
        
        const triggered = this.evaluateThreshold(threshold, data);
        
        if (triggered) {
          await this.handleThresholdTriggered(threshold, data);
        } else {
          // Reset threshold state if not triggered
          this.activeThresholds.delete(threshold.name);
        }
      }
      
      // Clean up old alert counts for rate limiting
      this.cleanupAlertCounts();
      
    } catch (error) {
      console.error(colors.red('❌ Failed to process monitoring data for alerts:'), error);
      this.telemetry.logError('AlertingService', 'Failed to process monitoring data', { error: error.message });
    }
  }
  
  /**
   * Evaluate if a threshold condition is met
   */
  private evaluateThreshold(threshold: AlertThreshold, data: MonitoringData): boolean {
    try {
      // Simple condition evaluation
      // In production, you might want to use a more sophisticated expression evaluator
      
      const condition = threshold.condition.toLowerCase();
      
      // System conditions
      if (condition.includes('cpu.usage')) {
        return data.system.cpu.usage > threshold.threshold;
      }
      
      if (condition.includes('memory.usage')) {
        return data.system.memory.usage > threshold.threshold;
      }
      
      if (condition.includes('disk.usage')) {
        return data.system.disk.usage > threshold.threshold;
      }
      
      // Trading conditions
      if (condition.includes('drawdown.current')) {
        return data.trading.drawdown.current > threshold.threshold;
      }
      
      if (condition.includes('performance.dailypnl')) {
        return data.trading.performance.dailyPnL < threshold.threshold;
      }
      
      return false;
      
    } catch (error) {
      console.error(colors.red(`❌ Failed to evaluate threshold ${threshold.name}:`), error);
      return false;
    }
  }
  
  /**
   * Handle threshold being triggered
   */
  private async handleThresholdTriggered(threshold: AlertThreshold, data: MonitoringData): Promise<void> {
    const now = Date.now();
    const thresholdState = this.activeThresholds.get(threshold.name);
    
    // Check if this is a new trigger or continuation
    if (!thresholdState) {
      // New trigger
      this.activeThresholds.set(threshold.name, {
        count: 1,
        firstTriggered: now
      });
      
      // Check duration requirement
      if (threshold.duration && threshold.duration > 0) {
        // Don't trigger immediately, wait for duration
        return;
      }
    } else {
      // Continuing trigger
      thresholdState.count++;
      
      // Check duration requirement
      if (threshold.duration && threshold.duration > 0) {
        const elapsed = (now - thresholdState.firstTriggered) / 1000;
        if (elapsed < threshold.duration) {
          // Duration not met yet
          return;
        }
      }
      
      // Check cooldown
      const lastAlert = this.alerts
        .filter(alert => alert.title.includes(threshold.name))
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      
      if (lastAlert && threshold.cooldown) {
        const timeSinceLastAlert = (now - lastAlert.timestamp) / 1000;
        if (timeSinceLastAlert < threshold.cooldown) {
          // Still in cooldown period
          return;
        }
      }
    }
    
    // Check rate limiting
    if (!this.checkRateLimit(threshold.name)) {
      console.log(colors.yellow(`⚠️ Rate limit exceeded for threshold: ${threshold.name}`));
      return;
    }
    
    // Create and send alert
    await this.createAlert(threshold, data);
  }
  
  /**
   * Check rate limiting for alerts
   */
  private checkRateLimit(thresholdName: string): boolean {
    const hour = Math.floor(Date.now() / (60 * 60 * 1000));
    const key = `${thresholdName}_${hour}`;
    
    const count = this.alertCounts.get(key) || 0;
    if (count >= this.config.maxAlertsPerHour) {
      return false;
    }
    
    this.alertCounts.set(key, count + 1);
    return true;
  }
  
  /**
   * Clean up old alert counts
   */
  private cleanupAlertCounts(): void {
    const currentHour = Math.floor(Date.now() / (60 * 60 * 1000));
    
    for (const [key] of this.alertCounts) {
      const keyHour = parseInt(key.split('_').pop() || '0');
      if (currentHour - keyHour > 1) {
        this.alertCounts.delete(key);
      }
    }
  }
  
  /**
   * Create and send alert
   */
  private async createAlert(threshold: AlertThreshold, data: MonitoringData): Promise<void> {
    const alert: Alert = {
      id: `${threshold.name}_${Date.now()}`,
      timestamp: Date.now(),
      severity: threshold.severity,
      category: threshold.category,
      title: threshold.name,
      message: this.generateAlertMessage(threshold, data),
      data: this.extractRelevantData(threshold, data),
      acknowledged: false,
      channels: threshold.channels
    };
    
    // Store alert
    this.alerts.push(alert);
    
    // Send to configured channels
    await this.sendAlert(alert);
    
    // Emit alert event
    this.emit('alert', alert);
    
    // Log alert creation
    this.telemetry.logInfo('AlertingService', `Alert created: ${alert.title}`, {
      alertId: alert.id,
      severity: alert.severity,
      category: alert.category
    });
  }
  
  /**
   * Generate alert message
   */
  private generateAlertMessage(threshold: AlertThreshold, data: MonitoringData): string {
    const condition = threshold.condition.toLowerCase();
    
    if (condition.includes('cpu.usage')) {
      return `CPU usage is ${data.system.cpu.usage.toFixed(1)}% (threshold: ${threshold.threshold}%)`;
    }
    
    if (condition.includes('memory.usage')) {
      return `Memory usage is ${data.system.memory.usage.toFixed(1)}% (threshold: ${threshold.threshold}%)`;
    }
    
    if (condition.includes('disk.usage')) {
      return `Disk usage is ${data.system.disk.usage.toFixed(1)}% (threshold: ${threshold.threshold}%)`;
    }
    
    if (condition.includes('drawdown.current')) {
      return `Current drawdown is ${data.trading.drawdown.current.toFixed(1)}% (threshold: ${threshold.threshold}%)`;
    }
    
    if (condition.includes('performance.dailypnl')) {
      return `Daily P&L is $${data.trading.performance.dailyPnL.toFixed(2)} (threshold: $${threshold.threshold})`;
    }
    
    return `Threshold ${threshold.name} has been triggered`;
  }
  
  /**
   * Extract relevant data for alert
   */
  private extractRelevantData(threshold: AlertThreshold, data: MonitoringData): any {
    const condition = threshold.condition.toLowerCase();
    
    if (condition.includes('cpu')) {
      return {
        cpu: data.system.cpu,
        loadAverage: data.system.cpu.loadAverage
      };
    }
    
    if (condition.includes('memory')) {
      return {
        memory: data.system.memory
      };
    }
    
    if (condition.includes('disk')) {
      return {
        disk: data.system.disk
      };
    }
    
    if (condition.includes('drawdown') || condition.includes('performance')) {
      return {
        trading: {
          equity: data.trading.equity,
          drawdown: data.trading.drawdown,
          performance: data.trading.performance
        }
      };
    }
    
    return {};
  }
  
  /**
   * Send alert to configured channels
   */
  private async sendAlert(alert: Alert): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const channel of alert.channels) {
      switch (channel) {
        case 'console':
          if (this.config.channels.console.enabled) {
            promises.push(this.sendConsoleAlert(alert));
          }
          break;
          
        case 'email':
          if (this.config.channels.email.enabled) {
            promises.push(this.sendEmailAlert(alert));
          }
          break;
          
        case 'slack':
          if (this.config.channels.slack.enabled) {
            promises.push(this.sendSlackAlert(alert));
          }
          break;
          
        case 'webhook':
          if (this.config.channels.webhook.enabled) {
            promises.push(this.sendWebhookAlert(alert));
          }
          break;
      }
    }
    
    // Wait for all channels to complete
    await Promise.allSettled(promises);
  }
  
  /**
   * Send console alert
   */
  private async sendConsoleAlert(alert: Alert): Promise<void> {
    const severityColors = {
      info: colors.blue,
      warning: colors.yellow,
      critical: colors.red,
      emergency: colors.magenta
    };
    
    const color = severityColors[alert.severity];
    const icon = this.getSeverityIcon(alert.severity);
    
    console.log(color(`${icon} ${alert.severity.toUpperCase()} ALERT: ${alert.title}`));
    console.log(color(`   ${alert.message}`));
    console.log(colors.gray(`   Time: ${new Date(alert.timestamp).toISOString()}`));
    console.log(colors.gray(`   ID: ${alert.id}`));
  }
  
  /**
   * Send email alert
   */
  private async sendEmailAlert(alert: Alert): Promise<void> {
    if (!this.emailTransporter || this.config.channels.email.to.length === 0) {
      return;
    }
    
    try {
      const subject = `${this.config.channels.email.subject} - ${alert.severity.toUpperCase()}: ${alert.title}`;
      
      const html = this.generateEmailHTML(alert);
      
      await this.emailTransporter.sendMail({
        from: this.config.channels.email.from,
        to: this.config.channels.email.to.join(', '),
        subject,
        html
      });
      
      console.log(colors.green(`📧 Email alert sent: ${alert.title}`));
      
    } catch (error) {
      console.error(colors.red('❌ Failed to send email alert:'), error);
      this.telemetry.logError('AlertingService', 'Failed to send email alert', { 
        alertId: alert.id, 
        error: error.message 
      });
    }
  }
  
  /**
   * Send Slack alert
   */
  private async sendSlackAlert(alert: Alert): Promise<void> {
    if (!this.config.channels.slack.webhookUrl) {
      return;
    }
    
    try {
      const color = this.getSlackColor(alert.severity);
      const icon = this.getSeverityIcon(alert.severity);
      
      const payload = {
        channel: this.config.channels.slack.channel,
        username: this.config.channels.slack.username,
        icon_emoji: this.config.channels.slack.iconEmoji,
        attachments: [
          {
            color,
            title: `${icon} ${alert.severity.toUpperCase()}: ${alert.title}`,
            text: alert.message,
            fields: [
              {
                title: 'Category',
                value: alert.category,
                short: true
              },
              {
                title: 'Time',
                value: new Date(alert.timestamp).toISOString(),
                short: true
              },
              {
                title: 'Alert ID',
                value: alert.id,
                short: false
              }
            ],
            footer: 'Titan Trading System',
            ts: Math.floor(alert.timestamp / 1000)
          }
        ]
      };
      
      const response = await fetch(this.config.channels.slack.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
      }
      
      console.log(colors.green(`💬 Slack alert sent: ${alert.title}`));
      
    } catch (error) {
      console.error(colors.red('❌ Failed to send Slack alert:'), error);
      this.telemetry.logError('AlertingService', 'Failed to send Slack alert', { 
        alertId: alert.id, 
        error: error.message 
      });
    }
  }
  
  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: Alert): Promise<void> {
    if (!this.config.channels.webhook.url) {
      return;
    }
    
    let attempt = 0;
    const maxRetries = this.config.channels.webhook.retries;
    
    while (attempt <= maxRetries) {
      try {
        const payload = {
          alert,
          timestamp: Date.now(),
          source: 'titan-trading-system'
        };
        
        const response = await fetch(this.config.channels.webhook.url, {
          method: this.config.channels.webhook.method,
          headers: this.config.channels.webhook.headers,
          body: JSON.stringify(payload),
          timeout: this.config.channels.webhook.timeout
        });
        
        if (!response.ok) {
          throw new Error(`Webhook error: ${response.status} ${response.statusText}`);
        }
        
        console.log(colors.green(`🔗 Webhook alert sent: ${alert.title}`));
        return;
        
      } catch (error) {
        attempt++;
        
        if (attempt > maxRetries) {
          console.error(colors.red('❌ Failed to send webhook alert after retries:'), error);
          this.telemetry.logError('AlertingService', 'Failed to send webhook alert', { 
            alertId: alert.id, 
            attempt, 
            error: error.message 
          });
          return;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  /**
   * Generate HTML for email alerts
   */
  private generateEmailHTML(alert: Alert): string {
    const severityColor = {
      info: '#2196F3',
      warning: '#FF9800',
      critical: '#F44336',
      emergency: '#9C27B0'
    }[alert.severity];
    
    return `
      <html>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="background-color: ${severityColor}; color: white; padding: 20px;">
              <h1 style="margin: 0; font-size: 24px;">${this.getSeverityIcon(alert.severity)} ${alert.severity.toUpperCase()}</h1>
              <h2 style="margin: 10px 0 0 0; font-size: 18px; font-weight: normal;">${alert.title}</h2>
            </div>
            <div style="padding: 20px;">
              <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px 0;">${alert.message}</p>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Category:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${alert.category}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Time:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${new Date(alert.timestamp).toISOString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Alert ID:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${alert.id}</td>
                </tr>
              </table>
              
              ${alert.data ? `
                <h3 style="margin: 20px 0 10px 0;">Additional Data:</h3>
                <pre style="background-color: #f8f8f8; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px;">${JSON.stringify(alert.data, null, 2)}</pre>
              ` : ''}
            </div>
            <div style="background-color: #f8f8f8; padding: 15px; text-align: center; color: #666; font-size: 12px;">
              Titan Trading System - Production Monitoring
            </div>
          </div>
        </body>
      </html>
    `;
  }
  
  /**
   * Get severity icon
   */
  private getSeverityIcon(severity: AlertSeverity): string {
    const icons = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🚨',
      emergency: '🆘'
    };
    
    return icons[severity];
  }
  
  /**
   * Get Slack color for severity
   */
  private getSlackColor(severity: AlertSeverity): string {
    const colors = {
      info: 'good',
      warning: 'warning',
      critical: 'danger',
      emergency: '#9C27B0'
    };
    
    return colors[severity];
  }
  
  /**
   * Manually create alert
   */
  async createManualAlert(
    title: string,
    message: string,
    severity: AlertSeverity = 'info',
    category: AlertCategory = 'system',
    channels: AlertChannel[] = ['console'],
    data?: any
  ): Promise<Alert> {
    const alert: Alert = {
      id: `manual_${Date.now()}`,
      timestamp: Date.now(),
      severity,
      category,
      title,
      message,
      data,
      acknowledged: false,
      channels
    };
    
    this.alerts.push(alert);
    await this.sendAlert(alert);
    this.emit('alert', alert);
    
    return alert;
  }
  
  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alertAcknowledged', alert);
      console.log(colors.green(`✅ Alert acknowledged: ${alert.title}`));
      return true;
    }
    return false;
  }
  
  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolvedAt = Date.now();
      this.emit('alertResolved', alert);
      console.log(colors.green(`✅ Alert resolved: ${alert.title}`));
      return true;
    }
    return false;
  }
  
  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.resolvedAt);
  }
  
  /**
   * Get all alerts
   */
  getAllAlerts(): Alert[] {
    return [...this.alerts];
  }
  
  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: AlertSeverity): Alert[] {
    return this.alerts.filter(alert => alert.severity === severity);
  }
  
  /**
   * Get alerts by category
   */
  getAlertsByCategory(category: AlertCategory): Alert[] {
    return this.alerts.filter(alert => alert.category === category);
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<AlertingConfig>): void {
    this.config = this.mergeConfig(this.config, config);
    
    // Reinitialize email transporter if email config changed
    if (config.channels?.email && this.config.channels.email.enabled) {
      this.initializeEmailTransporter();
    }
    
    console.log(colors.blue('⚙️ Alerting configuration updated'));
    this.emit('configUpdated', this.config);
  }
  
  /**
   * Test alert channels
   */
  async testAlertChannels(): Promise<{ [channel: string]: boolean }> {
    const results: { [channel: string]: boolean } = {};
    
    const testAlert: Alert = {
      id: `test_${Date.now()}`,
      timestamp: Date.now(),
      severity: 'info',
      category: 'system',
      title: 'Test Alert',
      message: 'This is a test alert to verify channel configuration.',
      acknowledged: false,
      channels: ['console', 'email', 'slack', 'webhook']
    };
    
    // Test each channel
    try {
      await this.sendConsoleAlert(testAlert);
      results.console = true;
    } catch (error) {
      results.console = false;
    }
    
    try {
      await this.sendEmailAlert(testAlert);
      results.email = true;
    } catch (error) {
      results.email = false;
    }
    
    try {
      await this.sendSlackAlert(testAlert);
      results.slack = true;
    } catch (error) {
      results.slack = false;
    }
    
    try {
      await this.sendWebhookAlert(testAlert);
      results.webhook = true;
    } catch (error) {
      results.webhook = false;
    }
    
    console.log(colors.blue('🧪 Alert channel test completed:'));
    for (const [channel, success] of Object.entries(results)) {
      const status = success ? colors.green('✅ PASS') : colors.red('❌ FAIL');
      console.log(`   ${channel}: ${status}`);
    }
    
    return results;
  }
  
  /**
   * Clean up old alerts
   */
  cleanupOldAlerts(): void {
    const maxAge = this.config.alertRetentionDays * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAge;
    
    const initialCount = this.alerts.length;
    this.alerts = this.alerts.filter(alert => alert.timestamp > cutoff);
    
    const removedCount = initialCount - this.alerts.length;
    if (removedCount > 0) {
      console.log(colors.gray(`🗑️ Cleaned up ${removedCount} old alerts`));
    }
  }
  
  /**
   * Get alerting statistics
   */
  getAlertingStats(): {
    totalAlerts: number;
    activeAlerts: number;
    alertsBySeverity: { [severity: string]: number };
    alertsByCategory: { [category: string]: number };
    enabledChannels: string[];
    activeThresholds: number;
  } {
    const activeAlerts = this.getActiveAlerts();
    
    const alertsBySeverity: { [severity: string]: number } = {};
    const alertsByCategory: { [category: string]: number } = {};
    
    for (const alert of this.alerts) {
      alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] || 0) + 1;
      alertsByCategory[alert.category] = (alertsByCategory[alert.category] || 0) + 1;
    }
    
    return {
      totalAlerts: this.alerts.length,
      activeAlerts: activeAlerts.length,
      alertsBySeverity,
      alertsByCategory,
      enabledChannels: this.getEnabledChannels(),
      activeThresholds: this.config.thresholds.filter(t => t.enabled).length
    };
  }
  
  /**
   * Shutdown alerting service
   */
  shutdown(): void {
    console.log(colors.blue('🛑 Shutting down Alerting Service...'));
    
    // Clear timers and cleanup
    this.activeThresholds.clear();
    this.alertCounts.clear();
    
    // Close email transporter
    if (this.emailTransporter) {
      this.emailTransporter.close();
      this.emailTransporter = null;
    }
    
    this.removeAllListeners();
  }
}

/**
 * Singleton alerting service instance
 */
let alertingServiceInstance: AlertingService | null = null;

/**
 * Get or create the global alerting service instance
 */
export function getAlertingService(config?: Partial<AlertingConfig>): AlertingService {
  if (!alertingServiceInstance) {
    alertingServiceInstance = new AlertingService(config);
  }
  return alertingServiceInstance;
}

/**
 * Reset the global alerting service instance (for testing)
 */
export function resetAlertingService(): void {
  if (alertingServiceInstance) {
    alertingServiceInstance.shutdown();
  }
  alertingServiceInstance = null;
}