/**
 * Response Factory
 * Standardizes API response formats
 */

export class ResponseFactory {
  /**
   * Create a success response
   * @param {Object} data - Response data
   * @returns {Object} Success response
   */
  static success(data) {
    return {
      ...data,
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * Create an error response
   * @param {string|Error} error - Error message or Error object
   * @param {number} statusCode - HTTP status code
   * @returns {Object} Error response
   */
  static error(error, statusCode = 500) {
    return {
      status: 'error',
      error: typeof error === 'string' ? error : error.message,
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * Create a rejected response
   * @param {string} signal_id - Signal ID
   * @param {string} reason - Rejection reason
   * @param {Object} additionalData - Additional data
   * @returns {Object} Rejected response
   */
  static rejected(signal_id, reason, additionalData = {}) {
    return {
      status: 'rejected',
      signal_id,
      reason,
      ...additionalData,
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * Create a blocked response
   * @param {string} signal_id - Signal ID
   * @param {string} reason - Block reason
   * @param {Object} additionalData - Additional data
   * @returns {Object} Blocked response
   */
  static blocked(signal_id, reason, additionalData = {}) {
    return {
      status: 'blocked',
      signal_id,
      reason,
      ...additionalData,
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * Create a prepared response
   * @param {string} signal_id - Signal ID
   * @param {Object} data - Preparation data
   * @returns {Object} Prepared response
   */
  static prepared(signal_id, data) {
    return {
      status: 'prepared',
      signal_id,
      ...data,
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * Create an executed response
   * @param {string} signal_id - Signal ID
   * @param {Object} data - Execution data
   * @returns {Object} Executed response
   */
  static executed(signal_id, data) {
    return {
      status: 'executed',
      signal_id,
      ...data,
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * Create an aborted response
   * @param {string} signal_id - Signal ID
   * @returns {Object} Aborted response
   */
  static aborted(signal_id) {
    return {
      status: 'aborted',
      signal_id,
      timestamp: new Date().toISOString(),
    };
  }
}
