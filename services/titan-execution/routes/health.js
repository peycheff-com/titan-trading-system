/**
 * Health Check Routes
 * Requirements: System Integration 11.1-11.2, 34.4
 * 
 * Provides comprehensive health check endpoints for monitoring service status,
 * component health, and system metrics.
 */

import { ResponseFactory } from '../utils/responseFactory.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import os from 'os';

/**
 * Calculate uptime in human-readable format
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  
  return parts.join(' ');
}

/**
 * Get memory usage in MB
 */
function getMemoryUsage() {
  const used = process.memoryUsage();
  return {
    heapUsed: Math.round(used.heapUsed / 1024 / 1024),
    heapTotal: Math.round(used.heapTotal / 1024 / 1024),
    rss: Math.round(used.rss / 1024 / 1024),
    external: Math.round(used.external / 1024 / 1024),
  };
}

export function registerHealthRoutes(fastify, dependencies) {
  const { 
    fastPathServer, 
    logger,
    databaseManager,
    brokerGateway,
    phaseManager,
    shadowState,
    safetyGates,
    replayGuard,
  } = dependencies;
  
  const startTime = Date.now();
  
  /**
   * Basic health check endpoint
   * GET /health
   * 
   * Returns quick health status for load balancers and monitoring
   */
  fastify.get('/health', asyncHandler(async () => {
    const ipcStatus = fastPathServer ? fastPathServer.getStatus() : { running: false };
    const uptimeSeconds = (Date.now() - startTime) / 1000;
    
    // Quick component checks
    const dbHealthy = databaseManager ? await checkDatabaseHealth(databaseManager) : false;
    const brokerHealthy = brokerGateway ? await checkBrokerHealth(brokerGateway) : false;
    
    // Determine overall status
    const criticalComponentsHealthy = dbHealthy;
    const status = criticalComponentsHealthy ? 'ok' : 'degraded';
    
    return ResponseFactory.success({
      status,
      version: '1.0.0',
      uptime: formatUptime(uptimeSeconds),
      uptimeSeconds: Math.floor(uptimeSeconds),
      timestamp: new Date().toISOString(),
      components: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        broker: brokerHealthy ? 'connected' : 'disconnected',
        fastPathIPC: {
          running: ipcStatus.running,
          socketPath: ipcStatus.socketPath,
          activeConnections: ipcStatus.activeConnections || 0,
        },
      },
    });
  }, logger));
  
  /**
   * Detailed health check endpoint
   * GET /health/detailed
   * 
   * Returns comprehensive health information including all components,
   * metrics, and system resources.
   * Requirements: System Integration 34.4
   */
  fastify.get('/health/detailed', asyncHandler(async () => {
    const ipcStatus = fastPathServer ? fastPathServer.getStatus() : { running: false };
    const uptimeSeconds = (Date.now() - startTime) / 1000;
    const memory = getMemoryUsage();
    
    // Component health checks
    const componentHealth = {
      database: await getDetailedDatabaseHealth(databaseManager),
      broker: await getDetailedBrokerHealth(brokerGateway),
      phaseManager: getPhaseManagerHealth(phaseManager),
      shadowState: getShadowStateHealth(shadowState),
      safetyGates: getSafetyGatesHealth(safetyGates),
      replayGuard: await getReplayGuardHealth(replayGuard),
      fastPathIPC: {
        status: ipcStatus.running ? 'running' : 'stopped',
        socketPath: ipcStatus.socketPath || null,
        activeConnections: ipcStatus.activeConnections || 0,
        messagesProcessed: ipcStatus.messagesProcessed || 0,
      },
    };
    
    // Calculate overall health score
    const healthScore = calculateHealthScore(componentHealth);
    const status = healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'unhealthy';
    
    // Get active positions count
    const activePositions = shadowState ? shadowState.getAllPositions().size : 0;
    
    // Get pending signals count
    const pendingSignals = fastify.preparedIntents ? fastify.preparedIntents.size : 0;
    
    return ResponseFactory.success({
      status,
      healthScore,
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: formatUptime(uptimeSeconds),
      uptimeSeconds: Math.floor(uptimeSeconds),
      timestamp: new Date().toISOString(),
      
      // System metrics
      metrics: {
        uptime: Math.floor(uptimeSeconds),
        memory,
        activePositions,
        pendingSignals,
        cpuUsage: process.cpuUsage(),
      },
      
      // Component health details
      components: componentHealth,
      
      // System info
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        hostname: os.hostname(),
        loadAverage: os.loadavg(),
        freeMemory: Math.round(os.freemem() / 1024 / 1024),
        totalMemory: Math.round(os.totalmem() / 1024 / 1024),
      },
    });
  }, logger));
  
  /**
   * Liveness probe endpoint
   * GET /health/live
   * 
   * Simple endpoint for Kubernetes liveness probes
   */
  fastify.get('/health/live', asyncHandler(async () => {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }, logger));
  
  /**
   * Readiness probe endpoint
   * GET /health/ready
   * 
   * Checks if service is ready to accept traffic
   */
  fastify.get('/health/ready', asyncHandler(async () => {
    const dbHealthy = databaseManager ? await checkDatabaseHealth(databaseManager) : false;
    
    if (!dbHealthy) {
      const error = new Error('Service not ready: database unhealthy');
      error.statusCode = 503;
      throw error;
    }
    
    return { 
      status: 'ready', 
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok',
      },
    };
  }, logger));
}

