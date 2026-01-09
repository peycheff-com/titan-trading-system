/**
 * Scavenger API Routes
 * 
 * Handles communication between Scavenger (Phase 1) and Execution service
 */

/**
 * Scavenger event types
 */
const SCAVENGER_EVENT_TYPES = {
  SIGNAL: 'signal',
  STATUS: 'status',
  HEARTBEAT: 'heartbeat',
  ERROR: 'error'
};

/**
 * HTTP status codes
 */
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  INTERNAL_SERVER_ERROR: 500
};

/**
 * Response messages
 */
const MESSAGES = {
  SIGNAL_PROCESSED: 'Signal received and acknowledged',
  STATUS_RECEIVED: 'Status update received',
  HEARTBEAT_ACK: 'Heartbeat acknowledged',
  ERROR_RECEIVED: 'Error report received',
  INVALID_EVENT: 'Invalid event: missing type field',
  SAFETY_GATES_DISABLED: 'Safety gates disabled - signal rejected'
};

/**
 * Create standardized success response
 * @param {string} message - Success message
 * @param {Object} data - Additional data
 * @returns {Object} Standardized response
 */
function createSuccessResponse(message, data = {}) {
  return {
    success: true,
    message,
    timestamp: Date.now(),
    ...data
  };
}

/**
 * Standardized error response helper
 * @param {Object} logger - Logger instance
 * @param {Error} error - Error object
 * @param {string} context - Error context
 * @param {string} userMessage - User-friendly message
 * @returns {Object} Standardized error response
 */
function createErrorResponse(logger, error, context, userMessage) {
  logger.error({ error: error.message }, context);
  return {
    success: false,
    error: userMessage,
    timestamp: Date.now()
  };
}

/**
 * Safely broadcast to WebSocket clients
 * @param {Object} wsStatus - WebSocket status manager
 * @param {string} eventType - Event type
 * @param {Object} data - Data to broadcast
 * @param {Object} logger - Logger instance
 */
function safeBroadcast(wsStatus, eventType, data, logger) {
  if (!wsStatus) return;

  try {
    wsStatus.broadcast({
      type: 'scavenger_event',
      event: eventType,
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.warn({ error: error.message }, 'Failed to broadcast WebSocket message');
  }
}

/**
 * Register Scavenger routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} deps - Route dependencies
 */
export function registerScavengerRoutes(fastify, deps) {
  const {
    shadowState,
    brokerGateway,
    phaseManager,
    safetyGates,
    configManager,
    wsStatus,
    logger,
  } = deps;

  /**
   * POST /api/scavenger/events
   * Receive events from Scavenger service
   */
  fastify.post('/api/scavenger/events', async (request, reply) => {
    try {
      const event = request.body;
      
      // Log essential event info to avoid memory issues
      logger.info({ 
        dataKeys: Object.keys(event || {}),
        hasData: !!event
      }, 'Received Scavenger event');

      // Handle different data formats
      let processedEvent;
      if (event && event.type) {
        // Standard event format with type field
        processedEvent = event;
      } else if (event && typeof event === 'object') {
        // Raw data format - determine type based on content
        if (event.binanceHealth !== undefined || event.bybitStatus !== undefined) {
          processedEvent = {
            type: 'status',
            data: event
          };
        } else if (event.symbol && event.side) {
          processedEvent = {
            type: 'signal',
            data: event
          };
        } else {
          processedEvent = {
            type: 'heartbeat',
            data: event
          };
        }
      } else {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          error: 'Invalid event: missing data',
          timestamp: Date.now()
        });
      }

      // Process different event types
      let result;
      switch (processedEvent.type) {
        case SCAVENGER_EVENT_TYPES.SIGNAL:
          result = await handleSignalEvent(processedEvent, deps);
          break;
        case SCAVENGER_EVENT_TYPES.STATUS:
          result = handleStatusEvent(processedEvent, deps);
          break;
        case SCAVENGER_EVENT_TYPES.HEARTBEAT:
          result = handleHeartbeatEvent(processedEvent, deps);
          break;
        case SCAVENGER_EVENT_TYPES.ERROR:
          result = handleErrorEvent(processedEvent, deps);
          break;
        default:
          logger.warn({ eventType: processedEvent.type }, 'Unknown Scavenger event type');
          result = createSuccessResponse('Event received but not processed', {
            eventType: processedEvent.type
          });
      }

      // Broadcast to WebSocket if successful
      if (result.success) {
        safeBroadcast(wsStatus, processedEvent.type, result, logger);
      }

      return reply.send(result);

    } catch (error) {
      logger.error({ error: error.message }, 'Error processing Scavenger event');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        success: false,
        error: 'Internal server error processing event',
        timestamp: Date.now()
      });
    }
  });

  /**
   * GET /api/scavenger/status
   * Get current Scavenger status
   */
  fastify.get('/api/scavenger/status', async (request, reply) => {
    try {
      const status = {
        connected: true,
        phase: phaseManager.getCurrentPhase(),
        equity: phaseManager.getLastKnownEquity(),
        positions: shadowState.getAllPositions().size,
        safetyGates: {
          enabled: safetyGates.isEnabled(),
          status: safetyGates.getStatus()
        },
        timestamp: Date.now()
      };

      return reply.send(createSuccessResponse('Status retrieved successfully', { status }));

    } catch (error) {
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(
        createErrorResponse(logger, error, 'Error getting Scavenger status', 'Failed to get status')
      );
    }
  });
}

