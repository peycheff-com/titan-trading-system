/**
 * Enhanced test script for Hunter HUD
 * Provides robust error handling and proper shutdown management
 */

// Fix import path - should match actual file
import { HunterHUD } from './src/console/HunterHUD.js';

// Configuration for test environment
const TEST_CONFIG = {
  enableLogging: true,
  exitOnError: true,
  shutdownTimeout: 5000
};

/**
 * Centralized shutdown handler to avoid code duplication
 * @param {number} exitCode - Process exit code
 * @param {string} reason - Reason for shutdown
 */
const gracefulShutdown = (exitCode = 0, reason = 'Normal shutdown') => {
  if (TEST_CONFIG.enableLogging) {
    console.log(`\n👋 Enhanced Hunter HUD shutting down... (${reason})`);
  }
  
  // Stop HUD if it exists
  if (typeof hud !== 'undefined' && hud && typeof hud.stop === 'function') {
    try {
      hud.stop();
    } catch (error) {
      console.error('⚠️ Error during HUD cleanup:', error.message);
    }
  }
  
  // Graceful exit with timeout
  setTimeout(() => {
    process.exit(exitCode);
  }, 100);
};

/**
 * Enhanced error handler with context
 * @param {Error} error - The error object
 * @param {string} context - Context where error occurred
 */
const handleError = (error, context = 'Unknown') => {
  console.error(`❌ ${context}:`, {
    message: error.message,
    stack: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines of stack
    timestamp: new Date().toISOString()
  });
  
  if (TEST_CONFIG.exitOnError) {
    gracefulShutdown(1, `Error in ${context}`);
  }
};

// Display startup information
if (TEST_CONFIG.enableLogging) {
  console.log('🎯 Starting Enhanced Hunter HUD Test...');
  console.log('📊 Features Implemented:');
  console.log('  ✅ Better Mock Data Integration - Realistic market simulation');
  console.log('  ✅ Enhanced Display Logic - Sophisticated color coding');
  console.log('  ✅ Better Type Integration - Comprehensive type usage');
  console.log('  ✅ Improved Layout - Enhanced three-column layout');
  console.log('  ✅ Real-time Updates - Market simulation with trend persistence');
  console.log('  ✅ Robust Error Handling - Graceful shutdown and error recovery');
  console.log('');
}

// Initialize HUD with enhanced callbacks
let hud;
try {
  hud = new HunterHUD({
    onExit: () => gracefulShutdown(0, 'User requested exit'),
    onConfig: () => {
      console.log('\n⚙️ Configuration panel requested (F1)');
      console.log('📝 TODO: Implement configuration panel in subsequent tasks');
      // Future: Open configuration modal/panel
    }
  });
} catch (error) {
  handleError(error, 'HUD Initialization');
}

// Start the HUD with error handling
try {
  if (hud && typeof hud.start === 'function') {
    hud.start();
    if (TEST_CONFIG.enableLogging) {
      console.log('✅ Hunter HUD started successfully');
    }
  } else {
    throw new Error('HUD instance is invalid or missing start method');
  }
} catch (error) {
  handleError(error, 'HUD Startup');
}

// Enhanced signal handlers
process.on('SIGINT', () => gracefulShutdown(0, 'SIGINT received'));
process.on('SIGTERM', () => gracefulShutdown(0, 'SIGTERM received'));

// Enhanced error handlers with context
process.on('uncaughtException', (error) => {
  handleError(error, 'Uncaught Exception');
});

process.on('unhandledRejection', (reason, promise) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  console.error('❌ Unhandled Promise Rejection:', {
    reason: error.message,
    promise: promise.toString().slice(0, 100) + '...', // Truncate long promises
    timestamp: new Date().toISOString()
  });
  
  if (TEST_CONFIG.exitOnError) {
    gracefulShutdown(1, 'Unhandled Promise Rejection');
  }
});

// Graceful shutdown on process warnings
process.on('warning', (warning) => {
  console.warn('⚠️ Process Warning:', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack?.split('\n').slice(0, 2).join('\n')
  });
});