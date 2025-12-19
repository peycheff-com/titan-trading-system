/**
 * Input Validation Utilities
 */

export const validators = {
  /**
   * Parse and validate limit parameter
   * @param {string|number} value - Limit value
   * @param {number} defaultValue - Default limit
   * @param {number} min - Minimum allowed value
   * @param {number} max - Maximum allowed value
   * @returns {number} Validated limit
   */
  parseLimit(value, defaultValue = 100, min = 1, max = 1000) {
    if (!value) return defaultValue;
    const num = parseInt(value, 10);
    if (isNaN(num) || num < min || num > max) {
      throw new Error(`Invalid limit. Must be between ${min} and ${max}.`);
    }
    return num;
  },
  
  /**
   * Parse and validate offset parameter
   * @param {string|number} value - Offset value
   * @param {number} defaultValue - Default offset
   * @returns {number} Validated offset
   */
  parseOffset(value, defaultValue = 0) {
    if (!value) return defaultValue;
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) {
      throw new Error('Invalid offset. Must be non-negative.');
    }
    return num;
  },
  
  /**
   * Parse and validate date parameter
   * @param {string} value - Date string
   * @param {string} fieldName - Field name for error message
   * @returns {Date|null} Validated date or null
   */
  parseDate(value, fieldName) {
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid ${fieldName} format. Use ISO 8601 format.`);
    }
    return date;
  },
  
  /**
   * Parse and validate phase parameter
   * @param {string|number} value - Phase value
   * @returns {number|null} Validated phase or null
   */
  parsePhase(value) {
    if (!value) return null;
    const phaseNum = parseInt(value, 10);
    if (phaseNum !== 1 && phaseNum !== 2) {
      throw new Error('Invalid phase. Must be 1 or 2.');
    }
    return phaseNum;
  },
  
  /**
   * Validate symbol format
   * @param {string} value - Symbol value
   * @returns {string} Uppercase symbol
   */
  parseSymbol(value) {
    if (!value) return null;
    return value.toUpperCase();
  },
};

/**
 * Mask API key for logging (show first 8 chars only)
 * @param {string} key - API key to mask
 * @returns {string} Masked API key
 */
export const maskApiKey = (key) => {
  if (!key || key.length < 8) return '***';
  return key.substring(0, 8) + '...';
};
