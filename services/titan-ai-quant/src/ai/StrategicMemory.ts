/**
 * Strategic Memory - SQLite Storage
 * Persists learned insights and tracks configuration version performance.
 * Implementation: Task 3 | Requirements: 1.4, 1.5, 4.6
 *
 * Enhanced with transaction safety and error handling (Task 15)
 */
import Database from 'better-sqlite3';
import { Insight, OptimizationProposal } from '../types/index.js';
import { ErrorCode, logError, TitanError, withRetry } from '../utils/ErrorHandler.js';
import * as fs from 'fs';
import * as path from 'path';

export interface PerformanceMetrics {
  totalTrades: number;
  winRate: number;
  avgPnl: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

export interface PerformanceDelta {
  pnlDelta: number;
  winRateDelta: number;
  drawdownDelta: number;
}

interface InsightRow {
  id: number;
  timestamp: number;
  topic: string;
  text: string;
  confidence: number;
  affected_symbols: string | null;
  affected_traps: string | null;
  regime_context: string | null;
  metadata: string | null;
}
interface ProposalRow {
  id: number;
  created_at: number;
  insight_id: number | null;
  target_key: string;
  current_value: string;
  suggested_value: string;
  reasoning: string;
  expected_impact: string;
  validation_report: string | null;
  status: string;
}
interface ConfigVersionRow {
  id: number;
  version_tag: string;
  config_json: string;
  applied_at: number;
  proposal_id: number | null;
}
interface PerformanceRow {
  total_trades: number;
  win_rate: number;
  avg_pnl: number;
  max_drawdown: number;
  sharpe_ratio: number;
}

export class StrategicMemory {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;

    // Ensure directory exists if not using memory database
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Enable WAL for better concurrency
    this.db.pragma('busy_timeout = 5000'); // Wait up to 5s if database is locked
    this.initializeSchema();
  }

