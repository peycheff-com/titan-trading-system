import { logger } from '../utils/Logger.js';
import { PositionManager } from '../engine/PositionManager.js';
import { EventStore } from '../persistence/EventStore.js';
import { PositionRepository } from '../db/repositories/PositionRepository.js';
import { TruthRepository } from '../db/repositories/TruthRepository.js';
import {
  ExecutionEngineClient,
  ExecutionPosition,
  MismatchDetail,
  Position,
  ReconciliationConfig,
  ReconciliationReport,
  ReconciliationRun,
  ReconciliationType,
  TruthConfidence,
} from '../types/index.js';
import { EventType } from '../events/EventTypes.js';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

export class ReconciliationService {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly config: ReconciliationConfig;
  private executionClient: ExecutionEngineClient | null = null;
  private readonly positionManager: PositionManager;
  private readonly positionRepository?: PositionRepository;
  private readonly eventStore?: EventStore;
  private readonly truthRepository?: TruthRepository;
  private driftListener: ((hasDrift: boolean) => void) | null = null;

  // Confidence tracking
  private currentConfidence: number = 1.0;

  constructor(
    config: ReconciliationConfig,
    executionClient: ExecutionEngineClient | null,
    positionManager: PositionManager,
    positionRepository?: PositionRepository,
    eventStore?: EventStore,
    truthRepository?: TruthRepository,
  ) {
    this.config = config;
    this.executionClient = executionClient;
    this.positionManager = positionManager;
    this.positionRepository = positionRepository;
    this.eventStore = eventStore;
    this.truthRepository = truthRepository;
  }

  setExecutionEngine(client: ExecutionEngineClient): void {
    this.executionClient = client;
  }

  setDriftListener(listener: (hasDrift: boolean) => void): void {
    this.driftListener = listener;
  }

