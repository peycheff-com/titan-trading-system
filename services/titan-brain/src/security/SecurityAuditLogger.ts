/**
 * SecurityAuditLogger - Comprehensive security audit logging
 *
 * Implements security event logging, threat detection, and audit trails
 * for all critical operations in the Titan trading system.
 *
 * Requirements: 6.1, 6.2 - Security audit logging and monitoring
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getLogger } from '../monitoring/StructuredLogger.js';

/**
 * Security event types
 */
export type SecurityEventType =
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILURE'
  | 'VALIDATION_FAILURE'
  | 'HMAC_FAILURE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'PRIVILEGE_ESCALATION'
  | 'DATA_ACCESS'
  | 'CONFIG_CHANGE'
  | 'EMERGENCY_ACTION';

/**
 * Security event severity levels
 */
export type SecuritySeverity = 'INFO' | 'WARNING' | 'CRITICAL';

/**
 * Security audit event
 */
export interface SecurityAuditEvent {
  timestamp: string;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  clientIp: string;
  userAgent?: string;
  operatorId?: string;
  endpoint?: string;
  method?: string;
  details: Record<string, unknown>;
  correlationId?: string;
}

/**
 * Threat detection patterns
 */
interface ThreatPattern {
  name: string;
  pattern: RegExp;
  severity: SecuritySeverity;
  description: string;
}

/**
 * Security audit configuration
 */
export interface SecurityAuditConfig {
  logDirectory: string;
  maxLogFileSize: number; // bytes
  retentionDays: number;
  enableThreatDetection: boolean;
  alertThresholds: {
    authFailuresPerMinute: number;
    validationFailuresPerMinute: number;
    suspiciousActivityPerHour: number;
  };
}

/**
 * Default security audit configuration
 */
const DEFAULT_CONFIG: SecurityAuditConfig = {
  logDirectory: './logs/security',
  maxLogFileSize: 10 * 1024 * 1024, // 10MB
  retentionDays: 90,
  enableThreatDetection: true,
  alertThresholds: {
    authFailuresPerMinute: 5,
    validationFailuresPerMinute: 20,
    suspiciousActivityPerHour: 10,
  },
};

/**
 * Threat detection patterns
 */
