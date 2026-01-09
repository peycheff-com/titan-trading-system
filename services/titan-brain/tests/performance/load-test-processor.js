/**
 * Artillery.js processor for load testing Titan Brain service
 * Provides custom functions for generating test data and HMAC signatures
 * 
 * @module LoadTestProcessor
 */

const crypto = require('crypto');

// Constants
const DEFAULT_SECRET = 'test-secret-for-load-testing';
const HMAC_ALGORITHM = 'sha256';
const SIGNATURE_VERSION = 'v1';

module.exports = {
  generateHMACSignature,
  generateTestSignal,
  generateRandomSymbol
};

/**
 * Generate HMAC signature for webhook requests following Titan Brain's signature format
 * 
 * @param {Object} requestParams - Artillery request parameters
 * @param {Object} requestParams.json - Request body to sign
 * @param {Object} context - Artillery context object
 * @param {Object} context.vars - Variables to set for the request
 * @param {Object} ee - Artillery event emitter
 * @param {Function} next - Callback to continue processing
 * @returns {void}
 */
function generateHMACSignature(requestParams, context, ee, next) {
  try {
    // Input validation
    if (!requestParams || !requestParams.json) {
      const error = new Error('Missing request body for HMAC generation');
      ee.emit('error', error);
      return next(error);
    }

    const secret = process.env.TITAN_WEBHOOK_SECRET || DEFAULT_SECRET;
    const timestamp = Date.now().toString();
    const body = JSON.stringify(requestParams.json);
    
    // Create payload following Titan Brain's expected format
    const payload = `${timestamp}.${body}`;
    const signature = crypto
      .createHmac(HMAC_ALGORITHM, secret)
      .update(payload, 'utf8')
      .digest('hex');
    
    // Set signature in format expected by Titan Brain HMAC validator
    context.vars.hmacSignature = `t=${timestamp},${SIGNATURE_VERSION}=${signature}`;
    context.vars.timestamp = timestamp;
    
    return next();
  } catch (error) {
    ee.emit('error', error);
    return next(error);
  }
}

/**
 * Generate realistic test signal data for load testing
 * 
 * @param {Object} requestParams - Artillery request parameters
 * @param {Object} context - Artillery context object
 * @param {Object} ee - Artillery event emitter
 * @param {Function} next - Callback to continue processing
 * @returns {void}
 */
function generateTestSignal(requestParams, context, ee, next) {
  try {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT', 'DOTUSDT'];
    const phases = ['phase1', 'phase2'];
    const signalTypes = ['BUY_SETUP', 'SELL_SETUP', 'CLOSE_POSITION'];
    
    const signal = {
      phase: phases[Math.floor(Math.random() * phases.length)],
      symbol: symbols[Math.floor(Math.random() * symbols.length)],
      type: signalTypes[Math.floor(Math.random() * signalTypes.length)],
      confidence: Math.floor(Math.random() * 40) + 60, // 60-100
      timestamp: Date.now(),
      metadata: {
        source: 'load-test',
        testId: crypto.randomUUID()
      }
    };
    
    context.vars.testSignal = signal;
    requestParams.json = signal;
    
    return next();
  } catch (error) {
    ee.emit('error', error);
    return next(error);
  }
}

/**
 * Generate random symbol for testing
 * 
 * @param {Object} requestParams - Artillery request parameters
 * @param {Object} context - Artillery context object
 * @param {Object} ee - Artillery event emitter
 * @param {Function} next - Callback to continue processing
 * @returns {void}
 */
function generateRandomSymbol(requestParams, context, ee, next) {
  try {
    const symbols = [
      'BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT', 'DOTUSDT',
      'LINKUSDT', 'MATICUSDT', 'AVAXUSDT', 'ATOMUSDT', 'NEARUSDT'
    ];
    
    context.vars.randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
    
    return next();
  } catch (error) {
    ee.emit('error', error);
    return next(error);
  }
}