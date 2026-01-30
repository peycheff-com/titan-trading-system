import { ExecutionReportSchema, getNatsClient, NatsClient, TitanSubject } from '@titan/shared';
import { TitanBrain } from '../engine/TitanBrain.js';
import { getLogger, StructuredLogger } from '../monitoring/index.js';
import { WebSocketService } from './WebSocketService.js';

export class NatsConsumer {
  private nats: NatsClient;
  private brain: TitanBrain;
  private logger: StructuredLogger;
  private webSocketService: WebSocketService | null = null;

  constructor(brain: TitanBrain, webSocketService?: WebSocketService) {
    this.brain = brain;
    this.webSocketService = webSocketService || null;
    this.nats = getNatsClient();
    this.logger = getLogger();
  }

  setWebSocketService(wsService: WebSocketService) {
    this.webSocketService = wsService;
  }

  async start(natsUrl?: string): Promise<void> {
    try {
      if (!this.nats.isConnected()) {
        await this.nats.connect({
          servers: [natsUrl || process.env.NATS_URL || 'nats://localhost:4222'],
        });
        this.logger.info('NATS Consumer connected (New Connection)');
      } else {
        this.logger.info('NATS Consumer reused existing connection');
      }
      this.subscribeToTopics();
    } catch (err) {
      this.logger.error('Failed to connect NATS Consumer', err as Error);
      throw err;
    }
  }

  private subscribeToTopics(): void {
    // Subscribe to Execution Reports (General)
    this.nats.subscribe(
      TitanSubject.EXECUTION_REPORTS, // Uses remapped legacy key for now, pointing to titan.evt.exec.report.v1
      async (data: any, subject) => {
        this.handleExecutionReport(data);
      },
    );

    // Subscribe to Execution Fills (Wildcard for venues/symbols)
    // Topic: titan.evt.exec.fill.v1.{venue}.{account}.{symbol}
    this.nats.subscribe(
      TitanSubject.EXECUTION_FILL + '.*', // Use suffix wildcard
      async (data: any, subject) => {
        this.handleExecutionReport(data);
      },
      'BRAIN_RISK', // Durable consumer name as per Manifest
    );

    // Subscribe to Dashboard Updates
    this.nats.subscribe(TitanSubject.DASHBOARD_UPDATES, (data: any, subject) => {
      if (this.webSocketService) {
        if (data.type) {
          if (data.type === 'SIGNAL') {
            this.webSocketService.broadcastSignal(data.data);
          } else if (data.type === 'TRADE') {
            this.webSocketService.broadcastTrade(data.data);
          } else if (data.type === 'ALERT') {
            this.webSocketService.broadcastAlert(data.level, data.message);
          } else if (data.type === 'PHASE1_UPDATE') {
            this.webSocketService.broadcastPhase1Update(data.tripwires, data.sensorStatus);
          } else if (data.type === 'STATE_UPDATE') {
            this.webSocketService.broadcastStateUpdate(data);
          }
        }
      }
    });

    // Subscribe to PowerLaw Updates
    this.nats.subscribe(TitanSubject.EVT_REGIME_UPDATE, async (data: any, subject) => {
      try {
        // Validate structure roughly
        if (data.symbol && data.tailExponent) {
          // Relaxed check
          await this.brain.handlePowerLawUpdate({
            symbol: data.symbol,
            tailExponent: Number(data.tailExponent),
            tailConfidence: Number(data.tailConfidence),
            exceedanceProbability: Number(data.exceedanceProbability),
            volatilityCluster: {
              state: data.volatilityCluster.state,
              persistence: Number(data.volatilityCluster.persistence),
              sigma: Number(data.volatilityCluster.sigma || 0),
            },
            timestamp: data.timestamp || Date.now(),
          });
        }
      } catch (err) {
        this.logger.error('Error handling PowerLaw update', err as Error);
      }
    });

    // Subscribe to Market Data
    this.nats.subscribe(
      TitanSubject.MARKET_DATA,
      async (data: any, subject) => {
        try {
          if (data.symbol && data.price) {
            this.brain.handleMarketData({
              symbol: data.symbol,
              price: Number(data.price),
              timestamp: data.timestamp || Date.now(),
            });
          }
        } catch (err) {
          this.logger.error('Error handling Market Data', err as Error);
        }
      },
      // No durable name -> ephemeral consumer for real-time data
    );

    // Subscribe to Phase Posture (All Phases)
    this.nats.subscribe(`${TitanSubject.EVT_PHASE_POSTURE}.*`, async (data: any, subject) => {
      if (this.webSocketService) {
        this.webSocketService.broadcastPhasePosture(data);
      }
    });

    // Subscribe to Phase Diagnostics (All Phases)
    this.nats.subscribe(`${TitanSubject.EVT_PHASE_DIAGNOSTICS}.*`, async (data: any, subject) => {
      if (this.webSocketService) {
        this.webSocketService.broadcastPhaseDiagnostics(data);
      }
    });

    // Subscribe to AI Optimization Proposals (The Synapse)
    this.nats.subscribe(
      TitanSubject.CMD_AI_OPTIMIZE_PROPOSAL,
      async (data: any, subject) => {
        try {
          // Unwrap payload if needed (envelope)
          let payload = data;
          if (data && typeof data === 'object' && 'payload' in data && 'type' in data) {
            payload = data.payload;
          }
          await this.brain.handleAIProposal(payload);
        } catch (err) {
          this.logger.error('Error handling AI Proposal', err as Error);
        }
      },
      'BRAIN_GOVERNANCE', // Durable consumer for governance/proposals
    );

    // Subscribe to System Halt Commands (GAP-02)
    // Payload: { state: "OPEN" | "SOFT_HALT" | "HARD_HALT", ... }
    this.nats.subscribe(
      'titan.cmd.sys.halt',
      async (data: any, subject) => {
        try {
          const payload = this.extractPayload(data);
          const state = payload.state;
          const reason = payload.reason || 'NATS Command';

          // Fallback for legacy { active: true } payload
          if (!state && payload.active !== undefined) {
            if (payload.active) {
              await this.brain.handleSystemState('HARD_HALT', reason);
            } else {
              await this.brain.handleSystemState('OPEN', reason);
            }
            return;
          }

          if (state) {
            await this.brain.handleSystemState(state, reason);
          }
        } catch (err) {
          this.logger.error('Error handling System Halt command', err as Error);
        }
      },
      'BRAIN_SYS_CONTROL', // Durable consumer for system control
    );
  }

