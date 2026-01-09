/**
 * Titan Emergency API Routes
 * 
 * Endpoints for emergency procedures:
 * - POST /api/emergency/flatten - Close all positions immediately
 * - POST /api/emergency/pause - Pause Scavenger
 * - POST /api/emergency/resume - Resume Scavenger
 * - GET /api/emergency/status - Get emergency brake status
 */

async function emergencyRoutes(fastify, options) {
  const { emergencyBrake, shadowState, databaseManager } = options;

  /**
   * POST /api/emergency/flatten
   * Close all positions immediately with Market orders
   */
  fastify.post('/api/emergency/flatten', {
    schema: {
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string', default: 'manual' },
          confirm: { type: 'boolean' }
        },
        required: ['confirm']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            closedCount: { type: 'number' },
            failedCount: { type: 'number' },
            duration: { type: 'number' },
            results: { type: 'array' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { reason, confirm } = request.body;
    
    if (!confirm) {
      return reply.code(400).send({
        success: false,
        error: 'Confirmation required. Set confirm: true to proceed.'
      });
    }
    
    fastify.log.warn(`Emergency flatten triggered: ${reason}`);
    
    const result = await emergencyBrake.emergencyFlatten(reason);
    
    return result;
  });

  /**
   * POST /api/emergency/pause
   * Pause Scavenger process
   */
  fastify.post('/api/emergency/pause', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    await emergencyBrake.pauseScavenger();
    
    return {
      success: true,
      message: 'Scavenger paused'
    };
  });

  /**
   * POST /api/emergency/resume
   * Resume Scavenger process
   */
  fastify.post('/api/emergency/resume', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    await emergencyBrake.resumeScavenger();
    
    return {
      success: true,
      message: 'Scavenger resumed'
    };
  });

  /**
   * GET /api/emergency/status
   * Get emergency brake status
   */
  fastify.get('/api/emergency/status', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            bybitConnected: { type: 'boolean' },
            scavengerPaused: { type: 'boolean' },
            scavengerPid: { type: ['number', 'null'] },
            emergencyFlattenInProgress: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    return emergencyBrake.getStatus();
  });

  /**
   * POST /api/emergency/circuit-breaker
   * Trigger circuit breaker manually
   */
  fastify.post('/api/emergency/circuit-breaker', {
    schema: {
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string', default: 'manual' },
          confirm: { type: 'boolean' }
        },
        required: ['confirm']
      }
    }
  }, async (request, reply) => {
    const { reason, confirm } = request.body;
    
    if (!confirm) {
      return reply.code(400).send({
        success: false,
        error: 'Confirmation required'
      });
    }
    
    // Flatten all positions
    const flattenResult = await emergencyBrake.emergencyFlatten(`circuit_breaker: ${reason}`);
    
    // Update system state
    if (databaseManager) {
      await databaseManager.run(`
        UPDATE system_state SET
          circuit_breaker = 1,
          master_arm = 0
        WHERE id = 1
      `);
    }
    
    // Log event
    await databaseManager?.run(`
      INSERT INTO system_events (event_type, severity, service, message, context)
      VALUES (?, ?, ?, ?, ?)
    `, [
      'CIRCUIT_BREAKER_TRIGGERED',
      'critical',
      'core',
      `Circuit breaker triggered: ${reason}`,
      JSON.stringify({ reason, flattenResult })
    ]);
    
    return {
      success: true,
      circuitBreakerActive: true,
      masterArmDisabled: true,
      flattenResult
    };
  });

  /**
   * POST /api/emergency/reset-circuit-breaker
   * Reset circuit breaker (requires confirmation)
   */
  fastify.post('/api/emergency/reset-circuit-breaker', {
    schema: {
      body: {
        type: 'object',
        properties: {
          confirm: { type: 'boolean' }
        },
        required: ['confirm']
      }
    }
  }, async (request, reply) => {
    const { confirm } = request.body;
    
    if (!confirm) {
      return reply.code(400).send({
        success: false,
        error: 'Confirmation required'
      });
    }
    
    // Reset circuit breaker (but keep master arm disabled)
    if (databaseManager) {
      await databaseManager.run(`
        UPDATE system_state SET circuit_breaker = 0 WHERE id = 1
      `);
    }
    
    // Log event
    await databaseManager?.run(`
      INSERT INTO system_events (event_type, severity, service, message, context)
      VALUES (?, ?, ?, ?, ?)
    `, [
      'CIRCUIT_BREAKER_RESET',
      'warn',
      'core',
      'Circuit breaker reset manually',
      JSON.stringify({})
    ]);
    
    return {
      success: true,
      circuitBreakerActive: false,
      message: 'Circuit breaker reset. Master Arm still disabled - enable manually.'
    };
  });
}

module.exports = emergencyRoutes;
