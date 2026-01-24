/**
 * NatsPublisher - Publishes events to NATS for other Titan services
 *
 * Used by Titan Brain to trigger AI Quant optimizations and other cross-service events.
 */

import { getNatsClient, NatsClient, TitanSubject } from '@titan/shared';
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
      await this.nats.publishEnvelope(TitanSubject.AI_OPTIMIZATION_REQUESTS, request, {
        type: 'titan.control.ai.optimize.v1',
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
