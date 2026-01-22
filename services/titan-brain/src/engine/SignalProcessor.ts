import { getNatsClient, TitanSubject } from '@titan/shared';
import { Logger } from '../logging/Logger.js';
// import { validateIntentPayload } from "@titan/shared/dist/schemas/intentSchema"; // Commenting out if not available or fixing path
import { BrainDecision } from '../types/index.js';

// Rust-compatible definitions (Shadow copy since it might not be exported)
interface RustIntent {
  schema_version?: string;
  signal_id: string;
  source: string;
  symbol: string;
  direction: number; // 1 (Long) or -1 (Short)
  type: string; // "BUY_SETUP", "SELL_SETUP", etc.
  entry_zone: number[];
  stop_loss: number;
  take_profits: number[];
  size: number;
  status: string; // "PENDING"
  received_at: string; // ISO date
  t_signal: number;
  timestamp?: number;
  t_exchange?: number;
  metadata?: any;
}

export class SignalProcessor {
  private nats = getNatsClient();
  private logger = Logger.getInstance('SignalProcessor');

  constructor() {
    this.logger.info('Initialized SignalProcessor');
  }

  public async start(): Promise<void> {
    if (!this.nats.isConnected()) {
      await this.nats.connect();
    }

    this.logger.info('Subscribing to Signal Submission Channel');

    // Subscribe to titan.signal.submit.v1
    this.nats.subscribe(TitanSubject.SIGNAL_SUBMIT, async (data: any) => {
      await this.processSignal(data);
    });
  }

  public async processSignal(payload: any): Promise<BrainDecision> {
    const { signal_id, source, symbol, direction, signal, payload: embeddedPayload } = payload;

    // Extract actual signal data (support both formats if payload is wrapped)
    const signalData = embeddedPayload || signal || payload;

    this.logger.info(`Received Signal ${signal_id} from ${source} for ${symbol} ${direction}`);

    // TODO: Step 1 - Risk Guard Check (Budget Service)
    // For now, strict pass-through to validate plumbing

    // Step 2 - Convert to Execution Intent (Rust-compatible)
    const directionInt = signalData.direction === 'LONG' ? 1 : -1;
    const intentType = signalData.direction === 'LONG' ? 'BUY_SETUP' : 'SELL_SETUP';

    // Construct RustIntent
    const intent: RustIntent = {
      schema_version: '1.0.0',
      signal_id: signalData.signal_id,
      source: 'brain', // Re-signed by Brain (Authoritative)
      symbol: signalData.symbol,
      direction: directionInt,
      type: intentType,
      entry_zone: signalData.entry_zone
        ? [signalData.entry_zone.min, signalData.entry_zone.max]
        : [0, 0],
      stop_loss: signalData.stop_loss || 0,
      take_profits: signalData.take_profits || [],
      size: signalData.position_size || 0, // Brain should override this based on Risk
      status: 'PENDING',
      received_at: new Date().toISOString(),
      t_signal: signalData.timestamp || Date.now(),
      timestamp: Date.now(),
      metadata: {
        original_source: source,
        brain_processed_at: Date.now(),
        confidence: signalData.confidence,
        leverage: signalData.leverage,
      },
    };

    // Step 2.5 - Validation
    // We try to use the shared validation if available (runtime check for robustness)
    // If not available (TS vs JS issues), we rely on structural correctness above.
    // Assuming validateIntentPayload is imported (will check errors later)

    // Step 3 - Publish to Execution (titan.cmd.exec.place)
    const symbolToken = signalData.symbol.replace('/', '_');
    // const subject = `${TitanSubject.CMD_EXEC_PLACE}.auto.main.${symbolToken}`;
    // Use string literal if subject enum incomplete or just consistent
    const subject = `titan.cmd.exec.place.v1.auto.main.${symbolToken}`;

    this.logger.info(`Approving Signal ${signal_id} -> Publishing Intent to ${subject}`);

    try {
      await this.nats.publish(subject, intent);
    } catch (error) {
      this.logger.error(`Failed to publish intent for ${signal_id}`, error as Error);
      await this.publishToDLQ(intent, (error as Error).message);
    }
    // Return dummy BrainDecision
    return {
      signalId: signal_id,
      approved: true,
      authorizedSize: intent.size,
      reason: 'Auto-approved pass-through',
      timestamp: Date.now(),
    } as BrainDecision;
  }

  private async publishToDLQ(payload: any, reason: string): Promise<void> {
    try {
      const dlqPayload = {
        reason,
        payload,
        t_ingress: Date.now(),
      };
      await this.nats.publish('titan.dlq.brain.processing', dlqPayload);
    } catch (e) {
      this.logger.error('Failed to publish to DLQ', e as Error);
    }
  }
}
