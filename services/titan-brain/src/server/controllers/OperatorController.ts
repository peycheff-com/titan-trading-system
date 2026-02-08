/**
 * OperatorController
 *
 * REST endpoints for the Operator Command Plane:
 * - POST /operator/intents             — Submit an OperatorIntent
 * - GET  /operator/intents             — Query intent history
 * - POST /operator/intents/:id/approve — Approve a pending intent
 * - POST /operator/intents/:id/reject  — Reject a pending intent
 * - GET  /operator/state               — Unified OperatorState
 */

import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import type { OperatorIntentRecord, OperatorIntentStatus, OperatorIntentType } from '@titan/shared';
import type { OperatorIntentService, IntentPreviewResult } from '../../services/OperatorIntentService.js';
import type { OperatorStateProjection } from '../../services/OperatorStateProjection.js';
import { Logger } from '../../logging/Logger.js';
import type { AuthMiddleware } from '../../security/AuthMiddleware.js';

interface SubmitIntentBody {
  id: string;
  idempotency_key: string;
  version: number;
  type: string;
  params?: Record<string, unknown>;
  operator_id: string;
  reason: string;
  signature: string;
  ttl_seconds?: number;
  submitted_at: string;
  state_hash?: string;
}

interface IntentsQuery {
  limit?: string;
  status?: string;
  type?: string;
}

interface PreviewIntentBody {
  type: string;
  params?: Record<string, unknown>;
  operator_id: string;
  state_hash: string;
  role?: string;
}

export class OperatorController {
  private readonly logger: Logger;

  constructor(
    private readonly intentService: OperatorIntentService,
    private readonly stateProjection: OperatorStateProjection,
    private readonly authMiddleware: AuthMiddleware,
    logger?: Logger,
  ) {
    this.logger = logger ?? Logger.getInstance('operator-controller');
  }

  registerRoutes(server: FastifyInstance): void {
    server.post<{ Body: SubmitIntentBody }>(
      '/operator/intents',
      { preHandler: this.authMiddleware.verifyToken.bind(this.authMiddleware) },
      this.handleSubmitIntent.bind(this),
    );

    server.get<{ Querystring: IntentsQuery }>(
      '/operator/intents',
      { preHandler: this.authMiddleware.verifyToken.bind(this.authMiddleware) },
      this.handleGetIntents.bind(this),
    );

    server.get(
      '/operator/state',
      { preHandler: this.authMiddleware.verifyToken.bind(this.authMiddleware) },
      this.handleGetState.bind(this),
    );

    server.get<{ Params: { id: string } }>(
      '/operator/intents/:id',
      { preHandler: this.authMiddleware.verifyToken.bind(this.authMiddleware) },
      this.handleGetSingleIntent.bind(this),
    );

    server.post<{ Body: PreviewIntentBody }>(
      '/operator/intents/preview',
      { preHandler: this.authMiddleware.verifyToken.bind(this.authMiddleware) },
      this.handlePreviewIntent.bind(this),
    );

    server.get(
      '/operator/intents/stream',
      { preHandler: this.authMiddleware.verifyToken.bind(this.authMiddleware) },
      this.handleIntentStream.bind(this),
    );

    server.post<{ Params: { id: string }; Body: { approver_id: string } }>(
      '/operator/intents/:id/approve',
      { preHandler: this.authMiddleware.verifyToken.bind(this.authMiddleware) },
      this.handleApproveIntent.bind(this),
    );

    server.post<{ Params: { id: string }; Body: { approver_id: string; reason: string } }>(
      '/operator/intents/:id/reject',
      { preHandler: this.authMiddleware.verifyToken.bind(this.authMiddleware) },
      this.handleRejectIntent.bind(this),
    );

    this.logger.info('OperatorController routes registered');
  }

  // ---------------------------------------------------------------------------
  // POST /operator/intents
  // ---------------------------------------------------------------------------

