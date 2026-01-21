import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TitanBrain } from "../../engine/TitanBrain.js";
import { ISignalQueue } from "../ISignalQueue.js";
import { Logger } from "../../logging/Logger.js";
import { SecurityAuditLogger } from "../../security/InputValidator.js";
import {
    PhaseRegisterBody,
    PhaseRegisterSchema,
    PhaseSignalSchema,
    RawPhaseSignalBody,
    SignalRequestBody,
    SignalRequestSchema,
} from "../../schemas/apiSchemas.js";
import {
    CorrelationLogger,
    createCorrelationLogger,
    getCorrelationId,
} from "../../middleware/CorrelationMiddleware.js";
import { BrainDecision, IntentSignal, PhaseId } from "../../types/index.js";

export class SignalController {
    constructor(
        private readonly brain: TitanBrain,
        private readonly signalQueue: ISignalQueue | null,
        private readonly logger: Logger,
    ) {}

    /**
     * Register routes for this controller
     */
    registerRoutes(server: FastifyInstance): void {
        server.post("/signal", this.handleSignal.bind(this));

        // Phase webhooks
        server.post(
            "/webhook/phase1",
            this.handlePhaseSignal.bind(this, "phase1"),
        );
        server.post(
            "/webhook/phase2",
            this.handlePhaseSignal.bind(this, "phase2"),
        );
        server.post(
            "/webhook/phase3",
            this.handlePhaseSignal.bind(this, "phase3"),
        );

        // Aliases
        server.post(
            "/webhook/scavenger",
            this.handlePhaseSignal.bind(this, "phase1"),
        );
        server.post(
            "/webhook/hunter",
            this.handlePhaseSignal.bind(this, "phase2"),
        );
        server.post(
            "/webhook/sentinel",
            this.handlePhaseSignal.bind(this, "phase3"),
        );

        server.post("/phases/register", this.handlePhaseRegister.bind(this));
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
            logger.info("Signal request received", {
                ip: request.ip,
                userAgent: request.headers["user-agent"],
                bodySize: JSON.stringify(request.body).length,
            });

            // Validate and sanitize request body using Zod
            const parseResult = SignalRequestSchema.safeParse(request.body);

            if (!parseResult.success) {
                const errors = parseResult.error.issues.map((e) =>
                    `${e.path.join(".")}: ${e.message}`
                );

                // Log security audit event
                const clientIp = request.ip || "unknown";
                SecurityAuditLogger.logValidationFailure(
                    clientIp,
                    "/signal",
                    errors,
                    request.body,
                );

                logger.warn("Signal validation failed", {
                    errors,
                    clientIp,
                });

                reply.status(400).send({
                    error: "Validation failed",
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
            };

            await this.processSignal(signal, logger, reply, startTime);
        } catch (error) {
            const processingTime = Date.now() - startTime;
            logger.error(
                "Signal processing failed",
                error instanceof Error ? error : new Error(String(error)),
                { processingTime },
            );

            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
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
                    error: "Validation failed",
                    details: parseResult.error.issues.map((e) =>
                        `${e.path.join(".")}: ${e.message}`
                    ),
                    timestamp: Date.now(),
                });
                return;
            }

            const body = parseResult.data;

            const signal: IntentSignal = {
                signalId: body.signal_id,
                phaseId,
                symbol: body.symbol,
                side: body.direction === "LONG" ? "BUY" : "SELL",
                requestedSize: body.size || 0,
                timestamp: body.timestamp || Date.now(),
                leverage: body.leverage,
            };

            await this.processSignal(signal, logger, reply, startTime, phaseId);
        } catch (error) {
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Common signal processing logic
     */
    private async processSignal(
        signal: IntentSignal,
        logger: any,
        reply: FastifyReply,
        startTime: number,
        source?: string,
    ): Promise<void> {
        let decision: BrainDecision;

        if (this.signalQueue) {
            const isDuplicate = await this.signalQueue.isDuplicate(
                signal.signalId,
            );
            if (isDuplicate) {
                logger.warn("Duplicate signal detected", {
                    signalId: signal.signalId,
                });
                reply.status(409).send({
                    error: "Duplicate signal ID",
                    signalId: signal.signalId,
                    timestamp: Date.now(),
                });
                return;
            }

            await this.signalQueue.enqueue(signal);
            logger.debug("Signal enqueued");

            const processedSignal = await this.signalQueue.dequeue();
            if (processedSignal) {
                decision = await this.brain.processSignal(processedSignal);
                await this.signalQueue.markProcessed(processedSignal.signalId);
            } else {
                decision = await this.brain.processSignal(signal);
                logger.warn("Signal processed directly (queue empty)");
            }
        } else {
            decision = await this.brain.processSignal(signal);
        }

        const processingTime = Date.now() - startTime;
        logger.info("Signal processing completed", {
            signalId: signal.signalId,
            approved: decision.approved,
            processingTime,
            reason: decision.reason,
        });

        const response: any = {
            ...decision,
            processingTime,
        };
        if (source) response.source = source;

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
                    error: "Validation failed",
                    details: parseResult.error.issues.map((e) =>
                        `${e.path.join(".")}: ${e.message}`
                    ),
                    timestamp: Date.now(),
                });
                return;
            }

            const body = parseResult.data;
            console.log(
                `📝 Phase ${body.phaseId} registered webhook: ${body.webhookUrl}`,
            );

            reply.send({
                success: true,
                message: `Phase ${body.phaseId} webhook registered`,
                phaseId: body.phaseId,
                webhookUrl: body.webhookUrl,
                timestamp: Date.now(),
            });
        } catch (error) {
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }
}
