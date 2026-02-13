import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { TitanBrain } from '../../engine/TitanBrain.js';
import { ISignalQueue } from '../ISignalQueue.js';
import { Logger } from '../../logging/Logger.js';
import { SecurityAuditLogger } from '../../security/InputValidator.js';
import {
  PhaseRegisterBody,
  PhaseRegisterSchema,
  PhaseSignalSchema,
  RawPhaseSignalBody,
  SignalRequestBody,
  SignalRequestSchema,
} from '../../schemas/apiSchemas.js';
import {
  CorrelationLogger,
  createCorrelationLogger,
  getCorrelationId,
} from '../../middleware/CorrelationMiddleware.js';
import { BrainDecision, IntentSignal, PhaseId } from '../../types/index.js';

import {
  DynamicConfigService,
  ResolvedConfig,
} from '../../services/config/DynamicConfigService.js';
import { RiskConfig } from '../../config/BrainConfig.js';

import { ScavengerValidator } from '../../engine/ScavengerValidator.js';
import { HunterPredicates } from '../../engine/HunterPredicates.js';

export class SignalController {
  private readonly scavengerValidator: ScavengerValidator;
  private readonly hunterPredicates: HunterPredicates;

  constructor(
    private readonly brain: TitanBrain,
    private readonly signalQueue: ISignalQueue | null,
    private readonly logger: Logger,
    private readonly configService: DynamicConfigService,
  ) {
    this.scavengerValidator = new ScavengerValidator();
    this.hunterPredicates = new HunterPredicates();
  }

  /**
   * Register routes for this controller
   */
  registerRoutes(server: FastifyInstance): void {
    server.post('/signal', this.handleSignal.bind(this));

    // Phase webhooks
    server.post('/webhook/phase1', this.handlePhaseSignal.bind(this, 'phase1'));
    server.post('/webhook/phase2', this.handlePhaseSignal.bind(this, 'phase2'));
    server.post('/webhook/phase3', this.handlePhaseSignal.bind(this, 'phase3'));

    // Aliases
    server.post('/webhook/scavenger', this.handlePhaseSignal.bind(this, 'phase1'));
    server.post('/webhook/hunter', this.handlePhaseSignal.bind(this, 'phase2'));
    server.post('/webhook/sentinel', this.handlePhaseSignal.bind(this, 'phase3'));

    server.post('/phases/register', this.handlePhaseRegister.bind(this));
  }

