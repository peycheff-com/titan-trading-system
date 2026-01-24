import { getNatsClient, NatsClient, TitanSubject } from '@titan/shared';
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
      const report = {
        type: 'EXECUTION_REPORT', // Event type
        phaseId: payload.phaseId || payload.phase_id || 'unknown',
        signalId: payload.signalId || payload.signal_id,
        symbol: payload.symbol,
        side: (payload.side || 'BUY').toUpperCase(),
        price: Number(payload.fillPrice || payload.fill_price || payload.price || 0),
        qty: Number(payload.fillSize || payload.fill_size || payload.qty || 0),
        timestamp: payload.timestamp || Date.now(),
        status: payload.status, // FILLED, PARTIALLY_FILLED, etc.
        reason: payload.reason,
        // Map fillId from upstream (execution_id in exchange or trade_id)
        fillId: payload.fillId || payload.fill_id || payload.trade_id || payload.execution_id,
        executionId: payload.executionId || payload.execution_id, // Keep redundant executionId for now if used elsewhere
      };

      // Forward to Brain engine
      // Note: Brain.handleExecutionReport takes 'ExecutionReport' which might differ slightly from the webhook body
      // We cast to any here to match the method signature if strictly typed, or rely on structural typing.
      await this.brain.handleExecutionReport(report as any);

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
    }
  }

  async stop(): Promise<void> {
    await this.nats.close();
  }
}
