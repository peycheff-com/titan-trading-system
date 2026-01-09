/**
 * Titan Configuration Versioning System
 * 
 * Tracks configuration changes with version tags, links trades to config versions,
 * calculates performance deltas, and supports rollback to previous versions.
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class ConfigVersioning extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      performanceTrackingDays: options.performanceTrackingDays || 7,
      ...options
    };
    
    this.databaseManager = null;
    this.configManager = null;
    this.logger = options.logger || console;
    this.currentVersionTag = null;
  }

  /**
   * Initialize with dependencies
   */
  initialize(dependencies) {
    this.databaseManager = dependencies.databaseManager;
    this.configManager = dependencies.configManager;
    this.log('info', 'Config Versioning initialized');
  }

  /**
   * Create a new config version
   */
  async createVersion(config, changeSummary, changedBy = 'system') {
    const versionTag = this.generateVersionTag(changeSummary);
    const configJson = JSON.stringify(config, null, 2);
    
    try {
      // Deactivate current active version
      if (this.databaseManager) {
        await this.databaseManager.run(
          'UPDATE config_versions SET is_active = 0 WHERE is_active = 1'
        );
        
        // Insert new version
        await this.databaseManager.run(`
          INSERT INTO config_versions (version_tag, config_json, change_summary, changed_by, is_active)
          VALUES (?, ?, ?, ?, 1)
        `, [versionTag, configJson, changeSummary, changedBy]);
        
        // Update system_state with current version tag
        await this.databaseManager.run(
          'UPDATE system_state SET config_version_tag = ? WHERE id = 1',
          [versionTag]
        );
      }
      
      this.currentVersionTag = versionTag;
      
      this.log('info', `Created config version: ${versionTag}`, { changeSummary, changedBy });
      
      this.emit('versionCreated', { versionTag, changeSummary, changedBy });
      
      return {
        success: true,
        versionTag,
        changeSummary
      };
      
    } catch (error) {
      this.log('error', `Failed to create config version: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate version tag (timestamp + hash of change summary)
   */
  generateVersionTag(changeSummary) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const hash = crypto
      .createHash('md5')
      .update(changeSummary + Date.now())
      .digest('hex')
      .substring(0, 8);
    
    return `v${timestamp}-${hash}`;
  }

  /**
   * Get current active config version
   */
  async getCurrentVersion() {
    if (!this.databaseManager) {
      return null;
    }
    
    const row = await this.databaseManager.get(
      'SELECT * FROM config_versions WHERE is_active = 1'
    );
    
    if (row) {
      return {
        versionTag: row.version_tag,
        config: JSON.parse(row.config_json),
        changeSummary: row.change_summary,
        changedBy: row.changed_by,
        tradesCount: row.trades_count,
        totalPnl: row.total_pnl,
        winRate: row.win_rate,
        sharpeRatio: row.sharpe_ratio,
        maxDrawdown: row.max_drawdown,
        createdAt: row.created_at
      };
    }
    
    return null;
  }

  /**
   * Get version history
   */
  async getVersionHistory(limit = 10) {
    if (!this.databaseManager) {
      return [];
    }
    
    const rows = await this.databaseManager.all(`
      SELECT * FROM config_versions
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);
    
    return rows.map(row => ({
      versionTag: row.version_tag,
      changeSummary: row.change_summary,
      changedBy: row.changed_by,
      isActive: row.is_active === 1,
      tradesCount: row.trades_count,
      totalPnl: row.total_pnl,
      winRate: row.win_rate,
      sharpeRatio: row.sharpe_ratio,
      maxDrawdown: row.max_drawdown,
      rolledBackFrom: row.rolled_back_from,
      createdAt: row.created_at
    }));
  }

  /**
   * Rollback to a previous config version
   */
  async rollback(targetVersionTag, confirmedBy = 'system') {
    if (!this.databaseManager) {
      return { success: false, error: 'Database not available' };
    }
    
    try {
      // Get target version
      const targetVersion = await this.databaseManager.get(
        'SELECT * FROM config_versions WHERE version_tag = ?',
        [targetVersionTag]
      );
      
      if (!targetVersion) {
        return { success: false, error: 'Version not found' };
      }
      
      // Get current version tag
      const currentVersion = await this.getCurrentVersion();
      const oldVersionTag = currentVersion?.versionTag;
      
      // Create new version with rollback marker
      const rollbackSummary = `Rollback from ${oldVersionTag} to ${targetVersionTag}`;
      const newVersionTag = this.generateVersionTag(rollbackSummary);
      
      // Deactivate current version
      await this.databaseManager.run(
        'UPDATE config_versions SET is_active = 0 WHERE is_active = 1'
      );
      
      // Insert rollback version
      await this.databaseManager.run(`
        INSERT INTO config_versions (version_tag, config_json, change_summary, changed_by, is_active, rolled_back_from)
        VALUES (?, ?, ?, ?, 1, ?)
      `, [newVersionTag, targetVersion.config_json, rollbackSummary, confirmedBy, oldVersionTag]);
      
      // Update system_state
      await this.databaseManager.run(
        'UPDATE system_state SET config_version_tag = ? WHERE id = 1',
        [newVersionTag]
      );
      
      // Apply config to ConfigManager
      if (this.configManager) {
        const config = JSON.parse(targetVersion.config_json);
        await this.configManager.updateConfig(config);
      }
      
      this.currentVersionTag = newVersionTag;
      
      // Log system event
      await this.logSystemEvent('CONFIG_ROLLBACK', 'warn', {
        message: rollbackSummary,
        oldVersionTag,
        targetVersionTag,
        newVersionTag,
        confirmedBy
      });
      
      this.log('warn', `Config rolled back: ${rollbackSummary}`);
      
      this.emit('rollback', {
        oldVersionTag,
        targetVersionTag,
        newVersionTag,
        confirmedBy
      });
      
      return {
        success: true,
        oldVersionTag,
        newVersionTag,
        config: JSON.parse(targetVersion.config_json)
      };
      
    } catch (error) {
      this.log('error', `Rollback failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Link a trade to the current config version
   */
  async linkTradeToVersion(signalId) {
    if (!this.databaseManager || !this.currentVersionTag) {
      return;
    }
    
    await this.databaseManager.run(
      'UPDATE trade_history SET config_version_tag = ? WHERE signal_id = ?',
      [this.currentVersionTag, signalId]
    );
  }

  /**
   * Calculate performance for a config version
   */
  async calculateVersionPerformance(versionTag) {
    if (!this.databaseManager) {
      return null;
    }
    
    const stats = await this.databaseManager.get(`
      SELECT 
        COUNT(*) as trades_count,
        SUM(realized_pnl) as total_pnl,
        AVG(CASE WHEN win = 1 THEN 1.0 ELSE 0.0 END) * 100 as win_rate,
        AVG(r_multiple) as avg_r_multiple
      FROM trade_history
      WHERE config_version_tag = ? AND status = 'closed'
    `, [versionTag]);
    
    // Calculate Sharpe ratio (simplified)
    const trades = await this.databaseManager.all(`
      SELECT realized_pnl FROM trade_history
      WHERE config_version_tag = ? AND status = 'closed'
    `, [versionTag]);
    
    let sharpeRatio = null;
    let maxDrawdown = null;
    
    if (trades.length > 1) {
      const returns = trades.map(t => t.realized_pnl);
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const stdDev = Math.sqrt(
        returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      );
      
      if (stdDev > 0) {
        sharpeRatio = (avgReturn / stdDev) * Math.sqrt(252); // Annualized
      }
      
      // Calculate max drawdown
      let peak = 0;
      let maxDd = 0;
      let cumulative = 0;
      
      for (const trade of trades) {
        cumulative += trade.realized_pnl;
        if (cumulative > peak) peak = cumulative;
        const dd = (peak - cumulative) / Math.max(peak, 1);
        if (dd > maxDd) maxDd = dd;
      }
      
      maxDrawdown = maxDd;
    }
    
    // Update version record
    await this.databaseManager.run(`
      UPDATE config_versions SET
        trades_count = ?,
        total_pnl = ?,
        win_rate = ?,
        sharpe_ratio = ?,
        max_drawdown = ?
      WHERE version_tag = ?
    `, [
      stats.trades_count || 0,
      stats.total_pnl || 0,
      stats.win_rate || 0,
      sharpeRatio,
      maxDrawdown,
      versionTag
    ]);
    
    return {
      tradesCount: stats.trades_count || 0,
      totalPnl: stats.total_pnl || 0,
      winRate: stats.win_rate || 0,
      avgRMultiple: stats.avg_r_multiple || 0,
      sharpeRatio,
      maxDrawdown
    };
  }

  /**
   * Calculate performance delta between two versions
   */
  async calculatePerformanceDelta(oldVersionTag, newVersionTag) {
    const oldPerf = await this.calculateVersionPerformance(oldVersionTag);
    const newPerf = await this.calculateVersionPerformance(newVersionTag);
    
    if (!oldPerf || !newPerf) {
      return null;
    }
    
    return {
      pnlDelta: newPerf.totalPnl - oldPerf.totalPnl,
      winRateDelta: newPerf.winRate - oldPerf.winRate,
      sharpeDelta: (newPerf.sharpeRatio || 0) - (oldPerf.sharpeRatio || 0),
      drawdownDelta: (newPerf.maxDrawdown || 0) - (oldPerf.maxDrawdown || 0)
    };
  }

  /**
   * Update performance delta for strategic insights
   */
  async updateInsightPerformance(insightId, performanceDelta) {
    if (!this.databaseManager) {
      return;
    }
    
    await this.databaseManager.run(`
      UPDATE strategic_insights SET
        performance_delta = ?,
        performance_measured_at = datetime('now')
      WHERE id = ?
    `, [performanceDelta, insightId]);
  }

  /**
   * Log system event
   */
  async logSystemEvent(eventType, severity, context) {
    if (this.databaseManager) {
      try {
        await this.databaseManager.run(`
          INSERT INTO system_events (event_type, severity, service, message, context)
          VALUES (?, ?, 'core', ?, ?)
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
      service: 'config-versioning',
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

module.exports = ConfigVersioning;
