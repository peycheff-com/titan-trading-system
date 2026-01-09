/**
 * Input Validation and Sanitization Middleware
 * 
 * Validates and sanitizes all user inputs to prevent injection attacks
 * and ensure data integrity.
 * 
 * Requirements: 10.3
 */

import validator from 'validator';

/**
 * Validate trading symbol format
 * @param {string} symbol - Trading symbol (e.g., BTCUSDT)
 * @returns {boolean}
 */
export function isValidSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') {
    return false;
  }
  
  // Symbol should be 6-12 uppercase alphanumeric characters
  // Examples: BTCUSDT, ETHUSDT, SOLUSDT
  return /^[A-Z0-9]{6,12}$/.test(symbol);
}

/**
 * Validate price value
 * @param {number|string} price - Price value
 * @returns {boolean}
 */
export function isValidPrice(price) {
  const numPrice = parseFloat(price);
  
  if (isNaN(numPrice) || numPrice <= 0) {
    return false;
  }
  
  // Price should be positive and reasonable (< 1 billion)
  return numPrice > 0 && numPrice < 1_000_000_000;
}

/**
 * Validate quantity value
 * @param {number|string} qty - Quantity value
 * @returns {boolean}
 */
export function isValidQuantity(qty) {
  const numQty = parseFloat(qty);
  
  if (isNaN(numQty) || numQty <= 0) {
    return false;
  }
  
  // Quantity should be positive and reasonable
  return numQty > 0 && numQty < 1_000_000;
}

/**
 * Validate leverage value
 * @param {number|string} leverage - Leverage value
 * @returns {boolean}
 */
export function isValidLeverage(leverage) {
  const numLeverage = parseInt(leverage);
  
  if (isNaN(numLeverage) || numLeverage < 1) {
    return false;
  }
  
  // Leverage should be between 1 and 125
  return numLeverage >= 1 && numLeverage <= 125;
}

/**
 * Validate direction (LONG/SHORT)
 * @param {string} direction - Trade direction
 * @returns {boolean}
 */
export function isValidDirection(direction) {
  if (!direction || typeof direction !== 'string') {
    return false;
  }
  
  return ['LONG', 'SHORT', 'BUY', 'SELL'].includes(direction.toUpperCase());
}

/**
 * Validate signal ID format
 * @param {string} signalId - Signal identifier
 * @returns {boolean}
 */
export function isValidSignalId(signalId) {
  if (!signalId || typeof signalId !== 'string') {
    return false;
  }
  
  // Signal ID should be alphanumeric with underscores/hyphens
  // Max length 100 characters
  return /^[a-zA-Z0-9_-]{1,100}$/.test(signalId);
}

/**
 * Validate timestamp
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {boolean}
 */
export function isValidTimestamp(timestamp) {
  const numTimestamp = parseInt(timestamp);
  
  if (isNaN(numTimestamp)) {
    return false;
  }
  
  // Timestamp should be within reasonable range (2020-2030)
  const minTimestamp = new Date('2020-01-01').getTime();
  const maxTimestamp = new Date('2030-12-31').getTime();
  
  return numTimestamp >= minTimestamp && numTimestamp <= maxTimestamp;
}

/**
 * Sanitize string input
 * Removes potentially dangerous characters
 * @param {string} input - Input string
 * @returns {string} Sanitized string
 */
export function sanitizeString(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Remove HTML tags
  let sanitized = validator.stripLow(input);
  
  // Escape HTML entities
  sanitized = validator.escape(sanitized);
  
  // Remove SQL injection patterns
  sanitized = sanitized.replace(/['";\\]/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * Validate webhook signal payload
 * @param {Object} signal - Signal object
 * @returns {Object} Validation result { valid: boolean, errors: Array }
 */
export function validateSignalPayload(signal) {
  const errors = [];
  
  // Required fields
  if (!signal.signal_id) {
    errors.push('signal_id is required');
  } else if (!isValidSignalId(signal.signal_id)) {
    errors.push('signal_id format is invalid');
  }
  
  if (!signal.symbol) {
    errors.push('symbol is required');
  } else if (!isValidSymbol(signal.symbol)) {
    errors.push('symbol format is invalid (expected: BTCUSDT)');
  }
  
  if (!signal.direction) {
    errors.push('direction is required');
  } else if (!isValidDirection(signal.direction)) {
    errors.push('direction must be LONG or SHORT');
  }
  
  if (!signal.timestamp) {
    errors.push('timestamp is required');
  } else if (!isValidTimestamp(signal.timestamp)) {
    errors.push('timestamp is invalid or out of range');
  }
  
  // Optional but validated if present
  if (signal.entry_zone) {
    if (!signal.entry_zone.min || !isValidPrice(signal.entry_zone.min)) {
      errors.push('entry_zone.min is invalid');
    }
    if (!signal.entry_zone.max || !isValidPrice(signal.entry_zone.max)) {
      errors.push('entry_zone.max is invalid');
    }
    if (signal.entry_zone.min && signal.entry_zone.max && 
        parseFloat(signal.entry_zone.min) > parseFloat(signal.entry_zone.max)) {
      errors.push('entry_zone.min must be less than entry_zone.max');
    }
  }
  
  if (signal.stop_loss && !isValidPrice(signal.stop_loss)) {
    errors.push('stop_loss is invalid');
  }
  
  if (signal.leverage && !isValidLeverage(signal.leverage)) {
    errors.push('leverage must be between 1 and 125');
  }
  
  if (signal.confidence !== undefined) {
    const confidence = parseFloat(signal.confidence);
    if (isNaN(confidence) || confidence < 0 || confidence > 100) {
      errors.push('confidence must be between 0 and 100');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate position management request
 * @param {Object} request - Position management request
 * @returns {Object} Validation result
 */
export function validatePositionRequest(request) {
  const errors = [];
  
  if (!request.symbol) {
    errors.push('symbol is required');
  } else if (!isValidSymbol(request.symbol)) {
    errors.push('symbol format is invalid');
  }
  
  if (request.stop_loss && !isValidPrice(request.stop_loss)) {
    errors.push('stop_loss is invalid');
  }
  
  if (request.take_profit && !isValidPrice(request.take_profit)) {
    errors.push('take_profit is invalid');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Fastify middleware for input validation
 * Validates request body and returns 400 on validation failure
 */
export function inputValidationMiddleware(validatorFn) {
  return async (request, reply) => {
    const result = validatorFn(request.body);
    
    if (!result.valid) {
      reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input parameters',
        errors: result.errors,
        timestamp: new Date().toISOString()
      });
      return;
    }
  };
}

/**
 * Sanitize request body
 * Recursively sanitizes all string values in an object
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
export function sanitizeRequestBody(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const key in obj) {
    const value = obj[key];
    
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeRequestBody(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Fastify hook for automatic request sanitization
 */
export function sanitizationHook(request, reply, done) {
  if (request.body) {
    request.body = sanitizeRequestBody(request.body);
  }
  
  if (request.query) {
    request.query = sanitizeRequestBody(request.query);
  }
  
  done();
}