  /**
   * Execute a function within a transaction with automatic rollback on error
   * Provides transaction safety for SQLite operations (Task 15)
   */
  private withTransaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    try {
      return transaction();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(
        new TitanError(ErrorCode.DB_TRANSACTION_FAILED, `Transaction failed: ${message}`, {
          dbPath: this.dbPath,
        }),
      );
      throw error;
    }
  }

  /**
   * Execute a database operation with retry logic for SQLITE_BUSY errors
   */
  private async withDbRetry<T>(fn: () => T): Promise<T> {
    return withRetry(
      async () => fn(),
      { maxRetries: 3, initialDelayMs: 100, multiplier: 2 },
      (error) => {
        if (error instanceof Error) {
          return error.message.toLowerCase().includes('sqlite_busy');
        }
        return false;
      },
    );
  }
  private initializeSchema(): void {
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS strategic_insights (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL, topic TEXT NOT NULL, insight_text TEXT NOT NULL, confidence REAL NOT NULL, affected_symbols TEXT, affected_traps TEXT, regime_context TEXT, metadata TEXT, created_at INTEGER DEFAULT (strftime('%s', 'now')));
CREATE TABLE IF NOT EXISTS config_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, version_tag TEXT UNIQUE NOT NULL, config_json TEXT NOT NULL, applied_at INTEGER NOT NULL, proposal_id INTEGER);
CREATE TABLE IF NOT EXISTS optimization_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER DEFAULT (strftime('%s', 'now')), insight_id INTEGER, target_key TEXT NOT NULL, current_value TEXT NOT NULL, suggested_value TEXT NOT NULL, reasoning TEXT NOT NULL, expected_impact TEXT NOT NULL, validation_report TEXT, status TEXT CHECK(status IN ('pending', 'approved', 'rejected', 'applied')) DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS performance_tracking (id INTEGER PRIMARY KEY AUTOINCREMENT, config_version_tag TEXT NOT NULL, measurement_window_start INTEGER NOT NULL, measurement_window_end INTEGER NOT NULL, total_trades INTEGER, win_rate REAL, avg_pnl REAL, max_drawdown REAL, sharpe_ratio REAL, created_at INTEGER DEFAULT (strftime('%s', 'now')));
CREATE INDEX IF NOT EXISTS idx_insights_timestamp ON strategic_insights(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON optimization_proposals(status);
CREATE INDEX IF NOT EXISTS idx_performance_version ON performance_tracking(config_version_tag);`,
    );
  }
  async storeInsight(topic: string, text: string, confidence: number): Promise<number> {
    return this.withDbRetry(() => {
      return this.withTransaction(() => {
        const stmt = this.db.prepare(
          'INSERT INTO strategic_insights (timestamp, topic, insight_text, confidence) VALUES (?, ?, ?, ?)',
        );
        return stmt.run(Date.now(), topic, text, confidence).lastInsertRowid as number;
      });
    });
  }

  async storeInsightFull(insight: Insight): Promise<number> {
    return this.withDbRetry(() => {
      return this.withTransaction(() => {
        const stmt = this.db.prepare(
          'INSERT INTO strategic_insights (timestamp, topic, insight_text, confidence, affected_symbols, affected_traps, regime_context, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        );
        return stmt.run(
          insight.timestamp ?? Date.now(),
          insight.topic,
          insight.text,
          insight.confidence,
          insight.affectedSymbols ? JSON.stringify(insight.affectedSymbols) : null,
          insight.affectedTraps ? JSON.stringify(insight.affectedTraps) : null,
          insight.regimeContext ?? null,
          insight.metadata ? JSON.stringify(insight.metadata) : null,
        ).lastInsertRowid as number;
      });
    });
  }

  async getRecentInsights(limit: number = 10): Promise<Insight[]> {
    const rows = this.db
      .prepare(
        'SELECT id, timestamp, topic, insight_text as text, confidence, affected_symbols, affected_traps, regime_context, metadata FROM strategic_insights ORDER BY timestamp DESC LIMIT ?',
      )
      .all(limit) as InsightRow[];
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      topic: r.topic,
      text: r.text,
      confidence: r.confidence,
      affectedSymbols: r.affected_symbols ? JSON.parse(r.affected_symbols) : undefined,
      affectedTraps: r.affected_traps ? JSON.parse(r.affected_traps) : undefined,
      regimeContext: r.regime_context ?? undefined,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }
  async getInsight(id: number): Promise<Insight | null> {
    const r = this.db
      .prepare(
        'SELECT id, timestamp, topic, insight_text as text, confidence, affected_symbols, affected_traps, regime_context, metadata FROM strategic_insights WHERE id = ?',
      )
      .get(id) as InsightRow | undefined;
    if (!r) return null;
    return {
      id: r.id,
      timestamp: r.timestamp,
      topic: r.topic,
      text: r.text,
      confidence: r.confidence,
      affectedSymbols: r.affected_symbols ? JSON.parse(r.affected_symbols) : undefined,
      affectedTraps: r.affected_traps ? JSON.parse(r.affected_traps) : undefined,
      regimeContext: r.regime_context ?? undefined,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    };
  }
  async storeProposal(proposal: OptimizationProposal): Promise<number> {
    return this.withDbRetry(() => {
      return this.withTransaction(() => {
        const stmt = this.db.prepare(
          'INSERT INTO optimization_proposals (insight_id, target_key, current_value, suggested_value, reasoning, expected_impact, validation_report, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        );
        return stmt.run(
          proposal.insightId ?? null,
          proposal.targetKey,
          JSON.stringify(proposal.currentValue),
          JSON.stringify(proposal.suggestedValue),
          proposal.reasoning,
          JSON.stringify(proposal.expectedImpact),
          proposal.validationReport ? JSON.stringify(proposal.validationReport) : null,
          proposal.status ?? 'pending',
        ).lastInsertRowid as number;
      });
    });
  }
  async getProposal(id: number): Promise<OptimizationProposal | null> {
    const r = this.db
      .prepare(
        'SELECT id, created_at, insight_id, target_key, current_value, suggested_value, reasoning, expected_impact, validation_report, status FROM optimization_proposals WHERE id = ?',
      )
      .get(id) as ProposalRow | undefined;
    if (!r) return null;
    return {
      id: r.id,
      createdAt: r.created_at,
      insightId: r.insight_id ?? undefined,
      targetKey: r.target_key,
      currentValue: JSON.parse(r.current_value),
      suggestedValue: JSON.parse(r.suggested_value),
      reasoning: r.reasoning,
      expectedImpact: JSON.parse(r.expected_impact),
      validationReport: r.validation_report ? JSON.parse(r.validation_report) : undefined,
      status: r.status as OptimizationProposal['status'],
    };
  }
  async updateProposalStatus(id: number, status: OptimizationProposal['status']): Promise<void> {
    await this.withDbRetry(() => {
      this.withTransaction(() => {
        this.db
          .prepare('UPDATE optimization_proposals SET status = ? WHERE id = ?')
          .run(status, id);
      });
    });
  }
  async getPendingProposals(): Promise<OptimizationProposal[]> {
    const rows = this.db
      .prepare(
        'SELECT id, created_at, insight_id, target_key, current_value, suggested_value, reasoning, expected_impact, validation_report, status FROM optimization_proposals WHERE status = ? ORDER BY created_at DESC',
      )
      .all('pending') as ProposalRow[];
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      insightId: r.insight_id ?? undefined,
      targetKey: r.target_key,
      currentValue: JSON.parse(r.current_value),
      suggestedValue: JSON.parse(r.suggested_value),
      reasoning: r.reasoning,
      expectedImpact: JSON.parse(r.expected_impact),
      validationReport: r.validation_report ? JSON.parse(r.validation_report) : undefined,
      status: r.status as OptimizationProposal['status'],
    }));
  }
  async tagConfigVersion(
    versionTag: string,
    configJson: string,
    proposalId: number,
  ): Promise<void> {
    await this.withDbRetry(() => {
      this.withTransaction(() => {
        // Insert config version and update proposal status atomically
        this.db
          .prepare(
            'INSERT INTO config_versions (version_tag, config_json, applied_at, proposal_id) VALUES (?, ?, ?, ?)',
          )
          .run(versionTag, configJson, Date.now(), proposalId);
        this.db
          .prepare('UPDATE optimization_proposals SET status = ? WHERE id = ?')
          .run('applied', proposalId);
      });
    });
  }
  async getConfigVersion(versionTag: string): Promise<{
    id: number;
    versionTag: string;
    configJson: string;
    appliedAt: number;
    proposalId: number | null;
  } | null> {
    const r = this.db
      .prepare(
        'SELECT id, version_tag, config_json, applied_at, proposal_id FROM config_versions WHERE version_tag = ?',
      )
      .get(versionTag) as ConfigVersionRow | undefined;
    if (!r) return null;
    return {
      id: r.id,
      versionTag: r.version_tag,
      configJson: r.config_json,
      appliedAt: r.applied_at,
      proposalId: r.proposal_id,
    };
  }
  async trackPerformance(versionTag: string, metrics: PerformanceMetrics): Promise<void> {
    await this.withDbRetry(() => {
      this.withTransaction(() => {
        const now = Date.now();
        this.db
          .prepare(
            'INSERT INTO performance_tracking (config_version_tag, measurement_window_start, measurement_window_end, total_trades, win_rate, avg_pnl, max_drawdown, sharpe_ratio) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            versionTag,
            now,
            now,
            metrics.totalTrades,
            metrics.winRate,
            metrics.avgPnl,
            metrics.maxDrawdown,
            metrics.sharpeRatio,
          );
      });
    });
  }
  async getLatestPerformance(versionTag: string): Promise<PerformanceMetrics | null> {
    const r = this.db
      .prepare(
        'SELECT total_trades, win_rate, avg_pnl, max_drawdown, sharpe_ratio FROM performance_tracking WHERE config_version_tag = ? ORDER BY created_at DESC LIMIT 1',
      )
      .get(versionTag) as PerformanceRow | undefined;
    if (!r) return null;
    return {
      totalTrades: r.total_trades,
      winRate: r.win_rate,
      avgPnl: r.avg_pnl,
      maxDrawdown: r.max_drawdown,
      sharpeRatio: r.sharpe_ratio,
    };
  }
  async getPerformanceDelta(oldTag: string, newTag: string): Promise<PerformanceDelta> {
    const oldPerf = await this.getLatestPerformance(oldTag);
    const newPerf = await this.getLatestPerformance(newTag);
    if (!oldPerf || !newPerf) {
      return { pnlDelta: 0, winRateDelta: 0, drawdownDelta: 0 };
    }
    return {
      pnlDelta: newPerf.avgPnl - oldPerf.avgPnl,
      winRateDelta: newPerf.winRate - oldPerf.winRate,
      drawdownDelta: newPerf.maxDrawdown - oldPerf.maxDrawdown,
    };
  }
  async getInsightCount(): Promise<number> {
    return (
      this.db.prepare('SELECT COUNT(*) as count FROM strategic_insights').get() as { count: number }
    ).count;
  }
  close(): void {
    this.db.close();
  }
}
