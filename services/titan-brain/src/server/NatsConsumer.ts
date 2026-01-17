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
      await this.nats.connect({
        servers: [natsUrl || process.env.NATS_URL || 'nats://localhost:4222'],
      });
      this.logger.info('NATS Consumer connected');
      this.subscribeToTopics();
    } catch (err) {
      this.logger.error('Failed to connect NATS Consumer', err as Error);
      throw err;
    }
  }

  private subscribeToTopics(): void {
    // Subscribe to Execution Reports
    this.nats.subscribe(TitanSubject.EXECUTION_REPORTS, async (data: any, subject) => {
      this.logger.info('Received Execution Report via NATS', {
        orderId: data.orderId || data.order_id,
        symbol: data.symbol,
        status: data.status,
      });

      try {
        // Map incoming NATS data to Brain's ExecutionReport interface
        // Handling both snake_case (from Python/Rust services) and camelCase (Node services)
        const report = {
          type: 'EXECUTION_REPORT', // Event type
          phaseId: data.phaseId || data.phase_id || 'unknown',
          signalId: data.signalId || data.signal_id,
          symbol: data.symbol,
          side: (data.side || 'BUY').toUpperCase(),
          price: Number(data.fillPrice || data.fill_price || data.price || 0),
          qty: Number(data.fillSize || data.fill_size || data.qty || 0),
          timestamp: data.timestamp || Date.now(),
          status: data.status, // FILLED, PARTIALLY_FILLED, etc.
          reason: data.reason,
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
    });

    // TODO: Subscribe to Signals if Brain sends signals via NATS?
    // For now, Phase 1 only specifies Feedback loop migration.

    // Subscribe to Dashboard Updates
    this.nats.subscribe(TitanSubject.DASHBOARD_UPDATES, (data: any, subject) => {
      if (this.webSocketService) {
        // Forward directly to WebSocket clients
        // Assuming data is already in WSMessage format or compatible
        // If data has 'type', use it, otherwise default to 'STATE_UPDATE' or 'DATA'
        if (data.type) {
          // If it's a broadcast method we can use that, or just raw send?
          // WebSocketService has specific broadcast methods.
          // But it also has clients map.
          // Let's expose a generic broadcast method or use the specific ones.
          // For now, let's assume specific types.
          if (data.type === 'SIGNAL') {
            this.webSocketService.broadcastSignal(data.data);
          } else if (data.type === 'TRADE') {
            this.webSocketService.broadcastTrade(data.data);
          } else if (data.type === 'ALERT') {
            this.webSocketService.broadcastAlert(data.level, data.message);
          } else if (data.type === 'PHASE1_UPDATE') {
            this.webSocketService.broadcastPhase1Update(data.tripwires, data.sensorStatus);
          } else if (data.type === 'STATE_UPDATE') {
            // Forward state update to clients
            // Assuming data content matches WSMessage structure for state update
            // We might need to reconstruct it if data is just the payload
            this.webSocketService.broadcastStateUpdate(data);
          }
        }
      }
    });
  }

  async stop(): Promise<void> {
    await this.nats.close();
  }
}