  /**
   * Handle POST /signal - Signal reception endpoint
   */
  async handleSignal(
    request: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply,
  ): Promise<void> {
    const startTime = Date.now();
    const logger = createCorrelationLogger(this.logger, request);

    try {
      logger.info('Signal request received', {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        bodySize: JSON.stringify(request.body).length,
      });

      // Validate and sanitize request body using Zod
      const parseResult = SignalRequestSchema.safeParse(request.body);

      if (!parseResult.success) {
        const errors = parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);

        // Log security audit event
        const clientIp = request.ip || 'unknown';
        SecurityAuditLogger.logValidationFailure(clientIp, '/signal', errors, request.body);

        logger.warn('Signal validation failed', {
          errors,
          clientIp,
        });

        reply.status(400).send({
          error: 'Validation failed',
          details: errors,
          timestamp: Date.now(),
        });
        return;
      }

      const body = parseResult.data;

      // Create intent signal
      const signal: IntentSignal = {
        signalId: body.signalId,
        phaseId: body.phaseId,
        symbol: body.symbol,
        side: body.side,
        requestedSize: body.requestedSize,
        timestamp: body.timestamp ?? Date.now(),
        leverage: body.leverage,
        trap_type: body.trap_type,
      };

      await this.processSignal(signal, logger, reply, startTime);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(
        'Signal processing failed',
        error instanceof Error ? error : new Error(String(error)),
        { processingTime },
      );

      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle POST /webhook/phase{1,2,3} - Phase-specific signal endpoint
   */
  async handlePhaseSignal(
    phaseId: PhaseId,
    request: FastifyRequest<{ Body: RawPhaseSignalBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const startTime = Date.now();
    const logger = createCorrelationLogger(this.logger, request);

    try {
      const parseResult = PhaseSignalSchema.safeParse(request.body);

      if (!parseResult.success) {
        reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
          timestamp: Date.now(),
        });
        return;
      }

      const body = parseResult.data;

      const signal: IntentSignal = {
        signalId: body.signal_id,
        phaseId,
        symbol: body.symbol,
        side: body.direction === 'LONG' ? 'BUY' : 'SELL',
        requestedSize: body.size || 0,
        timestamp: body.timestamp || Date.now(),
        leverage: body.leverage,
        trap_type: body.trap_type,
        entryPrice: body.entry_price,
        stopLossPrice: body.stop_loss,
        targetPrice: body.take_profit?.[0],
        confidence: body.confidence,
        metadata: body.metadata,
      };

      // [Phase 4] Scavenger Validation
      if (phaseId === 'phase1') {
        const validation = this.scavengerValidator.validate(signal);
        if (!validation.valid) {
          logger.warn('Scavenger validation failed', {
            signalId: signal.signalId,
            reason: validation.reason,
          });
          reply.status(422).send({
            error: 'Validation Failed',
            reason: validation.reason,
            timestamp: Date.now(),
          });
          return;
        }
      }

      // [Phase 4] Hunter Validation
      if (phaseId === 'phase2') {
        const validation = this.hunterPredicates.validate(signal);
        if (!validation.valid) {
          logger.warn('Hunter validation failed', {
            signalId: signal.signalId,
            reason: validation.reason,
          });
          reply.status(422).send({
            error: 'Validation Failed',
            reason: validation.reason,
            timestamp: Date.now(),
          });
          return;
        }
      }

      await this.processSignal(signal, logger, reply, startTime, phaseId);
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private async processSignal(
    signal: IntentSignal,
    logger: any,
    reply: FastifyReply,
    startTime: number,
    source?: string,
  ): Promise<void> {
    // eslint-disable-next-line functional/no-let
    let decision: BrainDecision;

    // Resolve Dynamic Configuration
    const riskConfig = this.configService.getConfig<RiskConfig>('risk_limits', signal.signalId, {
      symbol: signal.symbol,
      phase: signal.phaseId,
    });

    if (riskConfig && riskConfig.isCanary) {
      logger.info('🦜 Applying Canary Config', {
        versionId: riskConfig.versionId,
        configName: 'risk_limits',
      });
    }

    // Pass resolved config to Brain (assuming Brain.processSignal can accept overrides)
    // For now, we attach it to metadata so downstream components (RiskGuardian) can use it if they check metadata
    // Ideally TitanBrain should accept a 2nd argument "context" or "options"
    if (riskConfig) {
      // eslint-disable-next-line functional/immutable-data
      signal.metadata = {
        ...signal.metadata,
        _config_version: riskConfig.versionId,
        _model_version: process.env.TITAN_MODEL_VERSION ?? 'unknown',
        _is_canary: riskConfig.isCanary,
        _risk_override: riskConfig.value,
      };
    }

    if (this.signalQueue) {
      // ... existing queue logic ...
      // Note: Enqueuing might lose the context if not serialized in signal.metadata
      const isDuplicate = await this.signalQueue.isDuplicate(signal.signalId);
      if (isDuplicate) {
        logger.warn('Duplicate signal detected', {
          signalId: signal.signalId,
        });
        reply.status(409).send({
          error: 'Duplicate signal ID',
          signalId: signal.signalId,
          timestamp: Date.now(),
        });
        return;
      }

      await this.signalQueue.enqueue(signal);
      logger.debug('Signal enqueued');

      const processedSignal = await this.signalQueue.dequeue();
      if (processedSignal) {
        decision = await this.brain.processSignal(processedSignal);
        await this.signalQueue.markProcessed(processedSignal.signalId);
      } else {
        decision = await this.brain.processSignal(signal);
        logger.warn('Signal processed directly (queue empty)');
      }
    } else {
      decision = await this.brain.processSignal(signal);
    }

    const processingTime = Date.now() - startTime;
    logger.info('Signal processing completed', {
      signalId: signal.signalId,
      approved: decision.approved,
      processingTime,
      reason: decision.reason,
      configVersion: riskConfig?.versionId,
    });

    const response: any = {
      ...decision,
      processingTime,
    };
    // eslint-disable-next-line functional/immutable-data
    if (source) response.source = source;
    // eslint-disable-next-line functional/immutable-data
    if (riskConfig?.isCanary) response.canary = true;

    reply.send(response);
  }

  /**
   * Handle POST /phases/register - Register a phase webhook URL
   */
  async handlePhaseRegister(
    request: FastifyRequest<{ Body: PhaseRegisterBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const parseResult = PhaseRegisterSchema.safeParse(request.body);

      if (!parseResult.success) {
        reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
          timestamp: Date.now(),
        });
        return;
      }

      const body = parseResult.data;
      this.logger.info(`📝 Phase ${body.phaseId} registered webhook: ${body.webhookUrl}`);

      reply.send({
        success: true,
        message: `Phase ${body.phaseId} webhook registered`,
        phaseId: body.phaseId,
        webhookUrl: body.webhookUrl,
        timestamp: Date.now(),
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }
}