  private async handleSubmitIntent(
    request: FastifyRequest<{ Body: SubmitIntentBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const result = await this.intentService.submitIntent(request.body);

      switch (result.status) {
        case 'ACCEPTED':
          reply.code(200).send({
            status: 'ACCEPTED',
            intent: this.toIntentResponse(result.intent),
          });
          break;

        case 'IDEMPOTENT_HIT':
          reply.code(200).send({
            status: 'IDEMPOTENT_HIT',
            intent: this.toIntentResponse(result.intent),
          });
          break;

        case 'REJECTED':
          if (result.error === 'VALIDATION_FAILED') {
            reply.code(400).send({
              error: 'VALIDATION_FAILED',
              details: result.validationErrors ?? [],
            });
          } else if (result.error === 'SIGNATURE_INVALID') {
            reply.code(403).send({
              error: 'SIGNATURE_INVALID',
            });
          } else if (result.error === 'STATE_CONFLICT') {
            const currentHash = result.intent.receipt?.error?.split('current=')[1] ?? '';
            reply.code(409).send({
              error: 'STATE_CONFLICT',
              expected_hash: result.intent.state_hash,
              current_hash: currentHash,
            });
          } else {
            reply.code(200).send({
              status: 'REJECTED',
              intent: this.toIntentResponse(result.intent),
            });
          }
          break;
      }
    } catch (error) {
      this.logger.error('Error submitting intent', error as Error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  // ---------------------------------------------------------------------------
  // GET /operator/intents
  // ---------------------------------------------------------------------------

  private async handleGetIntents(
    request: FastifyRequest<{ Querystring: IntentsQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { limit, status, type } = request.query;
      const result = this.intentService.getIntents({
        limit: limit ? parseInt(limit, 10) : undefined,
        status: status as OperatorIntentStatus | undefined,
        type: type as OperatorIntentType | undefined,
      });

      reply.code(200).send({
        intents: result.intents.map((i) => this.toIntentResponse(i)),
        total: result.total,
      });
    } catch (error) {
      this.logger.error('Error querying intents', error as Error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  // ---------------------------------------------------------------------------
  // GET /operator/state
  // ---------------------------------------------------------------------------

  private async handleGetState(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const state = this.stateProjection.getState();
      reply.code(200).send(state);
    } catch (error) {
      this.logger.error('Error getting operator state', error as Error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  // ---------------------------------------------------------------------------
  // POST /operator/intents/:id/approve
  // ---------------------------------------------------------------------------

  private async handleApproveIntent(
    request: FastifyRequest<{ Params: { id: string }; Body: { approver_id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { id } = request.params;
      const { approver_id } = request.body ?? {};

      if (!approver_id) {
        reply.code(400).send({ error: 'approver_id is required' });
        return;
      }

      const result = await this.intentService.approveIntent(id, approver_id);

      if (result.success) {
        reply.code(200).send({
          status: 'APPROVED',
          intent: result.intent ? this.toIntentResponse(result.intent) : null,
        });
      } else {
        reply.code(result.error === 'INTENT_NOT_FOUND' ? 404 : 409).send({
          error: result.error,
          intent: result.intent ? this.toIntentResponse(result.intent) : null,
        });
      }
    } catch (error) {
      this.logger.error('Error approving intent', error as Error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  // ---------------------------------------------------------------------------
  // POST /operator/intents/:id/reject
  // ---------------------------------------------------------------------------

  private async handleRejectIntent(
    request: FastifyRequest<{ Params: { id: string }; Body: { approver_id: string; reason: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { id } = request.params;
      const { approver_id, reason } = request.body ?? {};

      if (!approver_id || !reason) {
        reply.code(400).send({ error: 'approver_id and reason are required' });
        return;
      }

      const result = this.intentService.rejectIntent(id, approver_id, reason);

      if (result.success) {
        reply.code(200).send({
          status: 'REJECTED',
          intent: result.intent ? this.toIntentResponse(result.intent) : null,
        });
      } else {
        reply.code(result.error === 'INTENT_NOT_FOUND' ? 404 : 409).send({
          error: result.error,
          intent: result.intent ? this.toIntentResponse(result.intent) : null,
        });
      }
    } catch (error) {
      this.logger.error('Error rejecting intent', error as Error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  // ---------------------------------------------------------------------------
  // GET /operator/intents/:id
  // ---------------------------------------------------------------------------

  private async handleGetSingleIntent(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const intent = this.intentService.getIntent(request.params.id);
      if (!intent) {
        reply.code(404).send({ error: 'INTENT_NOT_FOUND' });
        return;
      }
      reply.code(200).send({ intent: this.toIntentResponse(intent) });
    } catch (error) {
      this.logger.error('Error getting intent', error as Error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  // ---------------------------------------------------------------------------
  // POST /operator/intents/preview
  // ---------------------------------------------------------------------------

  private async handlePreviewIntent(
    request: FastifyRequest<{ Body: PreviewIntentBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { type, params, operator_id, state_hash, role } = request.body;

      if (!type || !operator_id || !state_hash) {
        reply.code(400).send({
          error: 'VALIDATION_FAILED',
          details: ['type, operator_id, and state_hash are required'],
        });
        return;
      }

      const preview: IntentPreviewResult = this.intentService.previewIntent({
        type: type as OperatorIntentType,
        params: params ?? {},
        operator_id,
        state_hash,
        role,
      });

      if (!preview.state_hash_valid) {
        reply.code(409).send({
          error: 'STATE_HASH_STALE',
          expected: state_hash,
          current: preview.current_state_hash,
          preview,
        });
        return;
      }

      reply.code(200).send(preview);
    } catch (error) {
      this.logger.error('Error previewing intent', error as Error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  // ---------------------------------------------------------------------------
  // GET /operator/intents/stream (SSE)
  // ---------------------------------------------------------------------------

  private async handleIntentStream(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Monotonic event counter for this connection
    let eventSeq = 0;

    // Support Last-Event-ID reconnection
    const lastEventId = (request.headers['last-event-id'] as string) || '';
    if (lastEventId) {
      // Replay current intent state on reconnect so client catches up
      const missedSeq = parseInt(lastEventId, 10);
      if (!isNaN(missedSeq)) {
        const { intents } = this.intentService.getIntents({ limit: 100 });
        // Send catch-up batch (reverse for chronological order)
        const catchUp = intents.slice().reverse();
        for (const intent of catchUp) {
          eventSeq++;
          try {
            reply.raw.write(
              `id: ${eventSeq}\nevent: intent_catchup\ndata: ${JSON.stringify(this.toIntentResponse(intent))}\n\n`,
            );
          } catch {
            return;
          }
        }
      }
    }

    // Send initial connection event
    eventSeq++;
    reply.raw.write(
      `id: ${eventSeq}\nevent: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString(), reconnected: !!lastEventId })}\n\n`,
    );

    // Subscribe to intent updates
    const onUpdate = (event: unknown) => {
      try {
        eventSeq++;
        reply.raw.write(
          `id: ${eventSeq}\nevent: intent_update\ndata: ${JSON.stringify(event)}\n\n`,
        );
      } catch {
        // Connection closed, will clean up below
      }
    };

    this.intentService.on('intent:updated', onUpdate);

    // Heartbeat every 15 seconds
    const heartbeat = setInterval(() => {
      try {
        eventSeq++;
        reply.raw.write(
          `id: ${eventSeq}\nevent: heartbeat\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`,
        );
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    // Cleanup on disconnect
    reply.raw.on('close', () => {
      this.intentService.removeListener('intent:updated', onUpdate);
      clearInterval(heartbeat);
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private toIntentResponse(intent: OperatorIntentRecord) {
    return {
      id: intent.id,
      idempotency_key: intent.idempotency_key,
      version: intent.version,
      type: intent.type,
      params: intent.params,
      operator_id: intent.operator_id,
      reason: intent.reason,
      status: intent.status,
      submitted_at: intent.submitted_at,
      resolved_at: intent.resolved_at ?? null,
      receipt: intent.receipt ?? null,
    };
  }
}
