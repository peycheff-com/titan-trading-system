/**
 * InputValidator - Comprehensive input validation and sanitization
 *
 * Implements input validation, sanitization, and security checks
 * to prevent injection attacks and ensure data integrity.
 *
 * Requirements: 6.1, 6.2 - Input validation and sanitization
 */

import { PhaseId } from '../types/index.js';

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedValue?: unknown;
}

/**
 * Validation options
 */
export interface ValidationOptions {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  allowedValues?: unknown[];
  sanitize?: boolean;
}

/**
 * Input validation and sanitization utilities
 */
export class InputValidator {
  /**
   * Validate and sanitize a string input
   */
  static validateString(
    value: unknown,
    fieldName: string,
    options: ValidationOptions = {},
  ): ValidationResult {
    const errors: string[] = [];

    // Check if required
    if (options.required && (value === null || value === undefined || value === '')) {
       
      errors.push(`${fieldName} is required`);
      return { isValid: false, errors };
    }

    // Allow empty values if not required
    if (!options.required && (value === null || value === undefined || value === '')) {
      return { isValid: true, errors: [], sanitizedValue: value };
    }

    // Type check
    if (typeof value !== 'string') {
       
      errors.push(`${fieldName} must be a string`);
      return { isValid: false, errors };
    }

     
    let sanitizedValue = value;

    // Sanitize if requested
    if (options.sanitize) {
      sanitizedValue = this.sanitizeString(value);
    }

    // Length validation
    if (options.minLength !== undefined && sanitizedValue.length < options.minLength) {
       
      errors.push(`${fieldName} must be at least ${options.minLength} characters long`);
    }

    if (options.maxLength !== undefined && sanitizedValue.length > options.maxLength) {
       
      errors.push(`${fieldName} must be at most ${options.maxLength} characters long`);
    }

    // Pattern validation
    if (options.pattern && !options.pattern.test(sanitizedValue)) {
       
      errors.push(`${fieldName} format is invalid`);
    }

    // Allowed values validation
    if (options.allowedValues && !options.allowedValues.includes(sanitizedValue)) {
       
      errors.push(`${fieldName} must be one of: ${options.allowedValues.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue,
    };
  }

  /**
   * Validate and sanitize a number input
   */
  static validateNumber(
    value: unknown,
    fieldName: string,
    options: ValidationOptions = {},
  ): ValidationResult {
    const errors: string[] = [];

    // Check if required
    if (options.required && (value === null || value === undefined)) {
       
      errors.push(`${fieldName} is required`);
      return { isValid: false, errors };
    }

    // Allow empty values if not required
    if (!options.required && (value === null || value === undefined)) {
      return { isValid: true, errors: [], sanitizedValue: value };
    }

    // Type check and conversion
     
    let numValue: number;
    if (typeof value === 'string') {
      numValue = parseFloat(value);
      if (isNaN(numValue)) {
         
        errors.push(`${fieldName} must be a valid number`);
        return { isValid: false, errors };
      }
    } else if (typeof value === 'number') {
      numValue = value;
    } else {
       
      errors.push(`${fieldName} must be a number`);
      return { isValid: false, errors };
    }

    // Check for infinity and NaN
    if (!isFinite(numValue)) {
       
      errors.push(`${fieldName} must be a finite number`);
      return { isValid: false, errors };
    }

    // Range validation
    if (options.min !== undefined && numValue < options.min) {
       
      errors.push(`${fieldName} must be at least ${options.min}`);
    }

    if (options.max !== undefined && numValue > options.max) {
       
      errors.push(`${fieldName} must be at most ${options.max}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue: numValue,
    };
  }

  /**
   * Validate boolean input
   */
  static validateBoolean(
    value: unknown,
    fieldName: string,
    options: ValidationOptions = {},
  ): ValidationResult {
    const errors: string[] = [];

    // Check if required
    if (options.required && (value === null || value === undefined)) {
       
      errors.push(`${fieldName} is required`);
      return { isValid: false, errors };
    }

    // Allow empty values if not required
    if (!options.required && (value === null || value === undefined)) {
      return { isValid: true, errors: [], sanitizedValue: value };
    }

    // Type check and conversion
     
    let boolValue: boolean;
    if (typeof value === 'boolean') {
      boolValue = value;
    } else if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true' || lowerValue === '1') {
        boolValue = true;
      } else if (lowerValue === 'false' || lowerValue === '0') {
        boolValue = false;
      } else {
         
        errors.push(`${fieldName} must be a boolean value (true/false)`);
        return { isValid: false, errors };
      }
    } else if (typeof value === 'number') {
      boolValue = value !== 0;
    } else {
       
      errors.push(`${fieldName} must be a boolean value`);
      return { isValid: false, errors };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: boolValue,
    };
  }

  /**
   * Validate array input
   */
  static validateArray(
    value: unknown,
    fieldName: string,
    options: ValidationOptions = {},
  ): ValidationResult {
    const errors: string[] = [];

    // Check if required
    if (options.required && (value === null || value === undefined)) {
       
      errors.push(`${fieldName} is required`);
      return { isValid: false, errors };
    }

    // Allow empty values if not required
    if (!options.required && (value === null || value === undefined)) {
      return { isValid: true, errors: [], sanitizedValue: value };
    }

    // Type check
    if (!Array.isArray(value)) {
       
      errors.push(`${fieldName} must be an array`);
      return { isValid: false, errors };
    }

    // Length validation
    if (options.minLength !== undefined && value.length < options.minLength) {
       
      errors.push(`${fieldName} must have at least ${options.minLength} items`);
    }

    if (options.maxLength !== undefined && value.length > options.maxLength) {
       
      errors.push(`${fieldName} must have at most ${options.maxLength} items`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue: value,
    };
  }

  /**
   * Sanitize string input to prevent XSS and injection attacks
   */
  private static sanitizeString(input: string): string {
    return (
      input
        // Remove null bytes
        .replace(/\0/g, '')
        // Remove control characters except newline, carriage return, and tab
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Trim whitespace
        .trim()
    );
  }

  /**
   * Validate signal ID format
   */
  static validateSignalId(signalId: unknown): ValidationResult {
    return this.validateString(signalId, 'signalId', {
      required: true,
      minLength: 1,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9_-]+$/,
      sanitize: true,
    });
  }

  /**
   * Validate phase ID
   */
  static validatePhaseId(phaseId: unknown): ValidationResult {
    return this.validateString(phaseId, 'phaseId', {
      required: true,
      allowedValues: ['phase1', 'phase2', 'phase3'],
      sanitize: true,
    });
  }

  /**
   * Validate trading symbol
   */
  static validateSymbol(symbol: unknown): ValidationResult {
    return this.validateString(symbol, 'symbol', {
      required: true,
      minLength: 3,
      maxLength: 20,
      pattern: /^[A-Z0-9]+$/,
      sanitize: true,
    });
  }

  /**
   * Validate trade side
   */
  static validateSide(side: unknown): ValidationResult {
    return this.validateString(side, 'side', {
      required: true,
      allowedValues: ['BUY', 'SELL'],
      sanitize: true,
    });
  }

  /**
   * Validate position size
   */
  static validatePositionSize(size: unknown): ValidationResult {
    return this.validateNumber(size, 'requestedSize', {
      required: true,
      min: 0.000001,
      max: 1000000,
    });
  }

  /**
   * Validate leverage
   */
  static validateLeverage(leverage: unknown): ValidationResult {
    return this.validateNumber(leverage, 'leverage', {
      required: false,
      min: 1,
      max: 100,
    });
  }

  /**
   * Validate operator ID
   */
  static validateOperatorId(operatorId: unknown): ValidationResult {
    return this.validateString(operatorId, 'operatorId', {
      required: true,
      minLength: 3,
      maxLength: 50,
      pattern: /^[a-zA-Z0-9_-]+$/,
      sanitize: true,
    });
  }

  /**
   * Validate password (basic validation - should be enhanced based on policy)
   */
  static validatePassword(password: unknown): ValidationResult {
    return this.validateString(password, 'password', {
      required: true,
      minLength: 8,
      maxLength: 128,
    });
  }

  /**
   * Validate allocation weights
   */
  static validateAllocationWeights(allocation: unknown): ValidationResult {
    const errors: string[] = [];

    if (!allocation || typeof allocation !== 'object') {
       
      errors.push('allocation must be an object');
      return { isValid: false, errors };
    }

    const alloc = allocation as Record<string, unknown>;

    // Validate individual weights
    const w1Result = this.validateNumber(alloc.w1, 'w1', {
      required: true,
      min: 0,
      max: 1,
    });
    const w2Result = this.validateNumber(alloc.w2, 'w2', {
      required: true,
      min: 0,
      max: 1,
    });
    const w3Result = this.validateNumber(alloc.w3, 'w3', {
      required: true,
      min: 0,
      max: 1,
    });

     
    errors.push(...w1Result.errors, ...w2Result.errors, ...w3Result.errors);

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    // Validate sum equals 1.0
    const sum =
      (w1Result.sanitizedValue as number) +
      (w2Result.sanitizedValue as number) +
      (w3Result.sanitizedValue as number);

    if (Math.abs(sum - 1.0) > 0.001) {
       
      errors.push(`allocation weights must sum to 1.0, got ${sum.toFixed(3)}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue: {
        w1: w1Result.sanitizedValue,
        w2: w2Result.sanitizedValue,
        w3: w3Result.sanitizedValue,
      },
    };
  }

  /**
   * Validate permissions array
   */
  static validatePermissions(permissions: unknown): ValidationResult {
    const arrayResult = this.validateArray(permissions, 'permissions', {
      required: true,
      minLength: 1,
      maxLength: 20,
    });

    if (!arrayResult.isValid) {
      return arrayResult;
    }

    const errors: string[] = [];
    const validPermissions = [
      'override:create',
      'override:deactivate',
      'breaker:reset',
      'operator:create',
      'config:update',
    ];

    const perms = arrayResult.sanitizedValue as string[];
    for (const perm of perms) {
      const permResult = this.validateString(perm, 'permission', {
        required: true,
        allowedValues: validPermissions,
        sanitize: true,
      });

      if (!permResult.isValid) {
         
        errors.push(...permResult.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue: perms,
    };
  }

  /**
   * Validate and sanitize a complete signal request
   */
  static validateSignalRequest(body: unknown): ValidationResult {
    const errors: string[] = [];
    const sanitizedBody: Record<string, unknown> = {};

    if (!body || typeof body !== 'object') {
       
      errors.push('Request body must be an object');
      return { isValid: false, errors };
    }

    const req = body as Record<string, unknown>;

    // Validate each field
    const validations = [
      {
        field: 'signalId',
        validator: () => this.validateSignalId(req.signalId),
      },
      { field: 'phaseId', validator: () => this.validatePhaseId(req.phaseId) },
      { field: 'symbol', validator: () => this.validateSymbol(req.symbol) },
      { field: 'side', validator: () => this.validateSide(req.side) },
      {
        field: 'requestedSize',
        validator: () => this.validatePositionSize(req.requestedSize),
      },
      {
        field: 'leverage',
        validator: () => this.validateLeverage(req.leverage),
      },
      {
        field: 'timestamp',
        validator: () =>
          this.validateNumber(req.timestamp, 'timestamp', {
            required: false,
            min: 0,
          }),
      },
    ];

    for (const { field, validator } of validations) {
      const result = validator();
      if (!result.isValid) {
         
        errors.push(...result.errors);
      } else if (result.sanitizedValue !== undefined) {
         
        sanitizedBody[field] = result.sanitizedValue;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue: sanitizedBody,
    };
  }

  /**
   * Rate limiting validation (check if request rate is within limits)
   */
  static validateRateLimit(
    clientId: string,
    requestsPerMinute: number = 60,
    windowMs: number = 60000,
  ): ValidationResult {
    // This is a simplified rate limiting check
    // In production, you would use Redis or similar for distributed rate limiting

    const now = Date.now();
    const windowStart = now - windowMs;

    // This would typically be stored in Redis with expiration
    // For now, we'll just return success (implement proper rate limiting in production)

    return {
      isValid: true,
      errors: [],
      sanitizedValue: { clientId, timestamp: now },
    };
  }
}

/**
 * Security audit logger for validation failures
 */
export class SecurityAuditLogger {
  /**
   * Log security validation failure
   */
  static logValidationFailure(
    clientIp: string,
    endpoint: string,
    errors: string[],
    requestBody?: unknown,
  ): void {
    const auditEvent = {
      timestamp: new Date().toISOString(),
      event: 'VALIDATION_FAILURE',
      clientIp,
      endpoint,
      errors,
      // Don't log sensitive data in audit logs
      hasRequestBody: !!requestBody,
      severity: 'WARNING',
    };

    console.warn('SECURITY_AUDIT:', JSON.stringify(auditEvent));
  }

  /**
   * Log potential security threat
   */
  static logSecurityThreat(
    clientIp: string,
    endpoint: string,
    threatType: string,
    details: string,
  ): void {
    const auditEvent = {
      timestamp: new Date().toISOString(),
      event: 'SECURITY_THREAT',
      clientIp,
      endpoint,
      threatType,
      details,
      severity: 'CRITICAL',
    };

    console.error('SECURITY_THREAT:', JSON.stringify(auditEvent));
  }

  /**
   * Log authentication failure
   */
  static logAuthenticationFailure(clientIp: string, operatorId: string, reason: string): void {
    const auditEvent = {
      timestamp: new Date().toISOString(),
      event: 'AUTH_FAILURE',
      clientIp,
      operatorId,
      reason,
      severity: 'WARNING',
    };

    console.warn('AUTH_AUDIT:', JSON.stringify(auditEvent));
  }
}
