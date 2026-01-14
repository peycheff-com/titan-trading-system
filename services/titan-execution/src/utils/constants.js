/**
 * Application Constants
 * 
 * Centralized constants for the Titan Execution service.
 * Eliminates magic numbers and provides single source of truth.
 */

export const CONSTANTS = {
  // WebSocket paths
  WS_STATUS_PATH: '/ws/status',
  WS_CONSOLE_PATH: '/ws/console',
  WS_SCAVENGER_PATH: '/ws/scavenger',

  // CORS
  CORS_ORIGINS: [
    'http://localhost:3000', 
    'http://localhost:5173', 
    'http://localhost:3001',
    'https://titan-console-production.up.railway.app'
  ],
  
  // Timing constants (milliseconds)
  METRICS_UPDATE_INTERVAL_MS: 5000,
  DEFAULT_RATE_LIMIT_WINDOW_MS: 60000,
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: 10000,
  BROKER_RECONNECT_DELAY_MS: 5000,
  
  // Rate limiting
  DEFAULT_RATE_LIMIT_MAX: 100,
  DEFAULT_RATE_LIMIT_WINDOW: '1 minute',
  
  // Broker defaults
  DEFAULT_BYBIT_RATE_LIMIT: 10,
  DEFAULT_BYBIT_MAX_RETRIES: 3,
  DEFAULT_BYBIT_CACHE_TTL_MS: 5000,
  MAX_BROKER_RECONNECT_ATTEMPTS: 3,
  
  // Health check
  HEALTH_CHECK_INTERVAL_MS: 30000,
  
  // Change detection thresholds
  LEVERAGE_CHANGE_THRESHOLD: 0.01, // 1%
  DRAWDOWN_CHANGE_THRESHOLD: 0.001, // 0.1%
  
  // Signal processing
  SIGNAL_TYPES: {
    PREPARE: 'PREPARE',
    CONFIRM: 'CONFIRM',
    ABORT: 'ABORT',
  },
  
  // Position sides
  POSITION_SIDES: {
    BUY: 'Buy',
    SELL: 'Sell',
  },
  
  // Order types
  ORDER_TYPES: {
    MARKET: 'MARKET',
    LIMIT: 'LIMIT',
    POST_ONLY: 'POST_ONLY',
  },
  
  // Circuit breaker states
  CIRCUIT_BREAKER_STATES: {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN',
  },
  
  // Log levels
  LOG_LEVELS: {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
  },

  // Execution modes
  EXECUTION_MODES: {
    MAKER: 'MAKER',
    TAKER: 'TAKER',
  },
};

// Freeze to prevent accidental modification
Object.freeze(CONSTANTS);
Object.freeze(CONSTANTS.SIGNAL_TYPES);
Object.freeze(CONSTANTS.POSITION_SIDES);
Object.freeze(CONSTANTS.ORDER_TYPES);
Object.freeze(CONSTANTS.CIRCUIT_BREAKER_STATES);
Object.freeze(CONSTANTS.LOG_LEVELS);
Object.freeze(CONSTANTS.EXECUTION_MODES);
