/* eslint-disable functional/immutable-data, functional/no-let -- Stateful runtime: mutations architecturally required */
/**
 * NatsPublisher - Publishes events to NATS for other Titan services
 *
 * Used by Titan Brain to trigger AI Quant optimizations and other cross-service events.
 */

import { getNatsClient, NatsClient, TITAN_SUBJECTS } from '@titan/shared';
import { getLogger, StructuredLogger } from '../monitoring/index.js';

export interface AIOptimizationRequest {
  reason: string;
  triggeredBy: string;
  phaseId?: string;
  metrics?: {
    sharpeRatio?: number;
    totalPnL?: number;
    winRate?: number;
  };
  timestamp: number;
}

export class NatsPublisher {
  private nats: NatsClient;
  private logger: StructuredLogger;
  private connected: boolean = false;

  constructor() {
    this.nats = getNatsClient();
    this.logger = getLogger();
  }

  async connect(natsUrl?: string): Promise<void> {
    if (this.connected) return;

    try {
      await this.nats.connect({
        servers: [natsUrl || process.env.NATS_URL || 'nats://localhost:4222'],
        user: process.env.NATS_USER,
        pass: process.env.NATS_PASS,
      });

      this.connected = true;
      this.logger.info('NatsPublisher connected');
    } catch (err) {
      this.logger.error('Failed to connect NatsPublisher', err as Error);
      throw err;
    }
  }

  /**
   * Trigger AI Quant to run an optimization cycle
   *
   * @param request - Details about why optimization was triggered
   */
  async triggerAIOptimization(request: AIOptimizationRequest): Promise<void> {
    if (!this.connected) {
      this.logger.warn('NatsPublisher not connected, cannot trigger AI optimization');
      return;
    }

    try {
      await this.nats.publishEnvelope(TITAN_SUBJECTS.CMD.AI.OPTIMIZE, request, {
        type: TITAN_SUBJECTS.CMD.AI.OPTIMIZE,
        version: 1,
        producer: 'titan-brain',
        // Logic for correlation_id could be improved here if available
      });
      this.logger.info('AI optimization request published', {
        reason: request.reason,
        triggeredBy: request.triggeredBy,
        phaseId: request.phaseId,
      });
    } catch (err) {
      this.logger.error('Failed to publish AI optimization request', err as Error);
    }
  }

  async publishRiskCommand(command: any): Promise<void> {
    if (!this.connected) {
      this.logger.warn('NatsPublisher not connected, cannot publish RISK command');
      return;
    }
    try {
      let subject: string;
      const type = TITAN_SUBJECTS.CMD.RISK.CONTROL; // Default type?

      // Map dynamic action to Canonical Subject
      switch (command.action.toLowerCase()) {
        case 'halt':
          subject = TITAN_SUBJECTS.CMD.SYS.HALT;
          break;
        case 'flatten':
          subject = TITAN_SUBJECTS.CMD.RISK.FLATTEN;
          break;
        case 'arm':
          subject = TITAN_SUBJECTS.CMD.OPERATOR.ARM;
          break;
        case 'disarm':
          subject = TITAN_SUBJECTS.CMD.OPERATOR.DISARM;
          break;
        case 'control':
        default:
          // Fallback or explicit control
          subject = TITAN_SUBJECTS.CMD.RISK.CONTROL;
          this.logger.warn(`Mapping unknown or default risk action to CONTROL: ${command.action}`);
          break;
      }

      await this.nats.publishEnvelope(subject, command, {
        type: subject, // Use specific subject as type for clarity
        version: 1,
        producer: 'titan-brain',
      });
      this.logger.info(`Risk Command Published: ${subject}`, {
        action: command.action,
        actor: command.actor_id,
      });
    } catch (err) {
      this.logger.error('Failed to publish Risk command', err as Error);
      throw err;
    }
  }

  /**
   * Publish an operator intent lifecycle event to NATS.
   * Used by OperatorIntentService for cross-service intent state broadcasting.
   */
  async publishIntentEvent(event: {
    intent_id: string;
    status: string;
    previous_status: string;
    receipt?: Record<string, unknown>;
    timestamp: string;
  }): Promise<void> {
    if (!this.connected) {
      return; // Silent skip — NATS is optional for intent lifecycle
    }

    try {
      await this.nats.publishEnvelope(TITAN_SUBJECTS.EVT.OPERATOR.INTENT, event, {
        type: TITAN_SUBJECTS.EVT.OPERATOR.INTENT,
        version: 1,
        producer: 'titan-brain',
      });
    } catch (err) {
      this.logger.error('Failed to publish intent event', err as Error);
    }
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.nats.close();

      this.connected = false;
    }
  }
}

// Singleton instance

let publisherInstance: NatsPublisher | null = null;

export function getNatsPublisher(): NatsPublisher {
  if (!publisherInstance) {
    publisherInstance = new NatsPublisher();
  }
  return publisherInstance;
}