const THREAT_PATTERNS: ThreatPattern[] = [
  {
    name: 'SQL_INJECTION',
    pattern: /(union|select|insert|update|delete|drop|exec|script)/i,
    severity: 'CRITICAL',
    description: 'Potential SQL injection attempt',
  },
  {
    name: 'XSS_ATTEMPT',
    pattern: /<script|javascript:|on\w+\s*=/i,
    severity: 'CRITICAL',
    description: 'Potential XSS attack attempt',
  },
  {
    name: 'PATH_TRAVERSAL',
    pattern: /\.\.[\/\\]/, // eslint-disable-line no-useless-escape
    severity: 'CRITICAL',
    description: 'Potential path traversal attempt',
  },
  {
    name: 'COMMAND_INJECTION',
    pattern: /[;&|`$(){}]/,
    severity: 'WARNING',
    description: 'Potential command injection attempt',
  },
  {
    name: 'EXCESSIVE_SIZE',
    pattern: /.{10000,}/,
    severity: 'WARNING',
    description: 'Unusually large input detected',
  },
];

/**
 * Security audit logger with threat detection
 */
export class SecurityAuditLogger {
  private config: SecurityAuditConfig;
  private logger = getLogger({ component: 'security-audit' });
  private eventCounts: Map<string, { count: number; lastReset: number }> = new Map();

  constructor(config: Partial<SecurityAuditConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureLogDirectory();
  }

  /**
   * Log a security audit event
   */
  logSecurityEvent(
    event: Omit<SecurityAuditEvent, 'timestamp'>,
    skipThreatDetection: boolean = false,
  ): void {
    const auditEvent: SecurityAuditEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    // Log to structured logger
    this.logger.warn('Security audit event', {
      securityEvent: auditEvent,
    });

    // Write to security audit file
    this.writeToAuditFile(auditEvent);

    // Perform threat detection (but not for suspicious activity events to prevent recursion)
    if (
      this.config.enableThreatDetection &&
      !skipThreatDetection &&
      event.eventType !== 'SUSPICIOUS_ACTIVITY'
    ) {
      this.detectThreats(auditEvent);
    }

    // Check alert thresholds
    this.checkAlertThresholds(auditEvent);
  }

  /**
   * Log authentication success
   */
  logAuthenticationSuccess(
    clientIp: string,
    operatorId: string,
    endpoint: string,
    userAgent?: string,
  ): void {
    this.logSecurityEvent({
      eventType: 'AUTH_SUCCESS',
      severity: 'INFO',
      clientIp,
      operatorId,
      endpoint,
      userAgent,
      details: {
        action: 'authentication_success',
        operatorId,
      },
    });
  }

  /**
   * Log authentication failure
   */
  logAuthenticationFailure(
    clientIp: string,
    operatorId: string,
    reason: string,
    endpoint: string,
    userAgent?: string,
  ): void {
    this.logSecurityEvent({
      eventType: 'AUTH_FAILURE',
      severity: 'WARNING',
      clientIp,
      operatorId,
      endpoint,
      userAgent,
      details: {
        action: 'authentication_failure',
        operatorId,
        reason,
      },
    });

    // Increment failure count for rate limiting
    this.incrementEventCount(`auth_failure_${clientIp}`);
  }

  /**
   * Log validation failure
   */
  logValidationFailure(
    clientIp: string,
    endpoint: string,
    errors: string[],
    requestData?: unknown,
    userAgent?: string,
  ): void {
    this.logSecurityEvent({
      eventType: 'VALIDATION_FAILURE',
      severity: 'WARNING',
      clientIp,
      endpoint,
      userAgent,
      details: {
        action: 'validation_failure',
        errors,
        hasRequestData: !!requestData,
        // Don't log sensitive request data
        requestDataType: requestData ? typeof requestData : 'none',
      },
    });

    // Increment failure count
    this.incrementEventCount(`validation_failure_${clientIp}`);
  }

  /**
   * Log HMAC signature failure
   */
  logHmacFailure(clientIp: string, endpoint: string, reason: string, userAgent?: string): void {
    this.logSecurityEvent({
      eventType: 'HMAC_FAILURE',
      severity: 'CRITICAL',
      clientIp,
      endpoint,
      userAgent,
      details: {
        action: 'hmac_verification_failure',
        reason,
      },
    });
  }

  /**
   * Log rate limit exceeded
   */
  logRateLimitExceeded(
    clientIp: string,
    endpoint: string,
    requestCount: number,
    timeWindow: number,
    userAgent?: string,
  ): void {
    this.logSecurityEvent({
      eventType: 'RATE_LIMIT_EXCEEDED',
      severity: 'WARNING',
      clientIp,
      endpoint,
      userAgent,
      details: {
        action: 'rate_limit_exceeded',
        requestCount,
        timeWindowMs: timeWindow,
      },
    });
  }

  /**
   * Log suspicious activity
   */
  logSuspiciousActivity(
    clientIp: string,
    activityType: string,
    details: Record<string, unknown>,
    endpoint?: string,
    userAgent?: string,
  ): void {
    this.logSecurityEvent(
      {
        eventType: 'SUSPICIOUS_ACTIVITY',
        severity: 'CRITICAL',
        clientIp,
        endpoint,
        userAgent,
        details: {
          action: 'suspicious_activity',
          activityType,
          ...details,
        },
      },
      true,
    ); // Skip threat detection to prevent recursion

    // Increment suspicious activity count
    this.incrementEventCount(`suspicious_${clientIp}`);
  }

  /**
   * Log privilege escalation attempt
   */
  logPrivilegeEscalation(
    clientIp: string,
    operatorId: string,
    attemptedAction: string,
    endpoint: string,
    userAgent?: string,
  ): void {
    this.logSecurityEvent({
      eventType: 'PRIVILEGE_ESCALATION',
      severity: 'CRITICAL',
      clientIp,
      operatorId,
      endpoint,
      userAgent,
      details: {
        action: 'privilege_escalation_attempt',
        operatorId,
        attemptedAction,
      },
    });
  }

  /**
   * Log sensitive data access
   */
  logDataAccess(
    clientIp: string,
    operatorId: string,
    dataType: string,
    endpoint: string,
    success: boolean,
    userAgent?: string,
  ): void {
    this.logSecurityEvent({
      eventType: 'DATA_ACCESS',
      severity: 'INFO',
      clientIp,
      operatorId,
      endpoint,
      userAgent,
      details: {
        action: 'data_access',
        operatorId,
        dataType,
        success,
      },
    });
  }

  /**
   * Log configuration changes
   */
  logConfigurationChange(
    clientIp: string,
    operatorId: string,
    configType: string,
    changes: Record<string, unknown>,
    endpoint: string,
    userAgent?: string,
  ): void {
    this.logSecurityEvent({
      eventType: 'CONFIG_CHANGE',
      severity: 'WARNING',
      clientIp,
      operatorId,
      endpoint,
      userAgent,
      details: {
        action: 'configuration_change',
        operatorId,
        configType,
        changes,
      },
    });
  }

  /**
   * Log emergency actions
   */
  logEmergencyAction(
    clientIp: string,
    operatorId: string,
    actionType: string,
    details: Record<string, unknown>,
    endpoint: string,
    userAgent?: string,
  ): void {
    this.logSecurityEvent({
      eventType: 'EMERGENCY_ACTION',
      severity: 'CRITICAL',
      clientIp,
      operatorId,
      endpoint,
      userAgent,
      details: {
        action: 'emergency_action',
        operatorId,
        actionType,
        ...details,
      },
    });
  }

  /**
   * Detect threats in input data
   */
  private detectThreats(event: SecurityAuditEvent): void {
    const inputData = JSON.stringify(event.details);

    for (const pattern of THREAT_PATTERNS) {
      if (pattern.pattern.test(inputData)) {
        this.logSuspiciousActivity(
          event.clientIp,
          pattern.name,
          {
            threatPattern: pattern.name,
            description: pattern.description,
            detectedIn: 'audit_event_details',
            originalEventType: event.eventType,
          },
          event.endpoint,
          event.userAgent,
        );
      }
    }
  }

  /**
   * Check alert thresholds and trigger alerts
   */
  private checkAlertThresholds(event: SecurityAuditEvent): void {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    const oneHour = 60 * 60 * 1000;

    // Check authentication failures
    if (event.eventType === 'AUTH_FAILURE') {
      const key = `auth_failure_${event.clientIp}`;
      const count = this.getEventCount(key, oneMinute);
      if (count >= this.config.alertThresholds.authFailuresPerMinute) {
        this.triggerAlert('HIGH_AUTH_FAILURE_RATE', {
          clientIp: event.clientIp,
          count,
          threshold: this.config.alertThresholds.authFailuresPerMinute,
          timeWindow: 'per_minute',
        });
      }
    }

    // Check validation failures
    if (event.eventType === 'VALIDATION_FAILURE') {
      const key = `validation_failure_${event.clientIp}`;
      const count = this.getEventCount(key, oneMinute);
      if (count >= this.config.alertThresholds.validationFailuresPerMinute) {
        this.triggerAlert('HIGH_VALIDATION_FAILURE_RATE', {
          clientIp: event.clientIp,
          count,
          threshold: this.config.alertThresholds.validationFailuresPerMinute,
          timeWindow: 'per_minute',
        });
      }
    }

    // Check suspicious activity
    if (event.eventType === 'SUSPICIOUS_ACTIVITY') {
      const key = `suspicious_${event.clientIp}`;
      const count = this.getEventCount(key, oneHour);
      if (count >= this.config.alertThresholds.suspiciousActivityPerHour) {
        this.triggerAlert('HIGH_SUSPICIOUS_ACTIVITY_RATE', {
          clientIp: event.clientIp,
          count,
          threshold: this.config.alertThresholds.suspiciousActivityPerHour,
          timeWindow: 'per_hour',
        });
      }
    }
  }

  /**
   * Trigger security alert
   */
  private triggerAlert(alertType: string, details: Record<string, unknown>): void {
    this.logger.error('Security alert triggered', {
      alertType,
      details,
      timestamp: new Date().toISOString(),
    });

    // In production, this would integrate with alerting systems like PagerDuty, Slack, etc.
    console.error(`🚨 SECURITY ALERT: ${alertType}`, details);
  }

  /**
   * Increment event count for rate limiting
   */
  private incrementEventCount(key: string): void {
    const now = Date.now();
    const existing = this.eventCounts.get(key);

    if (!existing || now - existing.lastReset > 60000) {
      // Reset every minute

      this.eventCounts.set(key, { count: 1, lastReset: now });
    } else {
      existing.count++;
    }
  }

  /**
   * Get event count within time window
   */
  private getEventCount(key: string, timeWindowMs: number): number {
    const now = Date.now();
    const existing = this.eventCounts.get(key);

    if (!existing || now - existing.lastReset > timeWindowMs) {
      return 0;
    }

    return existing.count;
  }

  /**
   * Write audit event to file
   */
  private writeToAuditFile(event: SecurityAuditEvent): void {
    try {
      const date = new Date().toISOString().split('T')[0];
      const filename = `security-audit-${date}.jsonl`;
      const filepath = join(this.config.logDirectory, filename);

      const logLine = JSON.stringify(event) + '\n';
      appendFileSync(filepath, logLine, 'utf8');

      // Check file size and rotate if necessary
      this.rotateLogFileIfNeeded(filepath);
    } catch (error) {
      this.logger.error('Failed to write security audit log', { error });
    }
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    if (!existsSync(this.config.logDirectory)) {
      mkdirSync(this.config.logDirectory, { recursive: true });
    }
  }

  /**
   * Rotate log file if it exceeds max size
   */
  private rotateLogFileIfNeeded(filepath: string): void {
    try {
      const stats = statSync(filepath);
      if (stats.size > this.config.maxLogFileSize) {
        const timestamp = Date.now();
        const rotatedPath = `${filepath}.${timestamp}`;
        renameSync(filepath, rotatedPath);

        this.logger.info('Security audit log rotated', {
          originalPath: filepath,
          rotatedPath,
          size: stats.size,
        });
      }
    } catch (error) {
      this.logger.error('Failed to rotate security audit log', { error });
    }
  }

  /**
   * Get security statistics
   */
  getSecurityStatistics(timeRangeHours: number = 24): Record<string, number> {
    // This would typically query the audit logs
    // For now, return current in-memory counts
    const stats: Record<string, number> = {};

    for (const [key, value] of this.eventCounts.entries()) {
      const now = Date.now();
      const timeWindow = timeRangeHours * 60 * 60 * 1000;

      if (now - value.lastReset <= timeWindow) {
        stats[key] = value.count;
      }
    }

    return stats;
  }
}

/**
 * Singleton instance for global security audit logging
 */

let auditLoggerInstance: SecurityAuditLogger | null = null;

/**
 * Get or create the global security audit logger instance
 */
export function getSecurityAuditLogger(config?: Partial<SecurityAuditConfig>): SecurityAuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new SecurityAuditLogger(config);
  }
  return auditLoggerInstance;
}

/**
 * Reset the global security audit logger instance (for testing)
 */
export function resetSecurityAuditLogger(): void {
  auditLoggerInstance = null;
}