  // Helper to extract payload from potential envelope
  private extractPayload(data: any): any {
    if (data && typeof data === 'object' && 'payload' in data && 'type' in data) {
      return data.payload;
    }
    return data;
  }

  private async handleExecutionReport(data: any): Promise<void> {
    // Dual Read Strategy: unwraps Envelope if present

    let payload = data;
    if (data && typeof data === 'object' && 'payload' in data && 'type' in data) {
      payload = data.payload;
    }

    this.logger.info('Received Execution Report via NATS', {
      orderId: payload.orderId || payload.order_id,
      symbol: payload.symbol,
      status: payload.status,
    });

    try {
      // Map incoming NATS data to Brain's ExecutionReport interface
      // Handling both snake_case (from Python/Rust services) and camelCase (Node services)
      // ENFORCED: Using Zod Schema for validation and normalization
      const report = ExecutionReportSchema.parse(payload);

      // Forward to Brain engine
      await this.brain.handleExecutionReport(report);

      // Also notify WebSocket clients of the fill
      if (this.webSocketService) {
        this.webSocketService.broadcastTrade({
          symbol: report.symbol,
          side: report.side,
          price: report.price,
          size: report.qty,
          timestamp: report.timestamp,
          phaseId: report.phaseId,
        });
      }
    } catch (err) {
      this.logger.error('Error handling Execution Report via NATS', err as Error);
      throw err; // Propagate error to trigger Nack/Redelivery
    }
  }

  async stop(): Promise<void> {
    await this.nats.close();
  }
}