/**
 * Quick database health check
 */
async function checkDatabaseHealth(databaseManager) {
  try {
    if (!databaseManager || !databaseManager.db) return false;
    const result = databaseManager.db.prepare('SELECT 1 as health').get();
    return result && result.health === 1;
  } catch {
    return false;
  }
}

/**
 * Quick broker health check
 */
async function checkBrokerHealth(brokerGateway) {
  try {
    if (!brokerGateway) return false;
    const adapter = brokerGateway.adapter;
    if (!adapter) return false;
    if (typeof adapter.healthCheck === 'function') {
      const result = await adapter.healthCheck();
      return result && result.success;
    }
    return true; // Assume healthy if no health check method
  } catch {
    return false;
  }
}

/**
 * Detailed database health information
 */
async function getDetailedDatabaseHealth(databaseManager) {
  if (!databaseManager) {
    return { status: 'not_initialized', healthy: false };
  }
  
  try {
    const healthy = await checkDatabaseHealth(databaseManager);
    const stats = databaseManager.db ? {
      open: databaseManager.db.open,
      inTransaction: databaseManager.db.inTransaction,
      memory: databaseManager.db.memory,
    } : null;
    
    return {
      status: healthy ? 'connected' : 'error',
      healthy,
      stats,
    };
  } catch (error) {
    return {
      status: 'error',
      healthy: false,
      error: error.message,
    };
  }
}

/**
 * Detailed broker health information
 */
async function getDetailedBrokerHealth(brokerGateway) {
  if (!brokerGateway) {
    return { status: 'not_initialized', healthy: false };
  }
  
  try {
    const adapter = brokerGateway.adapter;
    const adapterType = adapter ? adapter.constructor.name : 'none';
    
    let healthy = false;
    let healthCheckResult = null;
    
    if (adapter && typeof adapter.healthCheck === 'function') {
      healthCheckResult = await adapter.healthCheck();
      healthy = healthCheckResult && healthCheckResult.success;
    }
    
    return {
      status: healthy ? 'connected' : 'disconnected',
      healthy,
      adapterType,
      healthCheck: healthCheckResult,
    };
  } catch (error) {
    return {
      status: 'error',
      healthy: false,
      error: error.message,
    };
  }
}

/**
 * Phase manager health information
 */
function getPhaseManagerHealth(phaseManager) {
  if (!phaseManager) {
    return { status: 'not_initialized', healthy: false };
  }
  
  try {
    const currentPhase = phaseManager.getCurrentPhase();
    const equity = phaseManager.getLastKnownEquity();
    const phaseConfig = phaseManager.getPhaseConfig();
    
    return {
      status: 'active',
      healthy: true,
      currentPhase,
      equity,
      phaseLabel: phaseConfig?.label || null,
      riskPct: phaseConfig?.riskPct || null,
    };
  } catch (error) {
    return {
      status: 'error',
      healthy: false,
      error: error.message,
    };
  }
}

/**
 * Shadow state health information
 */
function getShadowStateHealth(shadowState) {
  if (!shadowState) {
    return { status: 'not_initialized', healthy: false };
  }
  
  try {
    const positions = shadowState.getAllPositions();
    const positionCount = positions.size;
    
    return {
      status: 'active',
      healthy: true,
      positionCount,
      positions: Array.from(positions.keys()),
    };
  } catch (error) {
    return {
      status: 'error',
      healthy: false,
      error: error.message,
    };
  }
}

/**
 * Safety gates health information
 */
function getSafetyGatesHealth(safetyGates) {
  if (!safetyGates) {
    return { status: 'not_initialized', healthy: false };
  }
  
  try {
    const state = safetyGates.getState ? safetyGates.getState() : {};
    
    return {
      status: 'active',
      healthy: true,
      circuitBreakerTripped: state.circuitBreakerTripped || false,
      dailyDrawdown: state.dailyDrawdown || 0,
      weeklyDrawdown: state.weeklyDrawdown || 0,
    };
  } catch (error) {
    return {
      status: 'error',
      healthy: false,
      error: error.message,
    };
  }
}

/**
 * Replay guard health information
 */
async function getReplayGuardHealth(replayGuard) {
  if (!replayGuard) {
    return { status: 'not_initialized', healthy: false };
  }
  
  try {
    const redisConnected = replayGuard.redis ? await replayGuard.redis.ping() === 'PONG' : false;
    
    return {
      status: redisConnected ? 'redis_connected' : 'memory_mode',
      healthy: true,
      redisConnected,
      cacheSize: replayGuard.cache ? replayGuard.cache.size : 0,
    };
  } catch (error) {
    return {
      status: 'memory_mode',
      healthy: true, // Still healthy in memory mode
      redisConnected: false,
      error: error.message,
    };
  }
}

/**
 * Calculate overall health score (0-100)
 */
function calculateHealthScore(componentHealth) {
  const weights = {
    database: 30,
    broker: 25,
    phaseManager: 15,
    shadowState: 15,
    safetyGates: 10,
    replayGuard: 5,
  };
  
  let score = 0;
  let totalWeight = 0;
  
  for (const [component, weight] of Object.entries(weights)) {
    if (componentHealth[component]) {
      totalWeight += weight;
      if (componentHealth[component].healthy) {
        score += weight;
      }
    }
  }
  
  return totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 0;
}