/**
 * Handle signal events from Scavenger
 * @param {Object} event - Signal event
 * @param {Object} deps - Dependencies
 * @returns {Object} Result
 */
async function handleSignalEvent(event, deps) {
  const { shadowState, brokerGateway, safetyGates, logger } = deps;

  try {
    const signal = event.data;
    
    if (!signal || !signal.symbol || !signal.side) {
      return createErrorResponse(logger, new Error('Missing required fields'), 
        'Signal validation failed', 'Invalid signal: missing required fields');
    }

    // Check safety gates
    if (!safetyGates.isEnabled()) {
      return createErrorResponse(logger, new Error('Safety gates disabled'), 
        'Safety gates check failed', MESSAGES.SAFETY_GATES_DISABLED);
    }

    // Log signal received
    logger.info({
      symbol: signal.symbol,
      side: signal.side,
      size: signal.size,
      price: signal.price
    }, 'Processing Scavenger signal');

    // For now, just acknowledge the signal
    // Full execution logic would be implemented here
    const signalId = signal.id || `signal_${Date.now()}`;
    
    return createSuccessResponse(MESSAGES.SIGNAL_PROCESSED, { signalId });

  } catch (error) {
    return createErrorResponse(logger, error, 'Error handling signal event', 'Failed to process signal');
  }
}

/**
 * Handle status events from Scavenger
 * @param {Object} event - Status event
 * @param {Object} deps - Dependencies
 * @returns {Object} Result
 */
function handleStatusEvent(event, deps) {
  const { logger } = deps;

  try {
    const status = event.data;
    logger.info({ status }, 'Scavenger status update');

    return createSuccessResponse(MESSAGES.STATUS_RECEIVED);

  } catch (error) {
    return createErrorResponse(logger, error, 'Error handling status event', 'Failed to process status update');
  }
}

/**
 * Handle heartbeat events from Scavenger
 * @param {Object} event - Heartbeat event
 * @param {Object} deps - Dependencies
 * @returns {Object} Result
 */
function handleHeartbeatEvent(event, deps) {
  const { logger } = deps;

  try {
    logger.debug('Scavenger heartbeat received');

    return createSuccessResponse(MESSAGES.HEARTBEAT_ACK);

  } catch (error) {
    return createErrorResponse(logger, error, 'Error handling heartbeat event', 'Failed to process heartbeat');
  }
}

/**
 * Handle error events from Scavenger
 * @param {Object} event - Error event
 * @param {Object} deps - Dependencies
 * @returns {Object} Result
 */
function handleErrorEvent(event, deps) {
  const { logger } = deps;

  try {
    const errorData = event.data;
    
    logger.error({ 
      scavengerError: errorData 
    }, 'Scavenger reported error');

    return createSuccessResponse(MESSAGES.ERROR_RECEIVED);

  } catch (error) {
    return createErrorResponse(logger, error, 'Error handling error event', 'Failed to process error report');
  }
}