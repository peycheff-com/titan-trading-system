/**
 * Webhook Routes
 */

import crypto from 'crypto';
import { CONSTANTS } from '../utils/constants.js';
import { ResponseFactory } from '../utils/responseFactory.js';
import {
  handlePrepareSignal,
  handleConfirmSignal,
  handleAbortSignal,
  handleHeartbeatSignal,
  handleUnknownSignal,
} from '../handlers/signalHandlers.js';

/**
 * HMAC signature verification
 */
function verifyHmacSignature(body, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

export function registerWebhookRoutes(fastify, dependencies) {
  const {
    config,
    shadowState,
    replayGuard,
    l2Validator,
    orderManager,
    phaseManager,
    safetyGates,
    configManager,
    limitChaser,
    preparedIntents,
    wsStatus,
    executionStrategies,
    getMasterArm,
    logger,
  } = dependencies;

  /**
   * Webhook endpoint for TradingView alerts
   */
  fastify.post('/webhook', async (request, reply) => {
    const signature = request.headers['x-signature'];
    const source = request.headers['x-source'];
    const sourceIp = request.ip || request.headers['x-forwarded-for'] || 'unknown';

    // Verify x-source header
    // Requirements: Sentinel integration (Phase 3)
    const allowedSources = ['titan_dashboard', 'titan_sentinel'];
    if (!allowedSources.includes(source)) {
      logger.warn({ source, source_ip: sourceIp }, 'Invalid source header');
      return reply.code(401).send({
        error: 'Unauthorized',
        reason: 'Invalid source header'
      });
    }

    // Verify HMAC signature
    if (!verifyHmacSignature(request.body, signature, config.hmacSecret)) {
      logger.warn({ source_ip: sourceIp }, 'Invalid HMAC signature');
      return reply.code(401).send({
        error: 'Unauthorized',
        reason: 'Invalid HMAC signature'
      });
    }

    // Validate timestamp and check for replay attacks
    const replayValidation = await replayGuard.validate(request.body, sourceIp);
    if (!replayValidation.valid) {
      return reply.code(replayValidation.statusCode).send({
        error: replayValidation.error,
        message: replayValidation.message,
        drift_ms: replayValidation.drift_ms,
      });
    }

    const { signal_id, type, symbol } = request.body;

    logger.info({ signal_id, type, symbol, drift_ms: replayValidation.drift_ms }, 'Webhook received');

    // Validate asset whitelist
    const assetValidation = configManager.validateSignal(symbol);
    if (!assetValidation.valid) {
      logger.warn({
        signal_id,
        symbol,
        reason: assetValidation.reason,
      }, 'Signal rejected - Asset disabled');

      return reply.code(403).send({
        error: 'Forbidden',
        reason: assetValidation.reason,
        message: assetValidation.message,
        signal_id,
        symbol,
        timestamp: new Date().toISOString(),
      });
    }

    // Process based on signal type
    switch (type) {
      case CONSTANTS.SIGNAL_TYPES.PREPARE:
        return handlePrepareSignal({
          request,
          shadowState,
          l2Validator,
          orderManager,
          preparedIntents,
          logger,
        });

      case CONSTANTS.SIGNAL_TYPES.CONFIRM:
        return handleConfirmSignal({
          request,
          reply,
          signal_id,
          shadowState,
          preparedIntents,
          phaseManager,
          safetyGates,
          l2Validator,
          configManager,
          masterArm: getMasterArm(),
          wsStatus,
          executionStrategies,
          logger,
        });

      case CONSTANTS.SIGNAL_TYPES.ABORT:
        return handleAbortSignal({
          signal_id,
          shadowState,
          preparedIntents,
          limitChaser,
          logger,
        });

      case CONSTANTS.SIGNAL_TYPES.HEARTBEAT:
        return handleHeartbeatSignal();

      default:
        return handleUnknownSignal({ signal_id, request, shadowState });
    }
  });
}

export { verifyHmacSignature };
