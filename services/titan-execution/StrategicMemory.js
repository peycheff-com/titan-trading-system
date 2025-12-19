/**
 * Titan Strategic Memory
 * 
 * Persists AI Quant insights, handles duplicate detection,
 * tracks performance of applied proposals, and archives old records.
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';

class StrategicMemory extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxRecords: options.maxRecords || 10000,
      archiveAfterDays: options.archiveAfterDays || 90,
      duplicateWindowDays: options.duplicateWindowDays || 30,
      performanceTrackingDays: options.performanceTrackingDays || 7,
      contextLimit: options.contextLimit || 10,
      ...options
    };
    
    this.databaseManager = null;
    this.logger = options.logger || console;
  }

  /**
   * Initialize with dependencies
   */
  initialize(dependencies) {
    this.databaseManager = dependencies.databaseManager;
    this.log('info', 'Strategic Memory initialized');
  }

  /**
   * Store a new insight
   */
  async storeInsight(insight) {
    if (!this.databaseManager) {
      throw new Error('Database not available');
    }
    
    const contentHash = this.hashContent(insight);
    
    // Check for duplicates
    const isDuplicate = await this.checkDuplicate(contentHash);
    if (isDuplicate) {
      this.log('info', `Duplicate insight detected: ${insight.topic}`);
      await this.logSystemEvent('DUPLICATE_INSIGHT', 'info', {
        message: `Duplicate insight: ${insight.topic}`,
        contentHash
      });
      return { stored: false, reason: 'duplicate' };
    }
    
    // Store insight
    const result = await this.databaseManager.run(`
      INSERT INTO strategic_insights (
        insight_type, topic, insight_text, confidence_score,
        old_config, new_config, projected_pnl_improvement, risk_impact,
        content_hash, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      insight.type || 'observation',
      insight.topic,
      insight.text || insight.description,
      insight.confidence || 0.5,
      insight.oldConfig ? JSON.stringify(insight.oldConfig) : null,
      insight.newConfig ? JSON.stringify(insight.newConfig) : null,
      insight.projectedImprovement || null,
      insight.riskImpact || null,
      contentHash,
      insight.expiresAt || null
    ]);
    
    this.log('info', `Stored insight: ${insight.topic}`);
    
    // Check if archival is needed
    await this.checkArchivalNeeded();
    
    this.emit('insightStored', { id: result.lastID, insight });
    
    return { stored: true, id: result.lastID };
  }

  /**
   * Get recent insights for context
   */
  async getRecentContext(limit = null) {
    if (!this.databaseManager) {
      return [];
    }
    
    const contextLimit = limit || this.options.contextLimit;
    
    const rows = await this.databaseManager.all(`
      SELECT * FROM strategic_insights
      WHERE insight_type IN ('observation', 'pattern', 'proposal')
      ORDER BY created_at DESC
      LIMIT ?
    `, [contextLimit]);
    
    return rows.map(row => ({
      id: row.id,
      type: row.insight_type,
      topic: row.topic,
      text: row.insight_text,
      confidence: row.confidence_score,
      applied: row.applied_to_config === 1,
      performanceDelta: row.performance_delta,
      createdAt: row.created_at
    }));
  }

  /**
   * Get unread morning briefing
   */
  async getUnreadBriefing() {
    if (!this.databaseManager) {
      return null;
    }
    
    const row = await this.databaseManager.get(`
      SELECT * FROM strategic_insights
      WHERE insight_type = 'briefing' AND reviewed = 0
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    if (row) {
      return {
        id: row.id,
        topic: row.topic,
        content: JSON.parse(row.insight_text),
        createdAt: row.created_at
      };
    }
    
    return null;
  }

  /**
   * Get pending proposals (unreviewed)
   */
  async getPendingProposals() {
    if (!this.databaseManager) {
      return [];
    }
    
    const rows = await this.databaseManager.all(`
      SELECT * FROM strategic_insights
      WHERE insight_type = 'proposal' AND reviewed = 0
      ORDER BY confidence_score DESC, created_at DESC
    `);
    
    return rows.map(row => ({
      id: row.id,
      topic: row.topic,
      description: row.insight_text,
      confidence: row.confidence_score,
      oldConfig: row.old_config ? JSON.parse(row.old_config) : null,
      newConfig: row.new_config ? JSON.parse(row.new_config) : null,
      projectedImprovement: row.projected_pnl_improvement,
      riskImpact: row.risk_impact,
      createdAt: row.created_at
    }));
  }

  /**
   * Mark proposal as reviewed (approved or rejected)
   */
  async reviewProposal(proposalId, approved, rejectionReason = null) {
    if (!this.databaseManager) {
      throw new Error('Database not available');
    }
    
    await this.databaseManager.run(`
      UPDATE strategic_insights SET
        reviewed = 1,
        reviewed_at = datetime('now'),
        approved = ?,
        rejection_reason = ?
      WHERE id = ?
    `, [approved ? 1 : 0, rejectionReason, proposalId]);
    
    this.log('info', `Proposal ${proposalId} ${approved ? 'approved' : 'rejected'}`);
    
    this.emit('proposalReviewed', { proposalId, approved, rejectionReason });
    
    return { success: true };
  }

  /**
   * Mark proposal as applied to config
   */
  async markAsApplied(proposalId) {
    if (!this.databaseManager) {
      throw new Error('Database not available');
    }
    
    await this.databaseManager.run(`
      UPDATE strategic_insights SET
        applied_to_config = 1,
        applied_at = datetime('now')
      WHERE id = ?
    `, [proposalId]);
    
    this.log('info', `Proposal ${proposalId} marked as applied`);
    
    // Schedule performance tracking
    this.schedulePerformanceTracking(proposalId);
    
    return { success: true };
  }

  /**
   * Schedule performance tracking for applied proposal
   */
  schedulePerformanceTracking(proposalId) {
    const trackingDelay = this.options.performanceTrackingDays * 24 * 60 * 60 * 1000;
    
    setTimeout(async () => {
      await this.trackPerformance(proposalId);
    }, trackingDelay);
    
    this.log('info', `Performance tracking scheduled for proposal ${proposalId} in ${this.options.performanceTrackingDays} days`);
  }

  /**
   * Track performance of applied proposal
   */
  async trackPerformance(proposalId) {
    if (!this.databaseManager) {
      return;
    }
    
    try {
      // Get proposal details
      const proposal = await this.databaseManager.get(
        'SELECT * FROM strategic_insights WHERE id = ?',
        [proposalId]
      );
      
      if (!proposal || !proposal.applied_at) {
        return;
      }
      
      // Calculate performance since application
      const stats = await this.databaseManager.get(`
        SELECT 
          SUM(realized_pnl) as total_pnl,
          COUNT(*) as trade_count,
          AVG(CASE WHEN win = 1 THEN 1.0 ELSE 0.0 END) as win_rate
        FROM trade_history
        WHERE created_at >= ? AND status = 'closed'
      `, [proposal.applied_at]);
      
      // Calculate performance delta (simplified)
      const performanceDelta = stats.total_pnl || 0;
      
      // Update proposal with performance data
      await this.databaseManager.run(`
        UPDATE strategic_insights SET
          performance_delta = ?,
          performance_measured_at = datetime('now')
        WHERE id = ?
      `, [performanceDelta, proposalId]);
      
      this.log('info', `Performance tracked for proposal ${proposalId}: $${performanceDelta.toFixed(2)}`);
      
      this.emit('performanceTracked', { proposalId, performanceDelta });
      
    } catch (error) {
      this.log('error', `Failed to track performance for proposal ${proposalId}: ${error.message}`);
    }
  }

  /**
   * Check for duplicate content
   */
  async checkDuplicate(contentHash) {
    if (!this.databaseManager) {
      return false;
    }
    
    const cutoff = new Date(Date.now() - this.options.duplicateWindowDays * 24 * 60 * 60 * 1000).toISOString();
    
    const existing = await this.databaseManager.get(`
      SELECT id FROM strategic_insights
      WHERE content_hash = ? AND created_at >= ?
    `, [contentHash, cutoff]);
    
    return !!existing;
  }

  /**
   * Hash content for duplicate detection
   */
  hashContent(insight) {
    const content = JSON.stringify({
      topic: insight.topic,
      newConfig: insight.newConfig
    });
    
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Check if archival is needed
   */
  async checkArchivalNeeded() {
    if (!this.databaseManager) {
      return;
    }
    
    const count = await this.databaseManager.get(
      'SELECT COUNT(*) as count FROM strategic_insights'
    );
    
    if (count.count > this.options.maxRecords) {
      await this.archiveOldRecords();
    }
  }

  /**
   * Archive old records
   */
  async archiveOldRecords() {
    if (!this.databaseManager) {
      return;
    }
    
    const cutoff = new Date(Date.now() - this.options.archiveAfterDays * 24 * 60 * 60 * 1000).toISOString();
    
    // Move old records to archive table
    await this.databaseManager.run(`
      INSERT INTO strategic_insights_archive
      SELECT *, datetime('now') as archived_at
      FROM strategic_insights
      WHERE created_at < ?
    `, [cutoff]);
    
    // Delete archived records from main table
    const result = await this.databaseManager.run(`
      DELETE FROM strategic_insights
      WHERE created_at < ?
    `, [cutoff]);
    
    this.log('info', `Archived ${result.changes} old records`);
    
    this.emit('recordsArchived', { count: result.changes });
  }

  /**
   * Get insight statistics
   */
  async getStatistics() {
    if (!this.databaseManager) {
      return null;
    }
    
    const stats = await this.databaseManager.get(`
      SELECT 
        COUNT(*) as total_insights,
        SUM(CASE WHEN insight_type = 'proposal' THEN 1 ELSE 0 END) as total_proposals,
        SUM(CASE WHEN applied_to_config = 1 THEN 1 ELSE 0 END) as applied_proposals,
        SUM(CASE WHEN approved = 1 THEN 1 ELSE 0 END) as approved_proposals,
        SUM(CASE WHEN approved = 0 AND reviewed = 1 THEN 1 ELSE 0 END) as rejected_proposals,
        AVG(CASE WHEN performance_delta IS NOT NULL THEN performance_delta ELSE NULL END) as avg_performance_delta
      FROM strategic_insights
    `);
    
    return {
      totalInsights: stats.total_insights,
      totalProposals: stats.total_proposals,
      appliedProposals: stats.applied_proposals,
      approvedProposals: stats.approved_proposals,
      rejectedProposals: stats.rejected_proposals,
      avgPerformanceDelta: stats.avg_performance_delta,
      approvalRate: stats.total_proposals > 0 
        ? (stats.approved_proposals / stats.total_proposals) * 100 
        : 0
    };
  }

  /**
   * Mark briefing as read
   */
  async markBriefingRead(briefingId) {
    if (!this.databaseManager) {
      return;
    }
    
    await this.databaseManager.run(`
      UPDATE strategic_insights SET
        reviewed = 1,
        reviewed_at = datetime('now')
      WHERE id = ?
    `, [briefingId]);
    
    this.log('info', `Briefing ${briefingId} marked as read`);
  }

  /**
   * Log system event
   */
  async logSystemEvent(eventType, severity, context) {
    if (this.databaseManager) {
      try {
        await this.databaseManager.run(`
          INSERT INTO system_events (event_type, severity, service, message, context)
          VALUES (?, ?, 'strategic-memory', ?, ?)
        `, [eventType, severity, context.message, JSON.stringify(context)]);
      } catch (error) {
        this.log('error', `Failed to log system event: ${error.message}`);
      }
    }
  }

  /**
   * Logging helper
   */
  log(level, message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'strategic-memory',
      level,
      message,
      ...context
    };
    
    if (this.logger && typeof this.logger.log === 'function') {
      this.logger.log(level, message, context);
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }
}

export default StrategicMemory;