  start(): void {
    if (this.intervalId) return;
    logger.info('🔄 Starting Reconciliation Service...');
    this.intervalId = setInterval(
      () => this.runScheduledReconciliation(),
      this.config.intervalMs,
    ) as unknown as NodeJS.Timeout;
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('🛑 Reconciliation Service stopped');
    }
  }

  private async runScheduledReconciliation(): Promise<void> {
    try {
      await this.reconcileAll();
    } catch (error) {
      logger.error('Scheduled reconciliation failed', error as Error);
    }
  }

  async reconcileAll(): Promise<ReconciliationReport[]> {
    logger.info('🔎 Running multi-exchange reconciliation...');
    const reports: ReconciliationReport[] = [];
    for (const exchange of this.config.exchanges) {
      const report = await this.reconcile(exchange);
      reports.push(report);
    }

    // Reconcile Brain vs Database
    if (this.positionRepository) {
      const dbReport = await this.reconcileBrainVsDb();
      reports.push(dbReport);
    }

    // Notify listener regardless of result (true for drift, false for clean)
    if (this.driftListener) {
      const hasMismatch = reports.some((r) => r.status === 'MISMATCH');
      const hasError = reports.some((r) => r.status === 'ERROR');

      if (hasMismatch) {
        this.driftListener(true);
      } else if (!hasError) {
        // Only recover confidence if we successfully verified everything and found no mismatches
        this.driftListener(false);
      }
    }

    return reports;
  }

  private async persistRun(run: ReconciliationRun, type: 'START' | 'END'): Promise<void> {
    if (!this.truthRepository) return;
    try {
      await this.truthRepository.recordRun(run);
    } catch (err) {
      logger.error(`Failed to persist run (${type})`, err as Error);
    }
  }

  private async persistEvidence(
    scope: string,
    source: string,
    data: any,
    runId?: number,
  ): Promise<void> {
    if (!this.truthRepository || !runId) return;
    try {
      const json = JSON.stringify(data);
      const hash = createHash('sha256').update(json).digest('hex');
      await this.truthRepository.persistEvidence({
        runId,
        scope,
        source,
        data,
        hash,
        timestamp: Date.now(),
      });
    } catch (err) {
      logger.error('Failed to persist evidence', err as Error);
    }
  }

  private async computeConfidence(scope: string, hasMismatch: boolean): Promise<void> {
    if (!this.truthRepository) {
      // Fallback to local confidence if no repo
      if (hasMismatch) {
        this.currentConfidence = Math.max(0, this.currentConfidence - 0.2);
      } else {
        this.currentConfidence = Math.min(1.0, this.currentConfidence + 0.05);
      }
      return;
    }

    try {
      // Get current confidence
      let confidence = await this.truthRepository.getConfidence(scope);
      if (!confidence) {
        confidence = {
          scope,
          score: 1.0,
          state: 'HIGH', // Default high
          reasons: [],
          lastUpdateTs: Date.now(),
        };
      }

      // Adjust
      if (hasMismatch) {
        confidence.score = Math.max(0, confidence.score - 0.2); // Decay fast
        if (confidence.score < 0.8) confidence.state = 'DEGRADED';
        if (confidence.score < 0.5) confidence.state = 'LOW'; // Changed from UNTRUSTED to match type
        if (!confidence.reasons.includes('Recent mismatch')) {
          confidence.reasons.push('Recent mismatch');
        }
      } else {
        confidence.score = Math.min(1.0, confidence.score + 0.01); // Recover slow
        if (confidence.score >= 0.8) confidence.state = 'HIGH';
        else if (confidence.score >= 0.5) confidence.state = 'DEGRADED';

        // Clear old reasons if healthy
        if (confidence.score === 1.0) {
          confidence.reasons = [];
        }
      }

      confidence.lastUpdateTs = Date.now();
      await this.truthRepository.updateConfidence(confidence);

      // Emit event
      this.currentConfidence = confidence.score;
    } catch (err) {
      logger.error('Failed to compute confidence', err as Error);
    }
  }

  async reconcile(exchange: string): Promise<ReconciliationReport> {
    const reconciliationId = uuidv4();
    const startTime = Date.now();
    const mismatches: MismatchDetail[] = [];
    let runId: number | undefined;

    // 1. Start Run
    if (this.truthRepository) {
      try {
        runId = await this.truthRepository.recordRun({
          scope: exchange,
          startedAt: startTime,
          success: false, // pending
        });
      } catch (e) {
        logger.error('Failed to start run record', e as Error);
      }
    }

    try {
      if (!this.executionClient || !this.executionClient.isConnected()) {
        throw new Error('Execution Client not connected');
      }

      const externalState = await this.executionClient.fetchExchangePositions(exchange);

      // Persist External Evidence
      await this.persistEvidence(exchange, 'EXCHANGE', externalState, runId);

      // Filter internal positions for this exchange
      const allPositions = this.positionManager.getPositions();
      const internalState = allPositions.filter((p) => p.exchange === exchange);

      // Persist Internal Evidence
      await this.persistEvidence(exchange, 'BRAIN', internalState, runId);

      // Compare logic
      this.compare(exchange, internalState, externalState, mismatches);

      const status = mismatches.length > 0 ? 'MISMATCH' : 'MATCH';

      const report: ReconciliationReport = {
        reconciliationId,
        type: 'BRAIN_VS_EXCHANGE',
        timestamp: startTime,
        exchange,
        status,
        mismatches,
      };

      // Update Confidence
      await this.computeConfidence(exchange, status === 'MISMATCH');

      // Persist event if mismatch
      if (status === 'MISMATCH') {
        this.handleDiscrepancy(exchange, report, runId);

        if (this.config.autoResolve) {
          await this.resolveMismatches(exchange, mismatches);
        }
      }

      logger.info(`[Reconciliation] ${exchange}: ${status} (${mismatches.length} mismatches)`);

      // 2. End Run
      if (this.truthRepository && runId) {
        await this.persistRun(
          {
            id: runId,
            scope: exchange,
            startedAt: startTime,
            finishedAt: Date.now(),
            success: status === 'MATCH',
            stats: {
              totalPositions: internalState.length,
              matchedPositions: internalState.length - mismatches.length,
              mismatchedPositions: mismatches.length,
              ghostPositions: mismatches.filter((m) => m.reason === 'GHOST_POSITION').length,
              untrackedPositions: mismatches.filter((m) => m.reason === 'UNTRACKED_POSITION')
                .length,
            },
          },
          'END',
        );
      }

      return report;
    } catch (error) {
      logger.error(`❌ Reconciliation failed for ${exchange}`, error as Error);

      // Fail Run
      if (this.truthRepository && runId) {
        await this.persistRun(
          {
            id: runId,
            scope: exchange,
            startedAt: startTime,
            finishedAt: Date.now(),
            success: false,
          },
          'END',
        );
      }

      const errorReport: ReconciliationReport = {
        reconciliationId,
        type: 'BRAIN_VS_EXCHANGE',
        timestamp: startTime,
        exchange,
        status: 'ERROR',
        mismatches: [],
      };
      return errorReport;
    }
  }

  private compare(
    exchange: string,
    internal: Position[],
    external: ExecutionPosition[],
    mismatches: MismatchDetail[],
  ): void {
    const internalMap = new Map(internal.map((p) => [`${p.symbol}:${p.side}`, p]));
    const externalMap = new Map(external.map((p) => [`${p.symbol}:${p.side}`, p]));

    // Check for Internal positions missing on Exchange (Ghost positions)
    for (const [key, internalPos] of internalMap) {
      if (!externalMap.has(key)) {
        // If it's effectively zero, ignore
        if ((internalPos.size || 0) <= 0.0001) continue;

        mismatches.push({
          symbol: internalPos.symbol,
          reason: 'GHOST_POSITION',
          brainParam: internalPos.size,
          exchangeParam: 0,
          severity: 'CRITICAL',
        });
      } else {
        // Compare sizes
        const externalPos = externalMap.get(key)!;
        if (Math.abs((internalPos.size || 0) - externalPos.size) > 0.0001) {
          mismatches.push({
            symbol: internalPos.symbol,
            reason: 'SIZE_MISMATCH',
            brainParam: internalPos.size,
            exchangeParam: externalPos.size,
            severity: 'WARNING',
          });
        }
      }
    }

    // Check for External positions missing in Brain (Untracked positions)
    for (const [key, externalPos] of externalMap) {
      // If it's effectively zero, ignore
      if (externalPos.size <= 0.0001) continue;

      if (!internalMap.has(key)) {
        mismatches.push({
          symbol: externalPos.symbol,
          reason: 'UNTRACKED_POSITION',
          brainParam: 0,
          exchangeParam: externalPos.size,
          severity: 'CRITICAL',
        });
      }
    }
  }

  private async resolveMismatches(exchange: string, mismatches: MismatchDetail[]): Promise<void> {
    logger.info(`🤖 Auto-resolving ${mismatches.length} mismatches on ${exchange}...`);

    for (const mismatch of mismatches) {
      try {
        if (!this.executionClient) {
          logger.warn('Cannot auto-resolve mismatch: Execution Client not connected');
          break;
        }

        if (mismatch.reason === 'GHOST_POSITION') {
          const size = Number(mismatch.brainParam);
          if (Math.abs(size) <= 0.0001) continue;

          logger.info(`Testing auto-resolution for GHOST_POSITION ${mismatch.symbol}`);

          // Create Intent to close the ghost position
          const side = size > 0 ? 'SELL' : 'BUY';

          // We send a RECONCILIATION intent.
          // This tells Execution Engine: "I think I have this position, but you say I don't. Please confirm size=0".
          const intent: any = {
            // Using any cast due to IntentSignal not updated in all files yet or circular dep
            signalId: uuidv4(),
            phaseId: 'phase1', // Defaulting to phase1 for admin actions
            symbol: mismatch.symbol,
            side,
            requestedSize: Math.abs(size),
            timestamp: Date.now(),
            exchange,
            type: 'RECONCILIATION',
            positionMode: 'ONE_WAY',
          };

          await this.executionClient.forwardSignal(intent, Math.abs(size));
          logger.info(`✅ Sent RECONCILIATION signal for ${mismatch.symbol}`);
        } else if (mismatch.reason === 'UNTRACKED_POSITION') {
          logger.warn(`⚠️ Skipping auto-close of UNTRACKED_POSITION ${mismatch.symbol} (safety)`);
        }
      } catch (err) {
        logger.error(`Failed to auto-resolve ${mismatch.symbol}`, err as Error);
      }
    }
  }

  private handleDiscrepancy(exchange: string, report: ReconciliationReport, runId?: number): void {
    logger.warn(`⚠️ RECONCILIATION DRIFT [${exchange}]: ${report.mismatches.length} issues found`);

    // Truth Layer Drift Record
    if (this.truthRepository && runId) {
      for (const mismatch of report.mismatches) {
        this.truthRepository
          .recordDrift({
            id: uuidv4(),
            runId,
            scope: exchange,
            driftType: mismatch.reason,
            severity: mismatch.severity,
            detectedAt: Date.now(),
            details: {
              symbol: mismatch.symbol,
              brainParam: mismatch.brainParam,
              exchangeParam: mismatch.exchangeParam,
            },
            recommendedAction: 'RESYNC',
          })
          .catch((err) => logger.error('Failed to record drift', err as Error));
      }
    }

    if (this.eventStore) {
      const event = {
        id: uuidv4(),
        type: EventType.RECONCILIATION_DRIFT_DETECTED,
        aggregateId: `recon-${exchange}-${Date.now()}`,
        payload: {
          exchange,
          mismatches: report.mismatches,
        },
        metadata: {
          traceId: uuidv4(),
          version: 1,
          timestamp: new Date(),
        },
      };

      this.eventStore
        .append(event)
        .catch((err: Error) => logger.error('Failed to emit drift event', err));
    }
  }
  private async reconcileBrainVsDb(): Promise<ReconciliationReport> {
    const reconciliationId = uuidv4();
    const startTime = Date.now();
    const mismatches: MismatchDetail[] = [];
    const exchange = 'DATABASE';

    try {
      // Get latest snapshot from DB
      const snapshot = await this.positionRepository!.getLatest();
      const dbPositions = snapshot ? snapshot.positions : [];

      // Get current internal positions
      const internalPositions = this.positionManager.getPositions();

      // Compare Brain (Internal) vs DB (Snapshot)
      // We treat DB as "External" here for comparison logic
      // Note: DB snapshot might be slightly lagging (up to 1 min), so we should be lenient or expect matches

      // Map by symbol:side
      const internalMap = new Map(internalPositions.map((p) => [`${p.symbol}:${p.side}`, p]));
      const dbMap = new Map(dbPositions.map((p) => [`${p.symbol}:${p.side}`, p]));

      // 1. Check positions in Brain but missing in DB (New positions since last snapshot)
      // This is expected if trading is active. We might log INFO but not CRITICAL unless large divergence.
      for (const [key, internalPos] of internalMap) {
        if (!dbMap.has(key)) {
          if ((internalPos.size || 0) <= 0.0001) continue;
          // Only warn if significant time passed since last snapshot?
          // For now, let's treat as WARNING
          mismatches.push({
            symbol: internalPos.symbol,
            reason: 'MISSING_IN_DB_SNAPSHOT',
            brainParam: internalPos.size,
            exchangeParam: 0,
            severity: 'INFO',
          });
        } else {
          const dbPos = dbMap.get(key)!;
          if (Math.abs((internalPos.size || 0) - dbPos.size) > 0.0001) {
            mismatches.push({
              symbol: internalPos.symbol,
              reason: 'DB_SIZE_MISMATCH',
              brainParam: internalPos.size,
              exchangeParam: dbPos.size,
              severity: 'INFO', // Likely due to recent fills
            });
          }
        }
      }

      // 2. Check positions in DB but missing in Brain (Data Loss? Restart?)
      // This is CRITICAL. If DB has it but Brain doesn't, Brain might have lost state.
      for (const [key, dbPos] of dbMap) {
        if (dbPos.size <= 0.0001) continue;

        if (!internalMap.has(key)) {
          mismatches.push({
            symbol: dbPos.symbol,
            reason: 'BRAIN_STATE_LOSS',
            brainParam: 0,
            exchangeParam: dbPos.size, // DB size
            severity: 'CRITICAL',
          });
        }
      }

      const status = mismatches.some((m) => m.severity === 'CRITICAL') ? 'MISMATCH' : 'MATCH'; // INFO warnings don't trigger MISMATCH status effectively

      const report: ReconciliationReport = {
        reconciliationId,
        type: 'BRAIN_VS_DB',
        timestamp: startTime,
        exchange,
        status: status as 'MATCH' | 'MISMATCH', // Cast to match type
        mismatches,
      };

      if (status === 'MISMATCH') {
        this.handleDiscrepancy(exchange, report);
      }

      logger.info(`[Reconciliation] ${exchange}: ${status} (${mismatches.length} items)`);
      return report;
    } catch (error) {
      logger.error(`❌ Reconciliation failed for ${exchange}`, error as Error);
      const errorReport: ReconciliationReport = {
        reconciliationId,
        type: 'BRAIN_VS_DB',
        timestamp: startTime,
        exchange,
        status: 'ERROR',
        mismatches: [],
      };
      return errorReport;
    }
  }
}
